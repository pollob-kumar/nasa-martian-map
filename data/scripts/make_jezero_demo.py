"""Create a complete synthetic Jezero demo region.

This intentionally replaces the processed Jezero region for local demos. It
does not replace the real MOLA source in data/raw and every output is marked
synthetic so it cannot be confused with NASA data.
"""
import math

import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import gaussian_filter

from pipeline import PROCESSED, write_region, layer_entry


RID = "jezero_delta"
N, CELL = 100, 50.0   # 5 km x 5 km walking-scale window (synthetic)
LAT0, LON0 = 18.45, 77.42
MARS_R = 3_396_190.0
NORTH_LAT = LAT0 + math.degrees((N * CELL / 2) / MARS_R)
WEST_LON = LON0 - math.degrees((N * CELL / 2) / (MARS_R * math.cos(math.radians(LAT0))))


def ll(row: int, col: int) -> tuple[float, float]:
    return (
        NORTH_LAT - row * CELL / (MARS_R * math.pi / 180),
        WEST_LON + col * CELL / (MARS_R * math.cos(math.radians(LAT0)) * math.pi / 180),
    )


def g_rc(lat: float, lon: float) -> tuple[int, int]:
    r = (NORTH_LAT - lat) * (MARS_R * math.pi / 180) / CELL
    c = (lon - WEST_LON) * (MARS_R * math.cos(math.radians(LAT0)) * math.pi / 180) / CELL
    return min(max(int(round(r)), 0), N - 1), min(max(int(round(c)), 0), N - 1)


rng = np.random.default_rng(399)
y, x = np.mgrid[0:N, 0:N].astype("float32")
terrain = (
    40 * np.sin(x / 10)
    + 30 * np.cos(y / 12)
    + 15 * gaussian_filter(rng.standard_normal((N, N)), 4)
)
terrain += 120 * np.exp(-((x - 70) ** 2 + (y - 30) ** 2) / (2 * 7**2))       # delta-like mound
# a synthetic scarp (steep ridge) across the region with ONE pass: forces routes through the gap or around the east end
ridge_taper = 1 / (1 + np.exp(-(x - 8) / 1.5)) * 1 / (1 + np.exp((x - 90) / 1.5))
ridge_gap = 1 - np.exp(-((x - 55) ** 2) / (2 * 3.2**2))
terrain += 220 * np.exp(-((y - 45) ** 2) / (2 * 2.5**2)) * ridge_taper * ridge_gap
terrain -= 2540
terrain = terrain.astype("float32")

norm = np.clip((terrain - terrain.min()) / np.ptp(terrain), 0, 1)
rgb = np.stack(
    [
        105 + norm * 125,
        48 + norm * 72,
        25 + norm * 45,
    ],
    axis=-1,
).astype("uint8")

site_specs = [
    ("jezero_demo_base", "Synthetic Mission Base", 82, 12, "Start / base"),
    ("jezero_demo_delta", "Synthetic Western Delta", 30, 70, "Study layered delta deposits"),
    ("jezero_demo_crater", "Synthetic Crater Rim", 63, 83, "Compare impact-modified terrain"),
    ("jezero_demo_lakebed", "Synthetic Lakebed", 20, 25, "Inspect ancient basin sediments"),
    ("jezero_demo_boxwork", "Synthetic Boxwork Ridge Network", 74, 42, "Boxwork formation study (NASA-suggested optional goal)"),
]
# extra science context per site (ALL SYNTHETIC) - answers 'what formation / why go there / what to expect'
SITE_INFO = {
    "jezero_demo_base": ("Flat landing-style terrain used as the start point.", "Staging point for the excursion."),
    "jezero_demo_delta": ("Fan-shaped stack of layered sediments (synthetic stand-in for a river-delta deposit).", "Check whether layers record standing water and whether they preserve chemical signs worth sampling."),
    "jezero_demo_crater": ("Raised, impact-modified rim with blocky material.", "Compare impact-altered rock with the delta layers; rim material can expose deeper strata."),
    "jezero_demo_lakebed": ("Smooth basin-floor sediments (synthetic).", "Inspect fine-grained basin sediments as a baseline for the delta comparison."),
    "jezero_demo_boxwork": ("Network of intersecting low ridges enclosing hollows, a 'boxwork' style pattern (synthetic).", "Boxwork-type ridges can mark where fluids hardened cracks in the rock; the team demo uses it to show how a science goal drives route choice."),
}
sites = []
for sid, name, row, col, goal in site_specs:
    lat, lon = ll(row, col)
    sites.append(
        {
            "id": sid,
            "name": name,
            "lat": lat,
            "lon": lon,
            "goal": goal,
            "description": "Synthetic demonstration feature; not a real NASA science target. " + SITE_INFO[sid][0],
            "geology": SITE_INFO[sid][0],
            "science_purpose": SITE_INFO[sid][1],
            "mission": "synthetic demonstration",
            "observed": "synthetic",
            "source_url": "",
            "pov_images": [],
        }
    )

