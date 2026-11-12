# MASTER PROMPT — finish RedNav-N399 (paste into Claude Code / Codex inside the repo root)

You are a senior full-stack engineer finishing a NASA Space Apps 2026 prototype ("Interplanetary Survival Guide: Martian Map") with a student team. Work inside this repo. Read first: README.md, AGENTS.md, docs/PROJECT_CONTEXT.md, docs/API_SPEC.md, docs/TASKS.md, docs/DATA_SOURCES.md.

## Goal (from NASA, do exactly this and nothing more)
A layered, integrated view of ONE Mars region built from real NASA/USGS data, with: (1) >=3 data kinds (imagery, elevation->slope, science sites + rover POV photos); (2) layer toggles that align; (3) an algorithmic route from a start to a science site that avoids steep and marked-hazard cells; (4) explanations (why this route, assumptions, limits); (5) provenance for every layer (mission, product, resolution, date, static/historical); (6) a helmet-HUD interface that walks the route (simulated). Missing data must be displayed as missing. Never fake data. Never claim "safe".

## Current state
- backend/ FastAPI + A* routing + 10 passing tests (synthetic fixtures).
- data/scripts pipeline: 00_verify_sources, 02_build_region (GeoTIFF -> local metre grid -> slope/hillshade/hazard PNG), 03_build_sites (CSV -> JSON), 04_bangladesh_sites, make_demo_region, run_all. 02_build_region was tested on a synthetic GeoTIFF only.
- frontend/ Next.js 15 helmet HUD wired to the API (LayeredMapModal is the main screen). Builds clean.
- Real rasters, sites, hazards, POV images are NOT in the repo yet: the data team supplies them.

## Tasks, in order (stop and ask if blocked; do not invent data)
1. Run `make test`, `python data/scripts/run_all.py --demo`, start API + frontend, click through the whole flow; fix bugs found. Report what you verified vs not.
2. When real files appear in data/raw and data/inputs/jezero_delta/*.csv, run `python data/scripts/run_all.py --region jezero_delta`; fix pipeline errors (CRS issues, nodata, resolution mismatch). Confirm layers align by checking a known landmark in imagery vs hillshade.
3. Make hazards better only with real evidence: if hazards.csv is empty, say so in the UI (already warns); do not auto-invent boulders.
4. Add the five Bangladesh regions (data/regions.yaml bd_*) after the team verifies their coordinates; each must show honest "coarse data" warnings and "no rover photo" states.
5. Add backend tests for any new logic; keep `make test` green.
6. Frontend polish within the theme only: loading/error states, keyboard access, mobile width, readable contrast. No new features.
7. Final check: `cd frontend && npx tsc --noEmit && npm run build`; update docs/API_SPEC.md if endpoints changed; write docs/VALIDATION.md with evidence for: layers aligned, route reaches goal, obstacle changes route, slope limit changes route, missing data visible, travel-time assumptions explained.

## Constraints
Scope limit above. Keep thresholds in backend/app/config.py. Keep provenance fields. Explain every non-obvious choice in a short comment. Commit in small steps with clear messages.
