"""Step 4 — Measure sky brightness from real night-sky photos and compare with NASA.

Put photos in ml/data/photos/ and fill ml/data/photos/photos_log.csv
(copy photos_log_template.csv). Location/time/exposure are read from EXIF
when present; the CSV fills in anything missing.

Supported sources
-----------------
* original   : camera / phone file with EXIF (best — full photometry)
* whatsapp   : "IMG-YYYYMMDD-WA0001.jpg". WhatsApp strips ALL EXIF (time,
               exposure, ISO, GPS) and recompresses to ~1600 px. We read the
               date from the file name and take the rest from photos_log.csv.
               TIP: sending the photo "as Document" keeps the original + EXIF.
* whatsapp_hd: same, but "HD" quality (~4000 px, still no EXIF).

photos_log.csv rows may use wildcards in `file`, e.g. `IMG-20260920-WA*`,
so one row describes a whole session (same place, same camera settings).

For each photo we compute:
  * sky background brightness (linear, star-masked), normalised by exposure
      flux = background / (exposure_s * ISO/100 / f_number^2)
      photo_mag = ZP - 2.5*log10(flux)            (ZP = camera zero point)
  * detected stars per megapixel, measured on a common 1600 px image so
    originals and WhatsApp copies are comparable
  * the NASA-model prediction for the same place & time
  * delta = photo - model  -> the LOCAL correction the satellite misses

Photos without exposure settings cannot be measured photometrically; if at
least 3 complete photos exist, their sky brightness is estimated from star
density (method = "stars").

Zero point ZP: fitted on photos with `sqm_measured` (SQM meter or phone app)
= absolute calibration; otherwise fitted to the model's mean = relative.

Usage:  python 04_analyze_photos.py [--photos DIR] [--no-publish]
Outputs: data/photos_results.csv (+ ../reports/photos/), ../public/data/observations.json,
         ../public/photos/*.jpg, ../public/model/local_calibration.json
"""
import argparse
import fnmatch
import json
import os
import re
import sys
from datetime import datetime, timedelta, timezone

import numpy as np
import pandas as pd
from PIL import ExifTags, Image, ImageOps
from scipy import ndimage

from orbit_ml import astro, viirs
from orbit_ml.features import add_model_features, nelm_from_sqm
from orbit_ml.model_json import JsonSkyModel

sys.stdout.reconfigure(encoding="utf-8")
HERE = os.path.dirname(__file__)
PUBLIC = os.path.join(HERE, "..", "public")
MODEL = os.path.join(PUBLIC, "model", "sky_model.json")
IMG_EXT = {".jpg", ".jpeg", ".png", ".tif", ".tiff", ".webp"}
TAGS = {v: k for k, v in ExifTags.TAGS.items()}
WHATSAPP_RE = re.compile(r"(?:IMG|PHOTO)[-_](\d{8})[-_]WA\d+", re.I)
STAR_SIZE = 1600                       # common long side for star counting
SOURCE_WEIGHT = {"original": 1.0, "whatsapp_hd": 0.7, "whatsapp": 0.5, "stripped": 0.5}


# ── EXIF ──

def _ratio(v):
    try:
        return float(v[0]) / float(v[1]) if isinstance(v, tuple) else float(v)
    except Exception:
        return None


def _gps(exif):
    try:
        gps = exif.get_ifd(0x8825)
        if not gps:
            return None, None

        def dms(vals, ref):
            d = sum(_ratio(x) / 60 ** i for i, x in enumerate(vals))
            return -d if ref in ("S", "W") else d
        return dms(gps[2], gps[1]), dms(gps[4], gps[3])
    except Exception:
        return None, None


def read_exif(img):
    out = {}
    try:
        exif = img.getexif()
        allx = {**dict(exif), **dict(exif.get_ifd(0x8769))}
        out["exposure_s"] = _ratio(allx.get(TAGS["ExposureTime"]))
        out["f_number"] = _ratio(allx.get(TAGS["FNumber"]))
        iso = allx.get(TAGS["ISOSpeedRatings"]) or allx.get(0x8833)
        out["iso"] = float(iso[0] if isinstance(iso, (tuple, list)) else iso) if iso else None
        dt = allx.get(TAGS["DateTimeOriginal"]) or allx.get(TAGS["DateTime"])
        out["local_datetime"] = str(dt).replace(":", "-", 2) if dt else None
        out["camera"] = f"{allx.get(TAGS['Make'], '')} {allx.get(TAGS['Model'], '')}".strip() or None
        out["lat"], out["lon"] = _gps(exif)
    except Exception as e:
        print("   exif error:", e)
    return {k: v for k, v in out.items() if v not in (None, "")}


