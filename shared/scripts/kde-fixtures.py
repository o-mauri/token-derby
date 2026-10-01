# Reference values from scipy.stats.gaussian_kde for shared/test/attendance/kde.test.ts.
# Run: uvx --with numpy --with scipy python shared/scripts/kde-fixtures.py > shared/test/fixtures/kde.json
import json
import numpy as np
from scipy.stats import gaussian_kde

GRID, BIN = 240, 6
rng = np.random.default_rng(7)

def office(n):
    a = rng.normal(570, 20, n)
    d = a + rng.normal(450, 35, n)
    return list(zip(a, d))

def split(n):
    early = [(rng.normal(480, 15), rng.normal(780, 20)) for _ in range(n // 2)]
    late = [(rng.normal(780, 25), rng.normal(1080, 25)) for _ in range(n - n // 2)]
    return early + late

cases = {"office": office(12), "split": split(20), "wide": office(40)}
centres = (np.arange(GRID) + 0.5) * BIN
X, Y = np.meshgrid(centres, centres, indexing="ij")
out = []
for name, spans in cases.items():
    spans = [(float(a), float(max(a, d))) for a, d in spans]
    kde = gaussian_kde(np.array(spans).T)
    vals = kde(np.vstack([X.ravel(), Y.ravel()])).reshape(GRID, GRID)
    vals[Y < X] = 0
    vals /= vals.sum()
    peak = np.unravel_index(np.argmax(vals), vals.shape)
    probes = [(int(peak[0]), int(peak[1]))]
    while len(probes) < 60:
        x, y = int(rng.integers(0, GRID)), int(rng.integers(0, GRID))
        if y >= x and vals[x, y] > vals.max() * 1e-3:
            probes.append((x, y))
    out.append({
        "name": name,
        "spans": [[a, d] for a, d in spans],
        "max": float(vals.max()),
        "probes": [[x, y, float(vals[x, y])] for x, y in probes],
    })
print(json.dumps({"cases": out}))
