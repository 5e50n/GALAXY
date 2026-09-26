"""Step 6 — Model v2 with NASA Black Marble VNP46A4 (2024, calibrated radiance).

    python 06_blackmarble_v2.py download [--max-tiles N]   # Iraq tiles first, then by training rows
    python 06_blackmarble_v2.py build                      # radiance features for covered rows
    python 06_blackmarble_v2.py train                      # v1 vs v2 on the SAME rows, export if better
    python 06_blackmarble_v2.py export-raster              # Iraq radiance PNG for the website
    python 06_blackmarble_v2.py all [--max-tiles N]

Needs ml/.env with EARTHDATA_TOKEN (and the LAADS licence accepted once in a browser).
"""
import argparse
import collections
import importlib.util
import json
import os
import sys

import numpy as np
import pandas as pd

from orbit_ml import blackmarble as bm
from orbit_ml.features import MODEL_FEATURES, add_model_features, log_light

sys.stdout.reconfigure(encoding="utf-8")
HERE = os.path.dirname(__file__)
DATA = os.path.join(HERE, "data")
PUBLIC = os.path.join(HERE, "..", "public")
REPORTS = os.path.join(HERE, "..", "reports")
IRAQ_TILES = ["h22v05", "h21v05", "h23v05", "h22v06", "h21v06", "h23v06"]
# Website raster: Iraq + 160 km margin
RASTER_BBOX = dict(lat_min=27.5, lat_max=39.5, lon_min=37.0, lon_max=50.5)

BM_FEATURES = ["log_rad_point", "log_rad_10km", "log_rad_10_50km", "log_rad_50_160km", "log_rad_skyglow"]
COMMON = ["elevation_km", "moon_illum", "moon_alt", "moon_light", "cloud", "sun_alt", "solar_hour", "abs_lat", "season"]
V2_FEATURES = BM_FEATURES + COMMON


def add_bm_features(df):
    df = df.copy()
    for src, dst in zip(bm.FEATURES, BM_FEATURES):
        df[dst] = np.log10(df[src].astype(float) + bm.Q_EPS)
    return df


# ── download ──
def cmd_download(max_tiles):
    ds = pd.read_csv(os.path.join(DATA, "dataset.csv"))
    rows_per_tile = collections.Counter()
    needed = collections.defaultdict(set)
    for (la, lo), n in ds.groupby([ds.lat.round(2), ds.lon.round(2)]).size().items():
        ts = bm.tiles_needed(la, lo)
        for t in ts:
            rows_per_tile[t] += n
    order = IRAQ_TILES + [t for t, _ in rows_per_tile.most_common() if t not in IRAQ_TILES]
    if max_tiles:
        order = order[:max_tiles]
    lst = bm.listing()
    order = [t for t in order if t in lst]
    gb = sum(lst[t][1] for t in order if not bm.available(t)) / 1e9
    print(f"tiles to fetch: {len(order)}  (~{gb:.1f} GB still to download)")
    bm.download_many(order)


# ── build ──
def cmd_build():
    lst = set(bm.listing())
    have = {t for t in lst if bm.available(t)}
    ocean = lambda t: t not in lst            # no land tile = no light = 0  # noqa: E731
    ds = pd.read_csv(os.path.join(DATA, "dataset.csv"))
    locs = ds[["lat", "lon"]].round(3).drop_duplicates()
    rows = []
    for la, lo in locs.itertuples(index=False, name=None):
        if all(t in have or ocean(t) for t in bm.tiles_needed(la, lo)):
            rows.append({"lat_r": la, "lon_r": lo, **bm.features(la, lo)})
    feats = pd.DataFrame(rows)
    print(f"locations covered by downloaded tiles: {len(feats):,} / {len(locs):,}")
    ds = ds.assign(lat_r=ds.lat.round(3), lon_r=ds.lon.round(3)).merge(feats, on=["lat_r", "lon_r"], how="inner")
    ds.drop(columns=["lat_r", "lon_r"]).to_csv(os.path.join(DATA, "dataset_v2.csv"), index=False)
    print(f"dataset_v2.csv: {len(ds):,} rows")


