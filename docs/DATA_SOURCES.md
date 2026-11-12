# Data sources & how the data team gets real rasters

Run first: `python data/scripts/00_verify_sources.py` (needs internet). Write results here.

The optional NASA Open API key is read from the `NASA_API_KEY` environment
variable and is used only for `api.nasa.gov` verification requests. Do not put
the real key in source files or commit it. In PowerShell, set it for the
current terminal session with:

```powershell
$env:NASA_API_KEY = "<your-new-key>"
python data/scripts/00_verify_sources.py
```

The key pasted into chat should be revoked and regenerated before use. The
`.env.example` file is documentation only; it is not loaded automatically.

| Need | Where to look | Format we need | Status |
|---|---|---|---|
| Elevation (TRUE metres) | Mars Trek (export/download), USGS Astrogeology downloads, HiRISE DTM list, PDS Geosciences | GeoTIFF, metres | **Imported coarse fallback**: USGS MOLA 463 m crop |
| Imagery | Mars Trek layers (CTX / HiRISE mosaics), USGS | GeoTIFF or picture | TO DO |
| Science sites | NASA Mars 2020 (Perseverance) mission pages, papers, Mars Trek | sites.csv rows + source_url | TO DO |
| POV images | Perseverance raw images page | pov.csv rows | TO DO |
| Bangladesh craters | USGS Gazetteer of Planetary Nomenclature | already in data/bangladesh_craters.json | Teknaf (ID 16045) and Satkania (16048) checked; Bogra/Srīpur/Ruhea coordinates approximate -> verify |

## Verification notes (2026-10-31)

- Mars Trek, USGS, PDS Geosciences, HiRISE DTM landing page, and the Mars
  2020 raw-image portal were reachable.
- `https://api.nasa.gov/mars-wmts/catalog` returned HTTP 404 and is not an
  active dependency.
- The PDS Mars 2020 archive confirms public rover camera bundles and a
  Perseverance Analyst's Notebook; these are candidate sources for verified
  site/POV records.
- `data/raw/jezero_dem.tif` is now a real 43 x 43 crop from the USGS-hosted
  MGS MOLA global DEM. The importer uses HTTP range requests and does not
  download the approximately 2.1 GB global file. It is an honest coarse
  fallback, not a substitute for a HiRISE/CTX local DTM.
- `data/processed/jezero_delta/` has been rebuilt from that DEM. Imagery,
  verified science-site records, hazards, and POV media remain MISSING.

**Warning:** Mars Trek "DEM grayscale" web tiles are 8-bit pictures. Do NOT compute slope from them. Use a real elevation GeoTIFF.
Pick the finest elevation product that covers the box. Record: mission, instrument, product name, resolution, date, URL -> goes in `data/regions.yaml` (dem:/image: blocks) and shows in the app's "Data sources" tab.
Check coverage FIRST (a footprint layer on Mars Trek) before promising any region.

## Status of the layers (honest table)
| Layer | In repo today | To make it real |
|---|---|---|
| Elevation / slope | SYNTHETIC grids; real 43x43 MOLA crop for Jezero in data/raw (not used by the demo grid) | Mars Trek / USGS DTM -> data/raw -> `run_all.py --region jezero_delta` |
| Optical imagery | SYNTHETIC colourised terrain | CTX / HiRISE orthoimage GeoTIFF |
| Chemical index | SYNTHETIC hydrated-mineral style index with a deliberate no-coverage patch | Orbital spectrometer product (e.g. CRISM/TES) or rover composition table; write `chem.npy` on the same grid |
| Radiation / space weather | ILLUSTRATIVE placeholders (config.py); optional live NASA DONKI solar events | MSL RAD surface dose rates; keep DONKI labelled as near-Earth solar events |
| Sites / hazards / POV | SYNTHETIC | `data/inputs/jezero_delta/*.csv` with source_url; POV photos only if taken AT the site |
| Bangladesh craters | Real names, diameters, approval years; SYNTHETIC rim-window terrain | Verify Bogra/Sripur/Ruhea coordinates in the Gazetteer; real DEM if one exists |
