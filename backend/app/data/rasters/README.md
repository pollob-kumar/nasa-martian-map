# Put your 7 GeoTIFFs here  (exact names)

| file | what it is |
|---|---|
| `orthomosaic.tif` | HiRISE orthomosaic (0.25 m) - map background |
| `elevation.tif` | HiRISE DTM / MOLA elevation (1 m) |
| `hillshade.tif` | relief shading |
| `hirise_slope.tif` | main slope - used for routes |
| `secondary_slope.tif` | second slope set - cross-check |
| `confidence.tif` | HiRISE FOM colour confidence (RGB or 1 band) |
| `hazard.tif` | hazard map (danger / medium / safer) |

* Any CRS, any resolution, layers may differ. Missing file = that layer is filled (derived/demo) and badged.
* Optional: `sites.json`, `hazards.json` (same format as the API), `layers.json` (only if auto-detection is wrong):
  `{"hazard": {"higher_is": "safe"}, "hirise_slope": {"units": "percent"}, "confidence": {"mode": "gray"}}`
* Check what the app understood:  `python tools/inspect_rasters.py`
* New files while the server runs: open `http://localhost:8000/docs` -> `POST /api/layers/reload`, or just restart.