def detect_source(name, exif, size):
    """original / whatsapp / whatsapp_hd / stripped (+ date from WhatsApp file name)."""
    m = WHATSAPP_RE.search(name)
    long_side = max(size)
    has_camera_exif = "exposure_s" in exif or "camera" in exif
    if m or not has_camera_exif:
        date = datetime.strptime(m.group(1), "%Y%m%d").date().isoformat() if m else None
        if m:
            return ("whatsapp_hd" if long_side > 2000 else "whatsapp"), date
        return "stripped", None
    return "original", None


def log_for(name, log):
    """Merge every photos_log.csv row whose `file` pattern matches (later rows win)."""
    info = {}
    for _, row in log.iterrows():
        if fnmatch.fnmatch(name.lower(), str(row["file"]).lower()):
            info.update({k: v for k, v in row.items() if k != "file" and pd.notna(v) and v != ""})
    return info


# ── Image measurement ──

def to_linear_lum(img):
    rgb = np.asarray(img.convert("RGB"), dtype=np.float32) / 255.0
    lin = np.where(rgb <= 0.04045, rgb / 12.92, ((rgb + 0.055) / 1.055) ** 2.4)   # undo sRGB
    return 0.2126 * lin[..., 0] + 0.7152 * lin[..., 1] + 0.0722 * lin[..., 2]