# ---- chemical layer (SYNTHETIC hydrated-mineral style index, 0..1; NaN patch = no coverage, shown as MISSING) ----
chem = (
    0.25
    + 0.55 * np.exp(-((x - 70) ** 2 + (y - 30) ** 2) / (2 * 10**2))      # strong near the delta
    + 0.35 * np.exp(-((x - 25) ** 2 + (y - 20) ** 2) / (2 * 9**2))       # moderate on the lakebed
    + 0.45 * np.exp(-((x - 42) ** 2 + (y - 74) ** 2) / (2 * 7**2))       # boxwork zone
    + 0.06 * gaussian_filter(rng.standard_normal((N, N)), 2)
)
chem = np.clip(chem, 0, 1).astype("float32")
chem[0:14, 84:100] = np.nan   # deliberate coverage gap: the UI must show this as MISSING, not as a value
CHEM_CLASS = lambda v: "NO COVERAGE (missing)" if v != v else ("high" if v >= 0.6 else "moderate" if v >= 0.4 else "low")
for s_ in sites:
    r_, c_ = g_rc(s_["lat"], s_["lon"])
    v_ = float(chem[r_, c_])
    s_["chem_index"] = None if v_ != v_ else round(v_, 2)
    s_["chemistry"] = f"Synthetic hydrated-mineral style index: {CHEM_CLASS(v_)}" + ("" if v_ != v_ else f" ({v_:.2f})")

# ---- geological features (SYNTHETIC polygons in lat/lon) ----
def blob(cr, cc, rr, rc, n=18, wob=0.0, seed=0):
    rg = np.random.default_rng(seed)
    pts = []
    for k in range(n):
        a = 2 * math.pi * k / n
        f = 1 + wob * rg.uniform(-1, 1)
        pts.append(list(ll(cr + rr * f * math.sin(a), cc + rc * f * math.cos(a))))
    return pts

geology = [
    {"id": "geo_delta", "name": "Synthetic delta fan deposit", "type": "delta", "polygon": blob(30, 70, 14, 16, wob=0.18, seed=1),
     "description": "Layered fan-shaped sediments (synthetic).", "synthetic": True},
    {"id": "geo_rim", "name": "Synthetic crater rim material", "type": "crater_rim", "polygon": blob(63, 83, 9, 9, wob=0.08, seed=2),
     "description": "Impact-modified rim blocks (synthetic).", "synthetic": True},
    {"id": "geo_lakebed", "name": "Synthetic lakebed sediments", "type": "lakebed", "polygon": blob(20, 25, 12, 15, wob=0.2, seed=3),
     "description": "Smooth fine-grained basin floor (synthetic).", "synthetic": True},
    {"id": "geo_boxwork", "name": "Synthetic boxwork ridge network", "type": "boxwork", "polygon": blob(74, 42, 9, 11, wob=0.15, seed=4),
     "description": "Intersecting low ridges enclosing hollows (synthetic).", "synthetic": True},
]

