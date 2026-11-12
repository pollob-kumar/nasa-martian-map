# Feature map: NASA brief points -> what is built (and what is still synthetic)
| Brief | Built | Where |
|---|---|---|
| 1.1 what each data is for | Data tab: mission/instrument/resolution/limit per layer, CRS + alignment note | LayeredMapModal (Data), meta.crs |
| 1.2 routes / destinations / quick & safe decisions | 3 route strategies with distance, elevation gain, max/mean slope, walk + mission time, oxygen; destination geology/purpose/chem/photos; Route Analysis window | /api/route, RouteAnalysisWindow |
| 1.3.1 layer selection | Imagery, terrain shading, slope, no-go, **chemical**, **geological features**, **rover observations**, hazards, sites, routes | LayeredMapModal |
| 1.3.2 Bangladesh places | 5 craters selectable + Mars overview chart (landing page and map sidebar) | MarsOverviewMap, make_bangladesh_demo.py |
| 1.3.4 plan + carry out | Planning (map/route/hazards/distance) and HUD walk (position, next turn, warnings, arrival science) | LayeredMapModal, MarsHudApp |
| 1.3.5 interesting rock on the way | Routed (A*) detour: location, why interesting, extra distance/time, hazards to consider | explain.routed_detours |
| 2.1 make connections / apply context | "Target here; direct path crosses a high-slope zone; check alternative route" + oxygen/missing-data insights | explain.insights |
| 2.5 route window | After planning: which data, obstacles, destination, why alternatives, evidence | RouteAnalysisWindow |
| 3.1 astronaut then helmet | Intro: astronaut on surface -> zoom into visor -> HUD | AstronautIntro |
| 3.3 Boxwork goal (optional) | Synthetic boxwork site + feature in the Jezero demo (real boxwork data not bundled) | make_jezero_demo.py |
| 3.5 >=3 data types | Optical, topographic, chemical (+ radiation context). Alignment, resolution, MISSING shown | meta, Data tab |
| 3.6 safety | Slope analysis, hazard layer, alternatives, per-route reasons, missing-data warnings, wording "below the slope limit in the data used" | costmap, explain |
| 3.7 space weather / radiation | Safety tab + per-route dose estimate (illustrative) + optional live DONKI | spaceweather.py, SafetyContextPanel |
| 3.8 suit: travel time, oxygen | Oxygen model with slope + cargo + stops, reserve, round trip, point of no return in HUD | routing/suit.py |
| 4.1 HUD priority | Level 1 essential / 2 standard / 3 detail (keys 1-3) | MarsHudApp |
| 4.3 POV marker | Click site: name, position, rover photo, date, rover/camera, science context | Site tab |

**Everything marked SYNTHETIC is labelled in the UI and in meta.json (`synthetic:true`). Replace with real files per docs/DATA_SOURCES.md.**
