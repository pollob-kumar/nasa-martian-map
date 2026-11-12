"""SYNTHETIC demo region so frontend + backend people can start TODAY, before real NASA rasters arrive.
Everything it writes is flagged synthetic=true and the UI shows a red 'NOT NASA DATA' banner."""
import numpy as np
from scipy.ndimage import gaussian_filter
from pipeline import PROCESSED, write_region, layer_entry

N, CELL = 200, 20.0
y, x = np.mgrid[0:N, 0:N].astype("float32")
rng = np.random.default_rng(399)
dem = (60 * np.sin(x / 31) + 45 * np.cos(y / 27) + 40 * gaussian_filter(rng.standard_normal((N, N)), 4)).astype("float32")
dem += 260 * np.exp(-(((x - 110) ** 2) / (2 * 6 ** 2))) * ((y < 70) | (y > 95))   # a ridge with a pass
dem -= 2540
north_lat, west_lon = 18.47, 77.37
rgb = np.stack([np.clip(120 + (dem - dem.min()) / np.ptp(dem) * 110, 0, 255)] * 3, -1)
rgb[..., 1] *= 0.62; rgb[..., 2] *= 0.42


def ll(r, c):
    import math
    return north_lat - r * CELL / (3396190 * math.pi / 180), west_lon + c * CELL / (3396190 * math.cos(math.radians(18.4)) * math.pi / 180)


sites = []
for i, (n, r, c, g) in enumerate([("Demo Habitat", 150, 20, "Start / base"), ("Demo Science Site A", 40, 170, "Demo layered-rock target"), ("Demo Science Site B", 150, 175, "Demo second target")]):
    la, lo = ll(r, c)
    sites.append({"id": f"demo{i}", "name": n, "lat": la, "lon": lo, "goal": g, "description": "SYNTHETIC placeholder, not a real Martian feature.",
                  "mission": "none (synthetic)", "observed": "n/a", "source_url": "", "pov_images": []})
hl, hn = ll(80, 100)
meta = {"id": "demo_synthetic", "name": "DEMO (synthetic) - NOT NASA DATA", "role": "demo", "synthetic": True, "science_goal": "UI/API development only",
        "center": {"lat": ll(100, 100)[0], "lon": ll(100, 100)[1]}, "coord_status": "synthetic",
        "grid": {"width": N, "height": N, "cell_m": CELL, "north_lat": north_lat, "west_lon": west_lon},
        "layers": [layer_entry("topographic", "Synthetic terrain", "none", "numpy", "make_demo_region.py", CELL, "n/a", "static", "", "Randomly generated. Never show as real."),
                   layer_entry("optical", "Synthetic imagery", "none", "numpy", "make_demo_region.py", CELL, "n/a", "static", "", "Randomly generated.")],
        "warnings": ["SYNTHETIC DATA - NOT NASA DATA. For development only."]}
write_region("demo_synthetic", meta, dem, rgb, sites, [{"id": "hz0", "name": "Demo boulder field", "lat": hl, "lon": hn, "radius_m": 150, "reason": "synthetic", "source_url": ""}])
print("demo region written ->", PROCESSED / "demo_synthetic")