def sky_background(lum):
    """Median of 32x32 blocks, keeping the middle of the distribution
    (drops dark foreground silhouettes and bright lit objects).
    Low-frequency, so it survives WhatsApp recompression well."""
    h, w = lum.shape
    bs = 32
    blocks = lum[: h // bs * bs, : w // bs * bs].reshape(h // bs, bs, w // bs, bs)
    med = np.median(blocks, axis=(1, 3)).ravel()
    lo, hi = np.percentile(med, [25, 75])
    return float(np.median(med[(med >= lo) & (med <= hi)]))


def count_stars(img):
    """Stars per megapixel on a common 1600 px image.

    Detection runs on display brightness (sRGB 0..1), with the threshold floored
    at 0.04 (~10 code values). Phone night-mode photos crush the dark sky to
    near-black, where JPEG noise would otherwise be counted as thousands of
    fake 'stars'; WhatsApp/Telegram recompression has the same effect."""
    small = img.copy()
    small.thumbnail((STAR_SIZE, STAR_SIZE))
    gray = ndimage.gaussian_filter(np.asarray(small.convert("L"), dtype=np.float32) / 255.0, 1.0)
    resid = gray - ndimage.median_filter(gray, size=25)
    noise = 1.4826 * np.median(np.abs(resid - np.median(resid))) + 1e-6
    thr = max(6 * noise, 0.04)
    peaks = (resid > thr) & (resid == ndimage.maximum_filter(resid, size=7))
    h, w = gray.shape
    return int(peaks.sum()), round(peaks.sum() / (h * w / 1e6), 1)


def thumbnail(img, name):
    """Web copy with a URL-safe name (originals may contain spaces / Arabic digits)."""
    import hashlib
    os.makedirs(os.path.join(PUBLIC, "photos"), exist_ok=True)
    t = img.convert("RGB")
    t.thumbnail((900, 900))
    out = "obs_" + hashlib.md5(name.encode("utf-8")).hexdigest()[:10] + ".jpg"
    t.save(os.path.join(PUBLIC, "photos", out), quality=82)
    return f"photos/{out}"


def analyze(path, name, log, publish):
    img = ImageOps.exif_transpose(Image.open(path))
    exif = read_exif(Image.open(path))
    source, name_date = detect_source(name, exif, img.size)
    info = {**exif, **log_for(name, log)}        # CSV overrides / fills EXIF
    flags = []

    # Date/time: EXIF > CSV local_datetime > WhatsApp file date + CSV local_time
    if "local_datetime" not in info and name_date:
        info["local_datetime"] = f"{name_date} {info.get('local_time', '22:00')}"
        flags.append("date_from_filename")
        if "local_time" not in info:
            flags.append("time_assumed_22:00")
    missing = [k for k in ("lat", "lon", "local_datetime") if k not in info]
    if missing:
        print(f"   skipped — missing {missing} (add a matching row to photos_log.csv)")
        return None

    tz = float(info.get("utc_offset", 3))            # Iraq = UTC+3
    local = datetime.fromisoformat(str(info["local_datetime"]).replace("/", "-"))
    utc = (local - timedelta(hours=tz)).replace(tzinfo=timezone.utc)

    full = img.copy()
    full.thumbnail((2000, 2000))
    background = sky_background(to_linear_lum(full))
    stars, stars_mpx = count_stars(img)

    has_exposure = all(k in info for k in ("exposure_s", "iso", "f_number"))
    mag_rel = np.nan
    if has_exposure:
        flux = background / (float(info["exposure_s"]) * float(info["iso"]) / 100.0 / float(info["f_number"]) ** 2)
        mag_rel = -2.5 * np.log10(max(flux, 1e-12))
    else:
        flags.append("no_exposure_settings")

    print(f"   source={source:11s} stars/Mpx={stars_mpx:7.1f}  bg={background:.5f}  {' '.join(flags)}")
    return {
        "file": name, "source": source, "weight": SOURCE_WEIGHT[source] * (0.5 if "time_assumed_22:00" in flags else 1),
        "flags": ";".join(flags), "site": info.get("site", ""), "camera": info.get("camera", ""),
        "lat": float(info["lat"]), "lon": float(info["lon"]), "elevation_m": float(info.get("elevation_m", 300)),
        "cloud": float(info.get("cloud", 0)), "unix": utc.timestamp(), "utc": utc.isoformat(),
        "exposure_s": info.get("exposure_s"), "iso": info.get("iso"), "f_number": info.get("f_number"),
        "sqm_measured": float(info["sqm_measured"]) if "sqm_measured" in info else np.nan,
        "background_lin": background, "stars": stars, "stars_per_mpx": stars_mpx, "mag_rel": mag_rel,
        "thumb": thumbnail(img, name) if publish else "",
        "local_datetime": str(local), "notes": info.get("notes", ""),
        "site_ar": info.get("site_ar", ""), "notes_ar": info.get("notes_ar", ""),
        # object/telescope close-ups are not sky-background photos
        "kind": "telescope" if "telescope" in str(info.get("notes", "")).lower() else info.get("kind", "sky"),
    }


def bortle_class(m):
    m = np.asarray(m)
    return np.select([m >= 21.75, m >= 21.6, m >= 21.35, m >= 20.4, m >= 19.1, m >= 18, m >= 17.5, m >= 16.5],
                     [1, 2, 3, 4, 5, 6, 7, 8], 9)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--photos", default=os.path.join(HERE, "data", "photos"))
    ap.add_argument("--no-publish", action="store_true", help="don't write to ../public (for testing)")
    args = ap.parse_args()
    publish = not args.no_publish

    log_path = os.path.join(args.photos, "photos_log.csv")
    log = pd.read_csv(log_path, dtype=str) if os.path.exists(log_path) else pd.DataFrame(columns=["file"])
    files = sorted(f for f in os.listdir(args.photos) if os.path.splitext(f)[1].lower() in IMG_EXT)
    if not files:
        print(f"No photos found in {args.photos}. Add photos + photos_log.csv and run again.")
        return

    rows = []
    for f in files:
        print("•", f)
        r = analyze(os.path.join(args.photos, f), f, log, publish)
        if r:
            rows.append(r)
    if not rows:
        return
    df = pd.DataFrame(rows)

    # NASA + astronomy features → model prediction for the same place/time
    df["sun_alt"] = astro.sun_altitude_deg(df.unix, df.lat, df.lon)
    df["moon_alt"] = astro.moon_altitude_deg(df.unix, df.lat, df.lon)
    df["moon_illum"] = astro.moon_illumination(df.unix)
    viirs.prefetch(zip(df.lat, df.lon), progress=False)
    feats = pd.DataFrame([viirs.light_features(a, b) for a, b in zip(df.lat, df.lon)])
    df = add_model_features(pd.concat([df, feats], axis=1))
    df["model_sqm"] = JsonSkyModel(MODEL).predict(df)

    # 1) Photometric sky brightness (photos with exposure settings)
    phot = df.mag_rel.notna()
    ref = df[phot & df.sqm_measured.notna()]
    if len(ref):
        zp, mode = float(np.median(ref.sqm_measured - ref.mag_rel)), f"absolute ({len(ref)} reference photos)"
    elif phot.any():
        zp, mode = float(np.median(df.model_sqm[phot] - df.mag_rel[phot])), "relative (fitted to model mean)"
    else:
        zp, mode = np.nan, "none (no photo has exposure settings)"
    df["photo_sqm"] = zp + df.mag_rel
    df["method"] = np.where(phot, "photometry", "")

    # 2) Photos without exposure (typical WhatsApp): estimate from star density
    miss = df.photo_sqm.isna()
    if miss.any() and phot.sum() >= 3:
        x = np.log10(df.loc[phot, "stars_per_mpx"] + 1)
        a, b = np.polyfit(x, df.loc[phot, "photo_sqm"], 1)
        df.loc[miss, "photo_sqm"] = a * np.log10(df.loc[miss, "stars_per_mpx"] + 1) + b
        df.loc[miss, "method"] = "stars"
        df.loc[miss, "weight"] *= 0.5
        print(f"star-density relation: sqm = {a:.2f}*log10(stars/Mpx+1) + {b:.2f}  (from {phot.sum()} photos)")

    df["photo_sqm"] = df.photo_sqm.round(2)
    df["delta"] = (df.photo_sqm - df.model_sqm).round(2)
    df["nelm"] = nelm_from_sqm(df.photo_sqm).round(2)
    df.to_csv(os.path.join(HERE, "data", "photos_results.csv"), index=False)
    report_dir = os.path.join(HERE, "..", "reports", "photos")
    os.makedirs(report_dir, exist_ok=True)
    df.to_csv(os.path.join(report_dir, "photos_results.csv"), index=False)

    print(f"\nzero point: {zp:.2f}  [{mode}]")
    print(df[["file", "source", "method", "photo_sqm", "model_sqm", "delta", "stars_per_mpx", "weight"]]
          .round(2).to_string(index=False))

    ok = df.delta.notna()
    absolute = len(ref) > 0
    mean_delta = float(np.average(df.delta[ok], weights=df.weight[ok])) if ok.any() and absolute else 0.0
    calib = {"zero_point": None if np.isnan(zp) else round(zp, 3), "mode": mode, "photos": int(len(df)),
             "by_source": df.source.value_counts().to_dict(),
             "mean_delta": round(mean_delta, 3),
             "note": "weighted mean of photo_sqm - model_sqm over local photos (only with absolute calibration)"}
    print("\nlocal calibration:", calib)
    if not publish:
        return

    os.makedirs(os.path.join(PUBLIC, "data"), exist_ok=True)
    # Star counts are only meaningful for calibrated photos (phone night-mode / stripped
    # photos: tree and building edges and noise get detected too), so hide them otherwise.
    df.loc[df.method == "", "stars_per_mpx"] = np.nan
    df["model_bortle"] = bortle_class(df.model_sqm)
    cols = ["file", "source", "method", "kind", "site", "site_ar", "notes", "notes_ar", "local_datetime", "lat", "lon", "utc",
            "stars_per_mpx", "photo_sqm", "model_sqm", "model_bortle", "delta", "nelm",
            "moon_illum", "moon_alt", "thumb"]
    with open(os.path.join(PUBLIC, "data", "observations.json"), "w", encoding="utf-8") as f:
        json.dump(json.loads(df[cols].round(3).to_json(orient="records")), f, ensure_ascii=False, indent=1)
    with open(os.path.join(PUBLIC, "model", "local_calibration.json"), "w") as f:
        json.dump(calib, f, indent=2)


if __name__ == "__main__":
    main()
