"""Run this FIRST after dropping your .tif files in backend/app/data/rasters/ :
    python tools/inspect_rasters.py
Prints size, CRS, resolution, nodata, value range for each of the 7 files and how the app will read them."""
import sys
from pathlib import Path
import numpy as np
import rasterio
from rasterio.enums import Resampling

NAMES = ["orthomosaic", "elevation", "hillshade", "hirise_slope", "secondary_slope", "confidence", "hazard"]
D = Path(__file__).resolve().parents[1] / "backend" / "app" / "data" / "rasters"
if len(sys.argv) > 1:
    D = Path(sys.argv[1])
print(f"Folder: {D}\n")
for n in NAMES:
    p = D / f"{n}.tif"
    if not p.exists():
        print(f"[ MISSING ] {n}.tif   -> app will fill this layer automatically (flagged DEMO/DERIVED)\n")
        continue
    with rasterio.open(p) as ds:
        k = max(1, int(max(ds.width, ds.height) / 800))
        a = ds.read(1, out_shape=(ds.height // k or 1, ds.width // k or 1), resampling=Resampling.nearest, masked=True)
        v = a.compressed().astype("float64")
        v = v[np.isfinite(v)]
        print(f"[   OK    ] {n}.tif  {ds.width}x{ds.height}px  bands={ds.count}  dtype={ds.dtypes[0]}")
        print(f"            size {p.stat().st_size/1e6:.0f} MB | res {ds.res[0]:.4g} | nodata {ds.nodata} | overviews {ds.overviews(1)}")
        print(f"            CRS  {ds.crs.to_string()[:90] if ds.crs else 'NONE (will assume metres, centred on Jezero)'}")
        if v.size:
            u = np.unique(v[:: max(1, v.size // 100000)])
            print(f"            values min {v.min():.4g} max {v.max():.4g} p2-p98 {np.percentile(v,2):.4g}..{np.percentile(v,98):.4g}", end="")
            print(f" | unique {u[:10].tolist()}" if len(u) <= 10 else "")
        if n == "hazard" and v.size:
            print("            HAZARD: lowest positive value = safer, highest = danger (default). If it is the other way round,")
            print('            create layers.json:  {"hazard": {"higher_is": "safe"}}')
        if ds.count == 3 and n == "confidence":
            print("            confidence is RGB: trust is read from 'greenness' (green = high). Single-band files also work.")
        if not ds.overviews(1) and ds.width * ds.height > 4_000_000:
            print("            TIP: no overviews. The server builds a .ovr next to the file on first start (or run tools/prepare_rasters.py).")
    print()
