"""Step 7 — Illustrative Nineveh locations for the community gallery.

The team's photos were all taken at two spots in Mosul. To show the gallery
spread over Nineveh, each photo gets a random place from a list of real
Nineveh towns/sites (seeded → reproducible). The website marks these as
"illustrative location"; the REAL location stays in observations.json and in
reports/photos/ and is what every analysis uses.

For each illustrative place the sky is predicted with model v2 (NASA 2024)
at the photo's real date/time, so the numbers shown match the place shown.

    python 07_display_places.py [--seed 2026]
Writes ../public/data/observation_places.json
"""
import argparse
import importlib.util
import json
import os
import random
import re
import sys
import urllib.request
from datetime import datetime

import numpy as np
import pandas as pd

from orbit_ml import astro, blackmarble as bm
from orbit_ml.features import add_model_features, nelm_from_sqm
from orbit_ml.model_json import JsonSkyModel

sys.stdout.reconfigure(encoding="utf-8")
HERE = os.path.dirname(__file__)
PUBLIC = os.path.join(HERE, "..", "public")

# Real towns and sites in Nineveh Governorate (approximate centres)
PLACES = [
    ("Bashiqa", "بعشيقة", 36.4539, 43.3514),
    ("Bartella", "برطلة", 36.3517, 43.3797),
    ("Qaraqosh (Al-Hamdaniya)", "قره قوش (الحمدانية)", 36.2694, 43.3781),
    ("Tel Kaif", "تلكيف", 36.4897, 43.1197),
    ("Alqosh", "ألقوش", 36.7361, 43.0944),
    ("Tal Afar", "تلعفر", 36.3794, 42.4497),
    ("Sinjar", "سنجار", 36.3209, 41.8765),
    ("Qayyarah", "القيارة", 35.8000, 43.2900),
    ("Hammam al-Alil", "حمام العليل", 36.1600, 43.2600),
    ("Nimrud", "النمرود", 36.0981, 43.3292),
    ("Ain Sifni (Shekhan)", "عين سفني (الشيخان)", 36.6936, 43.3500),
]

# Remove the real site name from the caption (the place shown is different)
CLEAN = [
    (r"^Al-Shalalat Equestrian Club \((\d/\d)\)$", r"Night sky (\1)"),
    (r"^Al-Shalalat Equestrian Club - ", ""),
    (r"^نادي الشلالات للفروسية \((\d/\d)\)$", r"سماء الليل (\1)"),
    (r"^نادي الشلالات - ", ""),
]


def clean(text):
    for pat, rep in CLEAN:
        text = re.sub(pat, rep, text or "")
    return text


def elevations(points):
    lat = ",".join(f"{p[0]:.4f}" for p in points)
    lon = ",".join(f"{p[1]:.4f}" for p in points)
    with urllib.request.urlopen(f"https://api.open-meteo.com/v1/elevation?latitude={lat}&longitude={lon}", timeout=60) as r:
        return json.load(r)["elevation"]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--seed", type=int, default=2026)
    a = ap.parse_args()
    rnd = random.Random(a.seed)

    obs = json.load(open(os.path.join(PUBLIC, "data", "observations.json"), encoding="utf-8"))
    picks = rnd.sample(PLACES, len(obs)) if len(obs) <= len(PLACES) else [rnd.choice(PLACES) for _ in obs]
    # small random offset (≤ 2 km) so markers are not on the exact town centre
    pts = [(la + rnd.uniform(-0.018, 0.018), lo + rnd.uniform(-0.022, 0.022)) for _, _, la, lo in picks]
    elev = elevations(pts)

    spec = importlib.util.spec_from_file_location("v2", os.path.join(HERE, "06_blackmarble_v2.py"))
    v2 = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(v2)
    rows = []
    for o, (la, lo), el in zip(obs, pts, elev):
        unix = datetime.fromisoformat(o["utc"]).timestamp()
        u, lat, lon = np.array([unix]), np.array([la]), np.array([lo])
        rows.append({"lat": la, "lon": lo, "unix": unix, "elevation_m": el, "cloud": 0.0,
                     "sun_alt": float(astro.sun_altitude_deg(u, lat, lon)[0]),
                     "moon_alt": float(astro.moon_altitude_deg(u, lat, lon)[0]),
                     "moon_illum": float(astro.moon_illumination(u)[0]),
                     "light_point": 0, "light_10km": 0, "light_10_50km": 0, "light_50_160km": 0, "skyglow_index": 0,
                     **bm.features(la, lo)})
    df = v2.add_bm_features(add_model_features(pd.DataFrame(rows)))
    df["sqm"] = JsonSkyModel(os.path.join(PUBLIC, "model", "sky_model_v2.json")).predict(df[v2.V2_FEATURES]).clip(16, 22.3)

    out = {}
    for o, (en, ar, *_), (la, lo), el, sqm in zip(obs, picks, pts, elev, df.sqm):
        out[o["thumb"]] = {"place": en, "place_ar": ar, "lat": round(la, 4), "lon": round(lo, 4), "elevation_m": el,
                           "notes": clean(o.get("notes")), "notes_ar": clean(o.get("notes_ar")),
                           "model_sqm": round(float(sqm), 2), "nelm": round(float(nelm_from_sqm(sqm)), 2)}
        print(f"{o['thumb']:28s} -> {ar:22s} {sqm:.2f}")
    payload = {"illustrative": True, "seed": a.seed,
               "note": "Illustrative gallery locations (random Nineveh places). Real photo locations are in observations.json.",
               "photos": out}
    with open(os.path.join(PUBLIC, "data", "observation_places.json"), "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=1)
    print("written public/data/observation_places.json")


if __name__ == "__main__":
    main()
