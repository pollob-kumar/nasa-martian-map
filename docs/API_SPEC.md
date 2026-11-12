# API (FastAPI, http://localhost:8000, docs at /docs)

| Method | Path | Returns |
|---|---|---|
| GET | /api/health | `{ok, regions_ready[]}` |
| GET | /api/regions | `[{id,name,role,center}]` |
| GET | /api/regions/{id} | meta: grid, layers[] (provenance), warnings, defaults, layer_urls, stats |
| GET | /api/regions/{id}/sites | science sites (+ pov_images) |
| GET | /api/regions/{id}/hazards | analyst-marked hazards |
| GET | /api/regions/{id}/geology | geological feature polygons (lat/lon) |
| GET | /api/space-weather | radiation / solar-activity safety context (ILLUSTRATIVE unless live DONKI is enabled) |
| GET | /api/regions/{id}/layers/{imagery\|hillshade\|slope\|hazard\|chemical}.png | layer picture (404 if missing) |
| GET | /api/regions/{id}/media/{file} | POV images |
| POST | /api/route | see below |

`POST /api/route` body: `{region_id, start:{lat,lon}, goal_site_id | goal:{lat,lon}, via_site_ids[], max_slope_deg?, caution_slope_deg?, walk_speed_ms?, load_factor?, science_stop_min?, obstacles:[{lat,lon,radius_m}]}`
Returns `insights[]` (context warnings), `direct_line`, `assumptions`, and `routes[]` (balanced / safest / shortest_feasible; each: points[], distance_m, max/mean_slope_deg, elev_gain_m, walk_time_min, mission_time_min, reasons[], assumptions), `nearby_science[]`, `warnings[]`, `disclaimer`.
Rules: unknown (NaN) cells and cells over the slope limit are blocked; no route => `found:false`, never a fake line.

## Processed-data contract (data/processed/<region>/)
meta.json · dem.npy (float32 m, NaN=no data, row0=north) · slope.npy · imagery.png · hillshade.png · slope.png · hazard.png · sites.json · hazards.json · media/
Coordinates: lat deg, lon deg EAST 0-360.

## Added fields (route response)
Each found route also has: `safety.oxygen` (walk/stop/one-way/round-trip use %, remaining %, reserve, ok flags), `safety.radiation` (synthetic placeholder dose), per-point `t_min` and `o2_used_pct`, and `explanation` = {data_used[], obstacles{near_route[], blocked_steep_cells,...}, science_destination{}, why_alternatives[], evidence[], missing_data[], route_statement}.
`nearby_science[]` now = real A* detours: `{id,name,reachable,extra_distance_m,extra_time_min,why_interesting,geology,chemical_index,considerations[]}`.
Region meta adds `suit_assumptions`, `crs`, `layer_urls.chemical`; `/api/regions` adds `synthetic`, `bangladesh{}` facts, `coord_status`.
Optional processed files: `chem.npy`/`chemical.png` (0..1, NaN = no coverage), `geology.json`.
Env: `REDNAV_LIVE_SPACE_WEATHER=1` + `NASA_API_KEY` adds recent solar flares from NASA DONKI (untested without internet; falls back honestly).
