"""NASA Black Marble VNP46A4 (annual, Collection 2) — calibrated night-light radiance.

Source : LAADS DAAC, VNP46A4 (Suomi-NPP VIIRS), year 2024
Layer  : AllAngle_Composite_Snow_Free  (nW·cm⁻²·sr⁻¹, scale 0.1, fill 65535)
Grid   : 10°×10° tiles hHHvVV, 2400×2400 px, 15 arc-second (~460 m) per pixel,
         upper-left corner = (lon −180 + 10·h, lat 90 − 10·v)

Unlike the 2016 GIBS picture used by model v1, this is calibrated radiance
that does NOT saturate in city centres, and it shows 2024 (post-reconstruction) Mosul.
"""
import json
import math
import os
import threading
import urllib.request
from concurrent.futures import ThreadPoolExecutor

import numpy as np

HERE = os.path.dirname(__file__)
TILE_DIR = os.path.join(HERE, "..", "data", "blackmarble")
YEAR = 2024
BASE = f"https://ladsweb.modaps.eosdis.nasa.gov/archive/allData/5200/VNP46A4/{YEAR}/001"
LAYER = "AllAngle_Composite_Snow_Free"
PX = 2400
DEG_PER_PX = 10.0 / PX

# Same ring plan as model v1 (km); the far rings use a 3x3 mean to smooth noise
RING_POINT = ([0.0, 0.5], 8)
RING_NEAR = ([2, 4, 6, 8, 10], 12)
RING_MID = ([15, 22, 30, 40, 50], 16)
RING_FAR = ([65, 85, 110, 135, 160], 24)
FEATURES = ["rad_point", "rad_10km", "rad_10_50km", "rad_50_160km", "rad_skyglow"]

_cache = {}
_lock = threading.Lock()


def token():
    env = os.path.join(HERE, "..", ".env")
    for line in open(env, encoding="utf-8"):
        if line.startswith("EARTHDATA_TOKEN="):
            return line.split("=", 1)[1].strip()
    raise RuntimeError("EARTHDATA_TOKEN missing in ml/.env")


def tile_id(lat, lon):
    return f"h{int((lon + 180) // 10):02d}v{int((90 - lat) // 10):02d}"


def tile_path(tid):
    return os.path.join(TILE_DIR, f"{tid}.h5")


def is_valid(path):
    try:
        with open(path, "rb") as f:
            return f.read(8) == b"\x89HDF\r\n\x1a\n"
    except OSError:
        return False


def listing():
    """{tile_id: (file name, size)} for the year."""
    with urllib.request.urlopen(BASE + ".json", timeout=60) as r:
        content = json.load(r)["content"]
    return {c["name"].split(".")[2]: (c["name"], c["size"]) for c in content}


def download(tid, name, tok):
    path = tile_path(tid)
    if is_valid(path):
        return "cached"
    os.makedirs(TILE_DIR, exist_ok=True)
    req = urllib.request.Request(f"{BASE}/{name}", headers={"Authorization": f"Bearer {tok}"})
    tmp = path + ".part"
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=300) as r, open(tmp, "wb") as f:
                while chunk := r.read(1 << 20):
                    f.write(chunk)
            if is_valid(tmp):
                os.replace(tmp, path)
                return "ok"
            return "not-hdf5 (login/licence page? accept the LAADS licence in a browser)"
        except Exception as e:  # noqa: BLE001
            err = str(e)
    return f"failed: {err}"


def download_many(tids, workers=4):
    tok = token()
    lst = listing()
    todo = [t for t in tids if t in lst]
    results = {}
    with ThreadPoolExecutor(workers) as ex:
        for tid, res in zip(todo, ex.map(lambda t: download(t, lst[t][0], tok), todo)):
            results[tid] = res
            print(f"  {tid}: {res}", flush=True)
    return results


# The website receives radiance as an 8-bit log-scaled PNG. Training uses the
# same quantised values so browser and Python features are identical.
Q_LO, Q_HI, Q_EPS = -1.3, 3.3, 0.05      # log10(rad + 0.05) mapped to 0..255


