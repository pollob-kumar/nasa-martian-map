# Who does what (6 people). Finish all "Definition of done" lines = project done.

## 1 · Backend — Pollob  (backend/)
- [x] Run `make test` (25 tests pass).
- [ ] Review thresholds in `backend/app/config.py`; decide final defaults, write reasons in docs/PROJECT_CONTEXT.md.
- [ ] Add `via_site_ids` UI support if frontend wants multi-stop (API already works).
- [ ] Deploy API (any VPS/Render); set `REDNAV_CORS` to the frontend URL.
- [ ] Support data team: make `02_build_region.py` run on the real Jezero rasters; fix errors.
**Done when:** `POST /api/route` on the real Jezero region returns 2-3 routes, blocks no-data cells, and changes when an obstacle or slope limit changes.

## 2 · Frontend — (frontend/)
- [ ] `cp .env.example .env.local`, `npm install`, `npm run dev`; test with demo region.
- [ ] Check every screen on laptop + phone width; fix overlaps.
- [ ] Keep the theme (dark, red/cyan HUD). Do not add new features.
- [ ] Replace the 4 images in `public/images` if their origin is unclear (see below).
**Done when:** landing -> pick region -> MAP & ROUTE shows layers, markers, routes, data-source tab -> HUD walk follows the route.

## 3 · Data collector A — imagery + elevation (data/)
- [ ] Run 00_verify_sources.py; note what works.
- [ ] Choose Jezero box in Mars Trek (center/size in regions.yaml); confirm coverage by HiRISE/CTX/DTM.
- [ ] Download elevation GeoTIFF + image GeoTIFF into data/raw/; fill dem:/image: blocks in regions.yaml (mission, product, resolution, date, url).
- [ ] `python data/scripts/run_all.py --region jezero_delta`; open the app and check layers line up with landmarks.
**Done when:** Jezero region shows real imagery + real slope, and the Data-sources tab is fully filled.

## 4 · Data collector B — science + hazards + POV (data/inputs/)
- [ ] Fill `sites.csv` (base first, then 3-6 science sites; every row has source_url).
- [ ] Fill `hazards.csv` (boulder fields/cliffs marked by eye on HiRISE/CTX; cite the image id).
- [ ] Fill `pov.csv` only with rover photos taken AT that site (NASA brief warns against nearby substitutes).
- [ ] Verify Bogra/Srīpur/Ruhea coordinates in the Gazetteer; fix regions.yaml; build the 5 bd_ regions.
**Done when:** `run_all.py --region jezero_delta` prints sites/hazards/POV counts > 0, and each Bangladesh region loads.

## 5 · Flexible member — QA + (optional) model
- [ ] Write the validation checklist from the NASA doc: layers aligned · route reaches goal · obstacle changes route · slope limit changes route · missing data visible · travel-time assumptions explained. Run it and log results.
- [ ] Prepare 3 screenshots/GIFs + a 1-page "data sources & limits" for judges.
- [ ] Only if everything above is done: optional rock/boulder detection on a HiRISE crop to propose hazard circles (a human must still confirm them).
**Done when:** checklist all green with evidence.

## 6 · Presenter (voice)
- [ ] Script (2 min): problem -> our region + goal -> 3 data types -> route demo with an obstacle -> honest limits -> Bangladesh angle.
- [ ] Rehearse with the live demo; prepare an offline screen recording as backup.
**Done when:** a timed, recorded run-through exists.

### Known issues found in the old frontend (already handled)
Fake crew/telemetry/radiation/RIMFAX numbers removed or labelled SIMULATED · "Google Earth/Maps" branding removed · camera & scan screens removed (not asked by NASA) · 16 unused images removed. Remaining 4 images are visual textures only: **confirm where they came from**; do not call AI-generated pictures "NASA".
