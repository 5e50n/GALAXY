"""Step 3 — Train, validate honestly, and export the sky-quality model.

Question the model answers:
    "Given what NASA's satellite sees around a place + the Moon + clouds,
     how dark is the sky really on the ground (mag/arcsec^2)?"

Validation: GroupKFold by 0.5-degree geographic cell. A whole area is held
out at a time, so the model is always tested on places it has NEVER seen —
the honest way to measure a map model (random splits leak neighbours).

Outputs:
    ../reports/metrics.json, ../reports/figures/*.png, ../reports/tables/oof_predictions.csv
    ../public/model/sky_model.json   (loaded by the website)
"""
import json
import os
import sys

import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingRegressor, RandomForestRegressor
from sklearn.inspection import permutation_importance
from sklearn.linear_model import LinearRegression
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.model_selection import GroupKFold

from orbit_ml.features import MODEL_FEATURES, add_model_features, nelm_from_sqm

sys.stdout.reconfigure(encoding="utf-8")
HERE = os.path.dirname(__file__)
REPORTS = os.path.join(HERE, "..", "reports")
FIGURES = os.path.join(REPORTS, "figures")
TABLES = os.path.join(REPORTS, "tables")
EXPORT = os.path.join(HERE, "..", "public", "model", "sky_model.json")
for _d in (REPORTS, FIGURES, TABLES):
    os.makedirs(_d, exist_ok=True)
os.makedirs(os.path.dirname(EXPORT), exist_ok=True)

SAT_ONLY = ["log_light_point"]   # what a "satellite-only" map would use

# Physics constraints (physics-informed ML):
#   more artificial light  -> brighter sky (lower mag)   : -1
#   more moonlight         -> brighter sky               : -1
#   higher elevation       -> thinner air, darker sky    : +1
#   everything else free                                 :  0
PHYSICS = {"log_light_point": -1, "log_light_10km": -1, "log_light_10_50km": -1,
           "log_light_50_160km": -1, "log_skyglow": -1, "moon_light": -1, "elevation_km": 1}
MONOTONIC = [PHYSICS.get(c, 0) for c in MODEL_FEATURES]


def make_models():
    return {
        "satellite_only": (SAT_ONLY, lambda: LinearRegression()),
        "random_forest": (MODEL_FEATURES, lambda: RandomForestRegressor(
            n_estimators=200, max_depth=12, min_samples_leaf=5, n_jobs=-1, random_state=42)),
        "orbit_ai": (MODEL_FEATURES, lambda: HistGradientBoostingRegressor(
            loss="absolute_error", max_iter=400, learning_rate=0.05, max_depth=5,
            min_samples_leaf=20, monotonic_cst=MONOTONIC, random_state=42)),
    }


def scores(y, p):
    return {"MAE": round(float(mean_absolute_error(y, p)), 3),
            "RMSE": round(float(np.sqrt(mean_squared_error(y, p))), 3),
            "R2": round(float(r2_score(y, p)), 3)}


def cross_validate(df, y, groups):
    oof = {}
    gkf = GroupKFold(n_splits=5)
    for name, (cols, make) in make_models().items():
        pred = np.zeros(len(df))
        for tr, te in gkf.split(df, y, groups):
            m = make().fit(df.iloc[tr][cols], y[tr])
            pred[te] = m.predict(df.iloc[te][cols])
        oof[name] = pred
        print(f"  {name:18s} {scores(y, pred)}")
    return oof


# ── Export trees to JSON so the browser can run the model with no server ──

def export_tree(t, scale=1.0):
    t = t.tree_
    return {
        "f": t.feature.tolist(),
        "t": [float(v) for v in t.threshold],
        "l": t.children_left.tolist(),
        "r": t.children_right.tolist(),
        "v": [round(float(v[0][0]) * scale, 6) for v in t.value],
    }


def export_hgb_tree(pred):
    n = pred.nodes
    leaf = n["is_leaf"].astype(bool)
    return {
        "f": n["feature_idx"].astype(int).tolist(),
        "t": [float(v) for v in n["num_threshold"]],         # never round split thresholds!
        "l": np.where(leaf, -1, n["left"].astype(np.int64)).tolist(),    # uint32 -> int64 first!
        "r": np.where(leaf, -1, n["right"].astype(np.int64)).tolist(),
        "v": [round(float(v), 6) for v in n["value"]],
    }


def export_model(name, model, cols, metrics, importances, resid_std, extra):
    if name == "orbit_ai":
        payload = {"type": "hgb", "init": float(np.ravel(model._baseline_prediction)[0]),
                   "trees": [export_hgb_tree(it[0]) for it in model._predictors]}
    else:
        payload = {"type": "rf", "trees": [export_tree(e) for e in model.estimators_]}
    payload.update({"features": cols, "metrics": metrics, "importances": importances,
                    "residual_std": resid_std, **extra})
    with open(EXPORT, "w") as f:
        json.dump(payload, f, separators=(",", ":"))
    print(f"exported -> {os.path.relpath(EXPORT, HERE)} ({os.path.getsize(EXPORT) / 1e6:.1f} MB)")


