# Add your data (short)

1. Copy the 7 files into `backend/app/data/rasters/` with these names:
   `orthomosaic.tif` `elevation.tif` `hillshade.tif` `hirise_slope.tif` `secondary_slope.tif` `confidence.tif` `hazard.tif`
2. `python tools/inspect_rasters.py` -> check CRS, value range, hazard values. Fix anything odd with `rasters/layers.json`.
3. Start backend + frontend. No restart needed for later changes: `POST /api/layers/reload`.

## How the layers are used
| layer | used for |
|---|---|
| orthomosaic | map background, radar photo |
| elevation | height readout, route climb |
| hillshade | relief shading |
| hirise_slope | route cost + slope warnings (main) |
| secondary_slope | cross-check: where it differs > 6 deg from the main slope, route cost goes up |
| confidence | low data trust -> extra route cost, "data trust" tag |
| hazard | danger = blocked, medium = extra cost, safer = normal |

## Assumptions (shown to the user, change in `backend/app/core/config.py`)
analysis grid 10 m (auto-coarser for huge areas) - medium hazard +1.5 cost - low trust (<0.35) up to +2 cost - slope sets disagree (>6 deg) +1.
If the hazard map marks > 60 % as danger it is treated as inverted-looking: hazards become extra cost (not walls) and a warning is shown.

## layers.json (optional)
```json
{ "hazard": {"higher_is": "safe", "classes": {"safe": [3], "medium": [2], "danger": [1]}},
  "hirise_slope": {"units": "degrees"},   "confidence": {"mode": "gray"} }
```
Confidence as an RGB colour map is read as "greenness" (green = high trust): an approximation, labelled in the data panel.
Optional `sites.json` / `hazards.json` in the same folder replace the demo-placed sites / add hazard circles.

## Speed
Windowed reads only, never the whole file. Files larger than ~6000 px get a 4096-px fast copy in `backend/app/data/cache/proxy` (built once, originals untouched). Tiles + previews are cached; the route grid is cached on disk.
