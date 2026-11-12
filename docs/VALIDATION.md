# Validation evidence (run 2026-11-04)
Command: `python backend/scripts/validate.py` (Jezero demo region, SYNTHETIC data) and `cd backend && python -m pytest -q` (25 tests pass).

```
PASS  layers aligned: grid 100x100 @ 50.0 m; imagery, hillshade, slope, hazard, chemical rasters all 100x100
PASS  route reaches goal: 3 routes, balanced 4211.3 m, max slope 13.7 deg, no cell over the limit
PASS  obstacle changes route: 4211.3 m -> 5884.9 m after blocking the only pass in the scarp
PASS  slope limit changes route: limit 20 deg: 4211.3 m; limit 70 deg: 3977.0 m
PASS  missing data visible: 224 chemical cells have NO coverage (drawn grey, API returns None); BD craters: rover photos MISSING
PASS  travel-time / oxygen assumptions explained: walk 87.7 min -> 175.5 min with 2x cargo; O2 on arrival 78.2%, after return 57.7% (reserve 25%)
PASS  5 Bangladesh regions route: base -> rim route found in each (SYNTHETIC terrain)
```
UI checked in headless Chromium (WebGL off, so the 3-D surface shows a plain backdrop): landing + overview chart, intro, map with all layers, Route Analysis window, Safety / Site / Data tabs, HUD at levels 1-3, walking simulation. Not checked: WebGL 3-D scene, phone widths, live NASA DONKI call (no internet in the build sandbox).

## What this does NOT prove
All terrain, imagery, chemistry, sites, hazards and photos are synthetic. The route logic is validated; the science content is not. Thresholds, the oxygen model and the radiation numbers are assumptions (config.py).
