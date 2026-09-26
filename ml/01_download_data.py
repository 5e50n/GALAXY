"""Step 1 — Download ground-truth sky measurements from Globe at Night.

Globe at Night (NOIRLab) is a citizen-science campaign: people measure how
dark their sky is, many with an SQM meter (Sky Quality Meter, mag/arcsec^2).
Those SQM readings are our TARGET (the "truth" the model learns to predict).
"""
import os
import urllib.request

YEARS = {
    2025: "1190", 2024: "926", 2023: "661", 2022: "662",
    2021: "663", 2020: "679", 2019: "665",
}
OUT = os.path.join(os.path.dirname(__file__), "data", "raw")

os.makedirs(OUT, exist_ok=True)
for year, doc in YEARS.items():
    path = os.path.join(OUT, f"GaN{year}.csv")
    if os.path.exists(path):
        print(f"GaN{year}.csv already downloaded")
        continue
    url = f"https://globeatnight.org/documents/{doc}/GaN{year}.csv"
    print("downloading", url)
    urllib.request.urlretrieve(url, path)
print("done ->", OUT)