def plots(df, y, oof, best, importances):
    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
    except ImportError:
        print("matplotlib not installed — skipping charts")
        return
    fig, axes = plt.subplots(1, 2, figsize=(11, 5), sharex=True, sharey=True)
    for ax, name, title in [(axes[0], "satellite_only", "Satellite only"), (axes[1], best, "ORBIT AI (hybrid)")]:
        ax.scatter(y, oof[name], s=3, alpha=0.25)
        ax.plot([16, 22.3], [16, 22.3], "k--", lw=1)
        ax.set_title(f"{title} — MAE {mean_absolute_error(y, oof[name]):.2f}")
        ax.set_xlabel("Measured SQM (mag/arcsec²)")
    axes[0].set_ylabel("Predicted SQM")
    fig.tight_layout()
    fig.savefig(os.path.join(FIGURES, "predicted_vs_measured.png"), dpi=130)

    fig, ax = plt.subplots(figsize=(7, 4.5))
    items = sorted(importances.items(), key=lambda kv: kv[1])
    ax.barh([k for k, _ in items], [v for _, v in items])
    ax.set_title("Feature importance")
    fig.tight_layout()
    fig.savefig(os.path.join(FIGURES, "feature_importance.png"), dpi=130)


def main():
    df = add_model_features(pd.read_csv(os.path.join(HERE, "data", "dataset.csv")))
    df = df.dropna(subset=MODEL_FEATURES + ["sqm"]).reset_index(drop=True)
    y = df["sqm"].values
    groups = (np.floor(df.lat / 0.5).astype(int) * 1000 + np.floor(df.lon / 0.5).astype(int)).values
    print(f"training rows: {len(df):,}   geographic groups: {len(set(groups)):,}")

    print("5-fold GroupKFold (unseen areas):")
    oof = cross_validate(df, y, groups)
    cv = {k: scores(y, v) for k, v in oof.items()}
    best = min(["random_forest", "orbit_ai"], key=lambda k: cv[k]["MAE"])
    base = cv["satellite_only"]["MAE"]
    improvement = round(100 * (base - cv[best]["MAE"]) / base, 1)
    print(f"best model: {best} — error reduction vs satellite-only: {improvement}%")

    # Final model on all data
    cols, make = make_models()[best]
    model = make().fit(df[cols], y)
    # Permutation importance: how much the error grows when a feature is shuffled
    sample = df.sample(min(2000, len(df)), random_state=0)
    pi = permutation_importance(model, sample[cols], sample["sqm"], n_repeats=5, random_state=0,
                                scoring="neg_mean_absolute_error")
    total = max(pi.importances_mean.clip(0).sum(), 1e-9)
    importances = {c: round(float(max(v, 0) / total), 4) for c, v in zip(cols, pi.importances_mean)}
    sat = LinearRegression().fit(df[SAT_ONLY], y)
    resid_std = round(float(np.std(y - oof[best])), 3)

    # Regional sanity check (Middle East naked-eye reports → SQM)
    regional = None
    reg_path = os.path.join(HERE, "data", "regional_check.csv")
    if os.path.exists(reg_path):
        reg = add_model_features(pd.read_csv(reg_path)).dropna(subset=MODEL_FEATURES)
        if len(reg):
            pred = model.predict(reg[cols])
            regional = {
                "rows": int(len(reg)),
                "countries": sorted(reg.Country.astype(str).unique().tolist()),
                "reported_naked_eye_limit_mean": round(float(reg.LimitingMag.mean()), 2),
                "model_naked_eye_limit_mean": round(float(nelm_from_sqm(pred).mean()), 2),
                "spearman": round(float(pd.Series(pred).corr(reg.LimitingMag.reset_index(drop=True), method="spearman")), 3),
                "note": "Observers in the region see fewer stars than a model trained mostly on USA/Europe "
                        "predicts -> local haze/dust; motivates local photo calibration.",
            }
            print("regional check (Middle East):", regional)

    metrics = {
        "model": best,
        "training_rows": int(len(df)),
        "unique_locations": int(df[["lat", "lon"]].round(3).drop_duplicates().shape[0]),
        "physics_constraints": PHYSICS,
        "validation": "5-fold GroupKFold by 0.5° geographic cell (tested on unseen areas)",
        "cv": cv,
        "improvement_percent": improvement,
        "within_half_mag_pct": round(100 * float((np.abs(oof[best] - y) <= 0.5).mean()), 1),
        "median_error": round(float(np.median(np.abs(oof[best] - y))), 3),
        "regional_check": regional,
        "data_sources": {
            "target": "Globe at Night SQM readings 2019-2025 (NOIRLab), mag/arcsec²",
            "satellite": "NASA GIBS VIIRS_Black_Marble 2016 (Suomi-NPP VIIRS DNB), linear light index 0-1",
            "astronomy": "Sun/Moon ephemeris (SunCalc algorithm)",
        },
        "limits": [
            "Valid for SQM 16-22.3 mag/arcsec²; night-time only (sun below -12°).",
            "VIIRS index is a visual-product proxy, not calibrated radiance; 2016 composite.",
            "Training data is mostly USA/Europe; Middle East checked separately with naked-eye reports.",
            "Dust (AOD) not yet a feature — photos from Iraq are used to measure the local offset.",
        ],
    }
    with open(os.path.join(REPORTS, "metrics.json"), "w") as f:
        json.dump(metrics, f, indent=2)
    pd.DataFrame({"lat": df.lat, "lon": df.lon, "measured": y,
                  **{f"pred_{k}": v for k, v in oof.items()}}).to_csv(
        os.path.join(TABLES, "oof_predictions.csv"), index=False)

    export_model(best, model, cols, metrics, importances, resid_std, {
        "satellite_only": {"feature": SAT_ONLY[0], "coef": float(sat.coef_[0]), "intercept": float(sat.intercept_)},
    })
    plots(df, y, oof, best, importances)
    print("feature importance:", dict(sorted(importances.items(), key=lambda kv: -kv[1])))


if __name__ == "__main__":
    main()
