"""Feature engineering shared by training, photo analysis and the website export.

Every model input is listed in MODEL_FEATURES. src/modules/skyModel.js
builds the exact same vector in the browser, in the same order.
"""
import numpy as np
import pandas as pd

MODEL_FEATURES = [
    "log_light_point",      # NASA VIIRS light right at the site
    "log_light_10km",       # mean light 0-10 km
    "log_light_10_50km",    # mean light 10-50 km
    "log_light_50_160km",   # mean light 50-160 km
    "log_skyglow",          # Walker-law weighted skyglow index
    "elevation_km",         # site elevation
    "moon_illum",           # moon illuminated fraction 0..1
    "moon_alt",             # moon altitude (deg, clipped to [-10, 90])
    "moon_light",           # illum * sin(alt)+  (how much moonlight hits the sky)
    "cloud",                # 0, .25, .5, .75
    "sun_alt",              # sun altitude (deg) — twilight contamination
    "solar_hour",           # hours from local solar midnight (-12..12): lights switch off late at night
    "abs_lat",              # |latitude|: airglow, twilight length, typical humidity band
    "season",               # sin(2π·month/12)·sign(lat): hemisphere-aware season (vegetation, snow, haze)
]

CLOUD_MAP = {"clear": 0.0, "1/4 of sky": 0.25, "1/2 of sky": 0.5, "over 1/2 of sky": 0.75}

LOG_EPS = 1e-4


def log_light(x):
    return np.log10(np.asarray(x, dtype=float) + LOG_EPS)


def add_model_features(df):
    """df needs: light_* columns, skyglow_index, elevation_m, moon_illum, moon_alt, cloud, sun_alt."""
    df = df.copy()
    df["log_light_point"] = log_light(df["light_point"])
    df["log_light_10km"] = log_light(df["light_10km"])
    df["log_light_10_50km"] = log_light(df["light_10_50km"])
    df["log_light_50_160km"] = log_light(df["light_50_160km"])
    df["log_skyglow"] = log_light(df["skyglow_index"])
    df["elevation_km"] = df["elevation_m"].astype(float) / 1000.0
    df["moon_alt"] = df["moon_alt"].clip(-10, 90)
    df["moon_light"] = df["moon_illum"] * np.clip(np.sin(np.radians(df["moon_alt"])), 0, None)
    df["solar_hour"] = solar_hour(df["unix"], df["lon"])
    df["abs_lat"] = df["lat"].astype(float).abs()
    month = pd.to_datetime(df["unix"], unit="s", utc=True).dt.month
    df["season"] = np.sin(2 * np.pi * month / 12) * np.sign(df["lat"].astype(float))
    return df


def solar_hour(unix_seconds, lon):
    """Hours from local solar midnight, in [-12, 12)."""
    h = (np.asarray(unix_seconds, dtype=float) / 3600.0 + np.asarray(lon, dtype=float) / 15.0) % 24
    return (h + 12) % 24 - 12


# ── Sky-quality conversions (same as src/modules/skyMath.js) ──

def nelm_from_sqm(b):
    """Naked-eye limiting magnitude from sky brightness (Unihedron formula)."""
    return 7.93 - 5.0 * np.log10(np.power(10.0, 4.316 - np.asarray(b) / 5.0) + 1.0)


def sqm_from_nelm(nelm):
    """Inverse of nelm_from_sqm."""
    inner = np.power(10.0, (7.93 - np.asarray(nelm, dtype=float)) / 5.0) - 1.0
    inner = np.clip(inner, 1e-6, None)
    return 5.0 * (4.316 - np.log10(inner))