# ── train ──
def cmd_train():
    spec = importlib.util.spec_from_file_location("tr", os.path.join(HERE, "03_train.py"))
    tr = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(tr)
    from sklearn.ensemble import HistGradientBoostingRegressor
    from sklearn.inspection import permutation_importance
    from sklearn.linear_model import LinearRegression
    from sklearn.model_selection import GroupKFold

    df = add_bm_features(add_model_features(pd.read_csv(os.path.join(DATA, "dataset_v2.csv"))))
    df = df.dropna(subset=MODEL_FEATURES + V2_FEATURES + ["sqm"]).reset_index(drop=True)
    y = df.sqm.values
    groups = (np.floor(df.lat / 0.5).astype(int) * 1000 + np.floor(df.lon / 0.5).astype(int)).values
    print(f"rows: {len(df):,}  groups: {len(set(groups)):,}")

    physics = {**tr.PHYSICS, **{f: -1 for f in BM_FEATURES}}

    def hgb(cols):
        return lambda: HistGradientBoostingRegressor(
            loss="absolute_error", max_iter=400, learning_rate=0.05, max_depth=5,
            min_samples_leaf=20, monotonic_cst=[physics.get(c, 0) for c in cols], random_state=42)

    configs = {
        "satellite_only_2016": (["log_light_point"], LinearRegression),
        "satellite_only_2024": (["log_rad_point"], LinearRegression),
        "v1_gibs_2016": (MODEL_FEATURES, hgb(MODEL_FEATURES)),
        "v2_blackmarble_2024": (V2_FEATURES, hgb(V2_FEATURES)),
    }
    oof = {}
    for name, (cols, make) in configs.items():
        p = np.zeros(len(df))
        for a, b in GroupKFold(5).split(df, y, groups):
            p[b] = make().fit(df.iloc[a][cols], y[a]).predict(df.iloc[b][cols])
        oof[name] = p
        print(f"  {name:22s} {tr.scores(y, p)}")
    cv = {k: tr.scores(y, v) for k, v in oof.items()}

    def by_bortle(p):
        b = np.select([y >= 21.35, y >= 19.1, y >= 18], ["B1-3", "B4-5", "B6"], "B7-9")
        return {k: round(float(np.mean(np.abs(p - y)[b == k])), 3) for k in ["B1-3", "B4-5", "B6", "B7-9"]}

    comparison = {
        "rows": int(len(df)),
        "cv": cv,
        "mae_by_bortle": {k: by_bortle(v) for k, v in oof.items()},
        "within_half_mag_pct": {k: round(100 * float((np.abs(v - y) <= 0.5).mean()), 1) for k, v in oof.items()},
    }
    os.makedirs(REPORTS, exist_ok=True)
    with open(os.path.join(REPORTS, "v1_vs_v2.json"), "w") as f:
        json.dump(comparison, f, indent=2)
    print("MAE by Bortle:", json.dumps(comparison["mae_by_bortle"], indent=1))

    v1, v2 = cv["v1_gibs_2016"]["MAE"], cv["v2_blackmarble_2024"]["MAE"]
    if v2 >= v1:
        print(f"v2 ({v2}) is not better than v1 ({v1}) on the same rows — keeping v1, not exporting.")
        return

    # Final v2 model on all covered rows + export for the browser
    cols = V2_FEATURES
    model = hgb(cols)().fit(df[cols], y)
    sample = df.sample(min(2000, len(df)), random_state=0)
    pi = permutation_importance(model, sample[cols], sample.sqm, n_repeats=5, random_state=0,
                                scoring="neg_mean_absolute_error")
    tot = max(pi.importances_mean.clip(0).sum(), 1e-9)
    imp = {c: round(float(max(v, 0) / tot), 4) for c, v in zip(cols, pi.importances_mean)}
    sat = LinearRegression().fit(df[["log_rad_point"]], y)
    base = cv["satellite_only_2024"]["MAE"]
    metrics = {
        "model": "orbit_ai_v2", "version": 2,
        "training_rows": int(len(df)),
        "unique_locations": int(df[["lat", "lon"]].round(3).drop_duplicates().shape[0]),
        "validation": "5-fold GroupKFold by 0.5° geographic cell (tested on unseen areas)",
        "cv": {"satellite_only": cv["satellite_only_2024"], "orbit_ai_v2": cv["v2_blackmarble_2024"],
               "orbit_ai_v1_same_rows": cv["v1_gibs_2016"]},
        "improvement_percent": round(100 * (base - v2) / base, 1),
        "improvement_vs_v1_percent": round(100 * (v1 - v2) / v1, 1),
        "within_half_mag_pct": comparison["within_half_mag_pct"]["v2_blackmarble_2024"],
        "mae_by_bortle": comparison["mae_by_bortle"],
        "data_sources": {"target": "Globe at Night SQM 2019-2025",
                         "satellite": "NASA Black Marble VNP46A4 2024 (AllAngle_Composite_Snow_Free, nW/cm²/sr)"},
    }
    payload = {"type": "hgb", "init": float(np.ravel(model._baseline_prediction)[0]),
               "trees": [tr.export_hgb_tree(it[0]) for it in model._predictors],
               "features": cols, "metrics": metrics, "importances": imp,
               "residual_std": round(float(np.std(y - oof["v2_blackmarble_2024"])), 3),
               "satellite_only": {"feature": "log_rad_point", "coef": float(sat.coef_[0]), "intercept": float(sat.intercept_)},
               "raster": {**RASTER_BBOX, "q_lo": bm.Q_LO, "q_hi": bm.Q_HI, "q_eps": bm.Q_EPS,
                          "deg_per_px": bm.DEG_PER_PX, "file": "model/iraq_radiance_2024.png"}}
    out = os.path.join(PUBLIC, "model", "sky_model_v2.json")
    with open(out, "w") as f:
        json.dump(payload, f, separators=(",", ":"))
    print(f"v2 better: MAE {v1} -> {v2}  (exported {os.path.relpath(out, HERE)})")