def quantise(rad):
    q = (np.log10(np.nan_to_num(rad, nan=0.0).clip(0) + Q_EPS) - Q_LO) / (Q_HI - Q_LO) * 255
    return np.clip(np.round(q), 0, 255).astype(np.uint8)


def dequantise(q):
    return np.maximum(10 ** (q.astype(np.float32) / 255 * (Q_HI - Q_LO) + Q_LO) - Q_EPS, 0.0)


def load(tid):
    """Radiance grid (float32, nW/cm²/sr, quantised like the web raster) or None if no tile (ocean)."""
    with _lock:
        if tid in _cache:
            return _cache[tid]
    path = tile_path(tid)
    arr = None
    if is_valid(path):
        import h5py
        with h5py.File(path, "r") as f:
            found = []
            f.visititems(lambda n, o: found.append(n) if n.endswith(LAYER) else None)
            ds = f[found[0]]
            raw = ds[()].astype(np.float32)
            scale = float(np.ravel(ds.attrs.get("scale_factor", [0.1]))[0])
            offset = float(np.ravel(ds.attrs.get("add_offset", [0.0]))[0])
            fill = float(np.ravel(ds.attrs.get("_FillValue", [65535]))[0])
            arr = dequantise(quantise(np.where(raw == fill, 0.0, raw * scale + offset)))
    with _lock:
        _cache[tid] = arr
    return arr


def available(tid):
    return is_valid(tile_path(tid))


def sample(lat, lon, win=0):
    """Radiance at a point (mean of a (2·win+1)² window). 0 over ocean/no tile."""
    tid = tile_id(lat, lon)
    arr = load(tid)
    if arr is None:
        return 0.0
    h, v = int(tid[1:3]), int(tid[4:6])
    col = int((lon - (-180 + 10 * h)) / DEG_PER_PX)
    row = int(((90 - 10 * v) - lat) / DEG_PER_PX)
    r0, r1 = max(row - win, 0), min(row + win + 1, PX)
    c0, c1 = max(col - win, 0), min(col + win + 1, PX)
    return float(arr[r0:r1, c0:c1].mean()) if r1 > r0 and c1 > c0 else 0.0


def _offset(lat, lon, dist_km, bearing):
    dlat = dist_km / 111.32 * math.cos(bearing)
    dlon = dist_km / (111.32 * max(math.cos(math.radians(lat)), 0.05)) * math.sin(bearing)
    return lat + dlat, lon + dlon


def ring_points(lat, lon, plan):
    radii, n_ang = plan
    pts = []
    for r in radii:
        for a in ([0.0] if r == 0 else [2 * math.pi * i / n_ang for i in range(n_ang)]):
            pts.append((r, n_ang) + _offset(lat, lon, r, a))
    return pts


def tiles_needed(lat, lon):
    return {tile_id(la, lo) for plan in (RING_POINT, RING_NEAR, RING_MID, RING_FAR)
            for _, _, la, lo in ring_points(lat, lon, plan)}


def covered(lat, lon, have):
    return tiles_needed(lat, lon) <= have


def features(lat, lon):
    def ring_mean(plan, win):
        return float(np.mean([sample(la, lo, win) for _, _, la, lo in ring_points(lat, lon, plan)]))

    glow = 0.0
    for plan, win in ((RING_NEAR, 0), (RING_MID, 1), (RING_FAR, 1)):
        for r, n_ang, la, lo in ring_points(lat, lon, plan):
            width = 2.0 if r <= 10 else (8.0 if r <= 50 else 22.0)
            glow += sample(la, lo, win) * (2 * math.pi * r * width / n_ang) * max(r, 1.0) ** -2.5
    return {
        "rad_point": ring_mean(RING_POINT, 0),
        "rad_10km": ring_mean(RING_NEAR, 0),
        "rad_10_50km": ring_mean(RING_MID, 1),
        "rad_50_160km": ring_mean(RING_FAR, 1),
        "rad_skyglow": glow,
    }
