"""NASA VIIRS Black Marble light features from NASA GIBS tiles.

Source : NASA GIBS WMTS, layer VIIRS_Black_Marble (2016 annual composite,
         Suomi-NPP VIIRS Day/Night Band, ~500 m native).
Unit   : "light index" = linearised pixel luminance, 0..1. This is a PROXY
         for upward radiance (the PNG is a visual product, not calibrated
         nW/cm^2/sr). The model learns the mapping from this index to sky
         brightness, so the proxy only needs to be monotonic.

The same sampling is implemented in src/modules/viirs.js for the website.
"""
import io
import math
import os
import threading
import urllib.request
from concurrent.futures import ThreadPoolExecutor

import numpy as np
from PIL import Image

TILE_URL = ("https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_Black_Marble/"
            "default/2016-01-01/GoogleMapsCompatible_Level8/{z}/{y}/{x}.png")
CACHE_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "cache", "tiles")

# Sampling plan: (zoom, radii_km, n_angles). Coarser zoom for far rings.
RING_POINT = (8, [0.0, 0.7], 8)
RING_NEAR = (8, [2, 4, 6, 8, 10], 12)          # 0-10 km  : the site's own neighbourhood
RING_MID = (7, [15, 22, 30, 40, 50], 16)       # 10-50 km : nearby city domes
RING_FAR = (6, [65, 85, 110, 135, 160], 24)    # 50-160 km: distant cities on the horizon

FEATURES = ["light_point", "light_10km", "light_10_50km", "light_50_160km", "skyglow_index"]

_mem = {}
_lock = threading.Lock()


def _tile_path(z, x, y):
    return os.path.join(CACHE_DIR, str(z), str(y), f"{x}.png")


def _download(z, x, y):
    path = _tile_path(z, x, y)
    if os.path.exists(path):
        return
    os.makedirs(os.path.dirname(path), exist_ok=True)
    for _ in range(3):
        try:
            with urllib.request.urlopen(TILE_URL.format(z=z, x=x, y=y), timeout=30) as r:
                data = r.read()
            with open(path, "wb") as f:
                f.write(data)
            return
        except Exception:
            continue


def _luminance(z, x, y):
    """Linear luminance 0..1 for a tile (cached in memory)."""
    key = (z, x, y)
    with _lock:
        if key in _mem:
            return _mem[key]
    path = _tile_path(z, x, y)
    if not os.path.exists(path):
        _download(z, x, y)
    try:
        rgb = np.asarray(Image.open(path).convert("RGB"), dtype=np.float32) / 255.0
        lin = np.power(rgb, 2.2)                         # undo display gamma
        lum = 0.2126 * lin[..., 0] + 0.7152 * lin[..., 1] + 0.0722 * lin[..., 2]
    except Exception:
        lum = np.zeros((256, 256), dtype=np.float32)
    with _lock:
        _mem[key] = lum
    return lum


def _pixel(lat, lon, z):
    lat = max(min(lat, 85.0), -85.0)
    n = 2 ** z
    x = (lon + 180.0) / 360.0 * n * 256
    s = math.sin(math.radians(lat))
    y = (0.5 - math.log((1 + s) / (1 - s)) / (4 * math.pi)) * n * 256
    return int(x) % (n * 256), min(max(int(y), 0), n * 256 - 1)


def sample(lat, lon, z):
    px, py = _pixel(lat, lon, z)
    return float(_luminance(z, px // 256, py // 256)[py % 256, px % 256])


def _offset(lat, lon, dist_km, bearing_rad):
    dlat = dist_km / 111.32 * math.cos(bearing_rad)
    dlon = dist_km / (111.32 * max(math.cos(math.radians(lat)), 0.05)) * math.sin(bearing_rad)
    return lat + dlat, lon + dlon


def _ring_points(lat, lon, plan):
    z, radii, n_ang = plan
    pts = []
    for r in radii:
        angles = [0.0] if r == 0 else [2 * math.pi * i / n_ang for i in range(n_ang)]
        for a in angles:
            pts.append((z, r) + _offset(lat, lon, r, a))
    return pts


def tiles_needed(lat, lon):
    out = set()
    for plan in (RING_POINT, RING_NEAR, RING_MID, RING_FAR):
        for z, _, la, lo in _ring_points(lat, lon, plan):
            px, py = _pixel(la, lo, z)
            out.add((z, px // 256, py // 256))
    return out


def prefetch(locations, workers=16, progress=True):
    tiles = set()
    for lat, lon in locations:
        tiles |= tiles_needed(lat, lon)
    todo = [t for t in tiles if not os.path.exists(_tile_path(*t))]
    if progress:
        print(f"  tiles needed: {len(tiles)}  (to download: {len(todo)})")
    with ThreadPoolExecutor(workers) as ex:
        for i, _ in enumerate(ex.map(lambda t: _download(*t), todo)):
            if progress and (i + 1) % 200 == 0:
                print(f"    downloaded {i + 1}/{len(todo)}")


def light_features(lat, lon):
    """Return dict of VIIRS light features for one location."""
    def ring_mean(plan):
        vals = [sample(la, lo, z) for z, _, la, lo in _ring_points(lat, lon, plan)]
        return float(np.mean(vals))

    # Skyglow index: Walker's law — sky brightness from a source ~ L * area * d^-2.5
    glow = 0.0
    for plan in (RING_NEAR, RING_MID, RING_FAR):
        z, radii, n_ang = plan
        for z_, r, la, lo in _ring_points(lat, lon, plan):
            ring_width = 2.0 if r <= 10 else (8.0 if r <= 50 else 22.0)
            area = 2 * math.pi * r * ring_width / n_ang
            glow += sample(la, lo, z_) * area * (max(r, 1.0) ** -2.5)

    return {
        "light_point": ring_mean(RING_POINT),
        "light_10km": ring_mean(RING_NEAR),
        "light_10_50km": ring_mean(RING_MID),
        "light_50_160km": ring_mean(RING_FAR),
        "skyglow_index": glow,
    }
