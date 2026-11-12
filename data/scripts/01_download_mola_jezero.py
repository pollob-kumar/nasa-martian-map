"""Download a small, reproducible Jezero crop from the USGS MOLA GeoTIFF.

The source is a global 463 m/pixel raster.  This script uses HTTP range
requests, so it downloads only the rows needed for the configured Jezero box
instead of the approximately 2.1 GB global file.
"""
from pathlib import Path
import math

import numpy as np
import requests
import rasterio
from rasterio.crs import CRS
from rasterio.transform import from_origin

from pipeline import ROOT, load_regions


SOURCE_URL = (
    "https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/"
    "Mars_MGS_MOLA_DEM_mosaic_global_463m.tif"
)
GLOBAL_WIDTH = 46080
PIXEL_DEG = 1 / 128
FIRST_STRIP_OFFSET = 184973
BYTES_PER_ROW = GLOBAL_WIDTH * 2
NODATA = -32768


def fetch_range(start: int, end: int) -> bytes:
    response = requests.get(
        SOURCE_URL,
        headers={"Range": f"bytes={start}-{end}"},
        timeout=120,
    )
    response.raise_for_status()
    content = response.content
    expected = end - start + 1
    if len(content) != expected:
        raise RuntimeError(
            f"Range response was {len(content)} bytes; expected {expected}."
        )
    return content


def main() -> None:
    reg = load_regions()["jezero_delta"]
    lat = float(reg["center"]["lat"])
    lon = float(reg["center"]["lon"])
    rows = int(round(reg["size_km"] * 1000 / 463))
    cols = rows
    row_center = math.floor((90 - lat) / PIXEL_DEG)
    col_center = math.floor(lon / PIXEL_DEG)
    row_start = row_center - rows // 2
    col_start = col_center - cols // 2

    start = FIRST_STRIP_OFFSET + row_start * BYTES_PER_ROW
    end = start + rows * BYTES_PER_ROW - 1
    raw = np.frombuffer(fetch_range(start, end), dtype="<i2").reshape(
        rows, GLOBAL_WIDTH
    )
    crop = raw[:, col_start : col_start + cols].astype("float32")
    crop[crop == NODATA] = np.nan

    north_lat = 90 - row_start * PIXEL_DEG
    west_lon = col_start * PIXEL_DEG
    out = ROOT / "data" / "raw" / "jezero_dem.tif"
    out.parent.mkdir(parents=True, exist_ok=True)

    # The source values are Mars elevations.  This CRS preserves Mars' radius
    # so Rasterio can reproject into the pipeline's Mars-local CRS.
    crs = CRS.from_proj4(
        "+proj=longlat +a=3396190 +b=3396190 +lon_0=0 +no_defs"
    )
    profile = {
        "driver": "GTiff",
        "height": crop.shape[0],
        "width": crop.shape[1],
        "count": 1,
        "dtype": "float32",
        "crs": crs,
        "transform": from_origin(west_lon, north_lat, PIXEL_DEG, PIXEL_DEG),
        "nodata": np.nan,
        "compress": "deflate",
    }
    with rasterio.open(out, "w", **profile) as dst:
        dst.write(crop, 1)
    print(
        f"wrote {out} | shape={crop.shape} | "
        f"north={north_lat:.6f} west={west_lon:.6f} | "
        f"resolution=463 m nominal"
    )


if __name__ == "__main__":
    main()
