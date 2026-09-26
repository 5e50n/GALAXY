"""Run the exported JSON model in Python (same logic as src/modules/skyModel.js).

Used by the photo analysis and to verify the export matches sklearn.
"""
import json

import numpy as np


class JsonSkyModel:
    def __init__(self, path):
        with open(path) as f:
            self.m = json.load(f)
        self.features = self.m["features"]

    @staticmethod
    def _tree(t, x):
        n = 0
        while t["l"][n] != -1:
            n = t["l"][n] if x[t["f"][n]] <= t["t"][n] else t["r"][n]
        return t["v"][n]

    def predict_one(self, x):
        trees = self.m["trees"]
        if self.m["type"] == "hgb":
            return self.m["init"] + sum(self._tree(t, x) for t in trees)
        if self.m["type"] == "gbr":
            return self.m["init"] + self.m["lr"] * sum(self._tree(t, x) for t in trees)
        return sum(self._tree(t, x) for t in trees) / len(trees)

    def predict(self, df):
        X = df[self.features].to_numpy(dtype=float)
        return np.array([self.predict_one(x) for x in X])
