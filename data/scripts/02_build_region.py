"""Build one region from REAL downloaded rasters.

  python 02_build_region.py --region jezero_delta

Inputs (paths set in data/regions.yaml): a DEM GeoTIFF (true metres!) and optionally an image GeoTIFF.
Resamples both onto our local metre grid, computes slope/hillshade/hazard PNGs, writes meta.json with PROVENANCE.
NOTE: Mars Trek WMTS 'DEM grayscale' tiles are 8-bit pictures - do NOT use them for slope. Use a GeoTIFF.
"""
import argparse, sys
from pathlib import Path
import numpy as np
import rasterio
from rasterio.crs import CRS
from rasterio.transform import from_origin
from rasterio.warp import reproject, Resampling
from pipeline import ROOT, MARS_R, load_regions, region_grid, write_region, base_meta, layer_entry


def local_crs(lat0, lon0):
    return CRS.from_proj4(f"+proj=eqc +lat_ts={lat0} +lat_0={lat0} +lon_0={lon0} +x_0=0 +y_0=0 +a={MARS_R} +b={MARS_R} +units=m +no_defs")


def resample(src_path: Path, reg: dict, band_count=1, resampling=Resampling.bilinear):
    import math
    g = region_grid(reg)
    lat0, lon0 = reg["center"]["lat"], reg["center"]["lon"]
    half = g["width"] * g["cell_m"] / 2
    dst_tf = from_origin(-half, half, g["cell_m"], g["cell_m"])
    dst_crs = local_crs(lat0, lon0)
    out = np.full((band_count, g["height"], g["width"]), np.nan, dtype="float32")
    with rasterio.open(src_path) as src:
        for b in range(band_count):
            reproject(source=rasterio.band(src, b + 1), destination=out[b], src_transform=src.transform, src_crs=src.crs,
                      src_nodata=src.nodata, dst_transform=dst_tf, dst_crs=dst_crs, dst_nodata=np.nan, resampling=resampling)
        res = src.res[0]
    return out, res


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--region", required=True)
    a = ap.parse_args()
    regs = load_regions()
    reg = regs[a.region]
    dem_cfg, img_cfg = reg.get("dem"), reg.get("image")
    if not dem_cfg or not Path(ROOT / dem_cfg["file"]).exists():
        sys.exit(f"DEM file missing: {dem_cfg and dem_cfg['file']}. Data team: download it (see docs/DATA_SOURCES.md) and set the path in data/regions.yaml.")
    dem, source_res = resample(ROOT / dem_cfg["file"], reg)
    dem = dem[0]
    dem_res = float(dem_cfg.get("resolution_m") or source_res)
    warnings, layers = [], []
    if reg["cell_m"] < dem_res * 0.9:
        warnings.append(f"Output grid ({reg['cell_m']} m) is finer than the source DEM ({dem_res:.0f} m): detail is interpolated, not real.")
    nod = float(np.isnan(dem).mean() * 100)
    if nod > 0:
        warnings.append(f"{nod:.1f}% of the region has NO elevation data (shown grey, routes never cross it).")
    dem_limitation = dem_cfg.get(
        "limitation",
        "Slope computed by us from this DEM (central differences). Resolution limits hazard detection.",
    )
    layers.append(layer_entry("topographic", "Elevation / Slope", dem_cfg.get("mission", "?"), dem_cfg.get("instrument", "?"),
                              dem_cfg.get("product", "?"), dem_res, dem_cfg.get("acquired", "multi-year, static"), "static",
                              dem_cfg.get("url", ""), dem_limitation))
    if dem_res >= 400:
        warnings.append(
            f"Elevation source resolution is {dem_res:.0f} m: route feasibility is "
            "coarse and does not resolve small landforms."
        )
    imagery = None
    if img_cfg and Path(ROOT / img_cfg["file"]).exists():
        import rasterio as rio
        with rio.open(ROOT / img_cfg["file"]) as s:
            nb = min(3, s.count)
        arr, image_source_res = resample(ROOT / img_cfg["file"], reg, band_count=nb)
        img_res = float(img_cfg.get("resolution_m") or image_source_res)
        arr = np.nan_to_num(arr, nan=0)
        if nb == 1:
            arr = np.repeat(arr, 3, axis=0)
        lo, hi = np.percentile(arr[arr > 0], [2, 98]) if (arr > 0).any() else (0, 1)
        imagery = (np.clip((arr - lo) / max(hi - lo, 1e-6), 0, 1) * 255).transpose(1, 2, 0)
        layers.append(layer_entry("optical", "Surface imagery", img_cfg.get("mission", "?"), img_cfg.get("instrument", "?"),
                                  img_cfg.get("product", "?"), img_res, img_cfg.get("acquired", "?"), "historical",
                                  img_cfg.get("url", ""), "Orbital picture, not a live view. Lighting/season differ from other layers."))
    else:
        warnings.append("No imagery file for this region: imagery layer is MISSING (not faked).")
    meta = base_meta(a.region, reg, layers, warnings)
    out = write_region(a.region, meta, dem, imagery)
    slope = np.load(out / "slope.npy")
    slope_max = float(np.nanmax(slope)) if np.isfinite(slope).any() else "MISSING"
    print("wrote", out, "| grid", meta["grid"]["width"], "x", meta["grid"]["height"], "| slope max", slope_max)


if __name__ == "__main__":
    main()