hazards = []
for i, (name, row, col, radius, reason) in enumerate(
    [
        ("Synthetic Boulder Field", 56, 46, 150, "Synthetic obstacle for route avoidance"),
        ("Synthetic Steep Scarp", 41, 61, 120, "Synthetic slope hazard for route avoidance"),
        ("Synthetic Sand Patch", 70, 67, 150, "Synthetic terrain hazard for route avoidance"),
    ]
):
    lat, lon = ll(row, col)
    hazards.append(
        {
            "id": f"jezero_demo_hazard_{i}",
            "name": name,
            "lat": lat,
            "lon": lon,
            "radius_m": radius,
            "reason": reason,
            "source_url": "",
            "synthetic": True,
        }
    )

meta = {
    "id": RID,
    "name": "Jezero Crater - Western Delta (SYNTHETIC DEMO)",
    "role": "primary",
    "synthetic": True,
    "science_goal": "Synthetic end-to-end route-planning demonstration",
    "center": {"lat": LAT0, "lon": LON0},
    "coord_status": "synthetic",
    "grid": {"width": N, "height": N, "cell_m": CELL, "north_lat": NORTH_LAT, "west_lon": WEST_LON},
    "layers": [
        layer_entry(
            "topographic",
            "Synthetic elevation / slope",
            "none",
            "numpy",
            "make_jezero_demo.py",
            CELL,
            "synthetic",
            "static",
            "",
            "Synthetic terrain. Not NASA data; slope is for UI and routing demonstration only.",
        ),
        layer_entry(
            "optical",
            "Synthetic surface imagery",
            "none",
            "numpy/Pillow",
            "make_jezero_demo.py",
            CELL,
            "synthetic",
            "historical",
            "",
            "Synthetic colorized terrain. Not an orbital image.",
        ),
        layer_entry("chemical", "Synthetic chemical index (hydrated-mineral style)", "none", "numpy", "make_jezero_demo.py", CELL, "synthetic", "static", "",
                    "Synthetic. A real chemical layer would come from orbital spectrometers (e.g. CRISM/TES) or rover instruments; not bundled. A grey patch marks cells with NO coverage."),
        layer_entry("radiation", "Illustrative radiation / space-weather context", "none", "config.py assumptions", "spaceweather.py", 0, "synthetic", "predicted", "",
                    "Placeholder dose rate and limit to demonstrate the Safety panel; not a NASA measurement."),
    ],
    "warnings": [
        "SYNTHETIC DATA - NOT NASA DATA. This Jezero demo enables the complete UI/API workflow.",
        "All sites, hazards, POV images, elevations, and imagery are generated for demonstration.",
    ],
}

out = write_region(RID, meta, terrain, rgb, sites, hazards, chem=chem, geology=geology)
media = out / "media"
for old_file in media.iterdir():
    if old_file.is_file():
        old_file.unlink()
for i, site in enumerate(sites[1:]):
    image = Image.new("RGB", (640, 360), (16, 5, 8))
    draw = ImageDraw.Draw(image)
    draw.rectangle((0, 0, 639, 359), outline=(220, 40, 40), width=4)
    draw.text((28, 28), "SYNTHETIC POV / NOT NASA DATA", fill=(255, 80, 80))
    draw.text((28, 80), site["name"], fill=(80, 230, 255))
    draw.text((28, 132), "Jezero demo visualization", fill=(220, 220, 220))
    filename = f"{site['id']}_0.png"
    image.save(media / filename)
    site["pov_images"].append(
        {
            "url": f"/api/regions/{RID}/media/{filename}",
            "rover": "synthetic rover",
            "camera": "synthetic camera",
            "sol": "synthetic",
            "earth_date": "synthetic",
            "credit": "RedNav-N399 synthetic demo",
            "source_url": "",
        }
    )

(out / "sites.json").write_text(
    __import__("json").dumps(sites, indent=2), encoding="utf-8"
)
print("synthetic Jezero demo written ->", out)