# ── raster for the website ──
def cmd_export_raster():
    from PIL import Image
    b = RASTER_BBOX
    H = int(round((b["lat_max"] - b["lat_min"]) / bm.DEG_PER_PX))
    W = int(round((b["lon_max"] - b["lon_min"]) / bm.DEG_PER_PX))
    img = np.zeros((H, W), dtype=np.uint8)
    for tid in IRAQ_TILES:
        arr = bm.load(tid)
        if arr is None:
            continue
        h, v = int(tid[1:3]), int(tid[4:6])
        t_lon0, t_lat0 = -180 + 10 * h, 90 - 10 * v          # tile upper-left
        # overlap in pixel coordinates of the output raster
        r0 = int(round((b["lat_max"] - t_lat0) / bm.DEG_PER_PX))
        c0 = int(round((t_lon0 - b["lon_min"]) / bm.DEG_PER_PX))
        rr0, cc0 = max(r0, 0), max(c0, 0)
        rr1, cc1 = min(r0 + bm.PX, H), min(c0 + bm.PX, W)
        if rr1 <= rr0 or cc1 <= cc0:
            continue
        img[rr0:rr1, cc0:cc1] = bm.quantise(arr[rr0 - r0:rr1 - r0, cc0 - c0:cc1 - c0])
    out = os.path.join(PUBLIC, "model", "iraq_radiance_2024.png")
    Image.fromarray(img, mode="L").save(out, optimize=True)
    print(f"raster {W}x{H} -> {os.path.relpath(out, HERE)} ({os.path.getsize(out) / 1e6:.1f} MB)")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["download", "build", "train", "export-raster", "all"])
    ap.add_argument("--max-tiles", type=int, default=0)
    a = ap.parse_args()
    if a.cmd in ("download", "all"):
        cmd_download(a.max_tiles)
    if a.cmd in ("build", "all"):
        cmd_build()
    if a.cmd in ("train", "all"):
        cmd_train()
    if a.cmd in ("export-raster", "all"):
        cmd_export_raster()
