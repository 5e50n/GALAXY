"""Step 2 — Clean the ground truth and attach NASA + astronomy features.

Output: data/dataset.csv          (SQM rows, used for training)
        data/regional_check.csv   (Middle-East naked-eye rows, used as a regional sanity check)
"""
import glob
import os
import sys

import numpy as np
import pandas as pd

from orbit_ml import astro, viirs
from orbit_ml.features import CLOUD_MAP, sqm_from_nelm

sys.stdout.reconfigure(encoding="utf-8")
HERE = os.path.dirname(__file__)
RAW = os.path.join(HERE, "data", "raw")
REGION = ["Iraq", "Jordan", "Saudi Arabia", "Kuwait", "Syria", "Iran", "Turkey", "Egypt",
          "United Arab Emirates", "Qatar", "Bahrain", "Oman", "Lebanon", "Palestine", "Israel"]


def load_raw():
    frames = []
    for f in sorted(glob.glob(os.path.join(RAW, "GaN*.csv"))):
        frames.append(pd.read_csv(f, low_memory=False, on_bad_lines="skip", encoding_errors="replace"))
    df = pd.concat(frames, ignore_index=True)
    print(f"raw rows: {len(df):,}")
    return df


def clean(df):
    df = df.rename(columns={"Latitude": "lat", "Longitude": "lon", "Elevation(m)": "elevation_m"})
    for c in ["lat", "lon", "elevation_m", "SQMReading", "LimitingMag"]:
        df[c] = pd.to_numeric(df[c], errors="coerce")
    df["cloud"] = df["CloudCover"].map(CLOUD_MAP)
    ts = pd.to_datetime(df["UTDate"].astype(str) + " " + df["UTTime"].astype(str),
                        errors="coerce", utc=True)
    df["unix"] = (ts - pd.Timestamp("1970-01-01", tz="UTC")).dt.total_seconds()
    df = df[ts.notna() & df.lat.between(-85, 85) & df.lon.between(-180, 180)
            & df.elevation_m.between(-100, 5000) & df.cloud.notna()]
    return df


def add_astro(df):
    df = df.copy()
    df["sun_alt"] = astro.sun_altitude_deg(df.unix.values, df.lat.values, df.lon.values)
    df["moon_alt"] = astro.moon_altitude_deg(df.unix.values, df.lat.values, df.lon.values)
    df["moon_illum"] = astro.moon_illumination(df.unix.values)
    return df[df.sun_alt < -12]          # drop twilight observations


def add_viirs(df):
    locs = df[["lat", "lon"]].round(3).drop_duplicates()
    print(f"unique locations: {len(locs):,} — fetching NASA VIIRS tiles")
    viirs.prefetch(locs.itertuples(index=False, name=None))
    rows = []
    for i, (la, lo) in enumerate(locs.itertuples(index=False, name=None)):
        rows.append({"lat_r": la, "lon_r": lo, **viirs.light_features(la, lo)})
        if (i + 1) % 1000 == 0:
            print(f"    features {i + 1}/{len(locs)}")
    feats = pd.DataFrame(rows)
    df = df.assign(lat_r=df.lat.round(3), lon_r=df.lon.round(3))
    return df.merge(feats, on=["lat_r", "lon_r"], how="left").drop(columns=["lat_r", "lon_r"])


KEEP = ["lat", "lon", "elevation_m", "unix", "cloud", "sun_alt", "moon_alt", "moon_illum",
        *viirs.FEATURES, "Country"]


def main():
    df = add_astro(clean(load_raw()))

    # Training set: real SQM meter readings (physically plausible range)
    sqm = df[df.SQMReading.between(16.0, 22.3)].copy()
    # A real SQM meter reports 2 decimals; whole numbers (17.00, 18.00 ...) are typed
    # estimates — in a first run they had 2.6x the error of real readings. Drop them.
    sqm = sqm[(sqm.SQMReading * 100).round() % 100 != 0]
    sqm = sqm.drop_duplicates(subset=["lat", "lon", "unix", "SQMReading"])
    sqm = add_viirs(sqm)
    sqm = sqm[KEEP + ["SQMReading"]].rename(columns={"SQMReading": "sqm"})
    sqm.to_csv(os.path.join(HERE, "data", "dataset.csv"), index=False)
    print(f"dataset.csv: {len(sqm):,} rows")

    # Regional check: naked-eye limiting magnitudes in the Middle East, converted to SQM
    country = df.Country.astype(str).str.split(" - ").str[0].str.strip().str.lower()
    reg = df[country.isin([c.lower() for c in REGION])
             & df.LimitingMag.between(1, 7)].copy()
    if len(reg):
        reg = add_viirs(reg)
        reg["sqm"] = sqm_from_nelm(reg.LimitingMag.clip(1, 7))
        reg[KEEP + ["LimitingMag", "sqm"]].to_csv(os.path.join(HERE, "data", "regional_check.csv"), index=False)
        print(f"regional_check.csv: {len(reg):,} rows ({reg.Country.nunique()} countries)")


if __name__ == "__main__":
    main()
