"""Build the 5 Bangladesh-named Mars craters as selectable regions.

Each region is an 8 km x 8 km WALKING-SCALE WINDOW on the north rim of the crater (a whole 21 km crater is not a Marswalk).
HONESTY: real crater names / diameters / gazetteer links come from data/bangladesh_craters.json (IAU/USGS).
Terrain, imagery, chemistry, sites and hazards here are SYNTHETIC crater-shaped stand-ins (synthetic:true) because no
fine-resolution DEM or rover data exists for these craters in this repo. Coordinates of Bogra / Sripur / Ruhea are
approximate (coord_status) and the UI says so. They are NOT proposed as Marswalk-grade data.
"""
import json, math
import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import gaussian_filter
from pipeline import ROOT, PROCESSED, MARS_R, load_regions, write_region, layer_entry

CELL = 80.0          # walking-scale window; finer than real global DEMs, which is why it is labelled synthetic
WINDOW_KM = 8.0
info = {c["id"]: c for c in json.loads((ROOT / "data" / "bangladesh_craters.json").read_text(encoding="utf-8"))["craters"]}
regs = load_regions()

for k, (rid, c) in enumerate(info.items()):
    reg = regs[rid]
    lat0, lon0 = reg["center"]["lat"], reg["center"]["lon"]          # crater CENTRE (gazetteer / approximate)
    D = c["diameter_km"] * 1000.0
    R_m = D / 2
    N = int(round(WINDOW_KM * 1000 / CELL))
    half = WINDOW_KM * 1000 / 2
    # window centre = the point on the crater's north rim
    wlat = lat0 + math.degrees(R_m / MARS_R)
    north_lat = wlat + math.degrees(half / MARS_R)
    west_lon = lon0 - math.degrees(half / (MARS_R * math.cos(math.radians(wlat))))
    ll = lambda r, cc: (north_lat - r * CELL / (MARS_R * math.pi / 180), west_lon + cc * CELL / (MARS_R * math.cos(math.radians(wlat)) * math.pi / 180))
    rng = np.random.default_rng(1000 + k)
    y, x = np.mgrid[0:N, 0:N].astype("float32")
    # crater centre in window cell coords: directly south of the window centre by one radius
    cy, cx = N / 2 + R_m / CELL, N / 2
    rr = np.hypot(x - cx, y - cy) * CELL / R_m               # 1.0 = rim crest
    depth, rim_h = 0.065 * D, 0.012 * D                      # shallow simple crater (illustrative proportions)
    bowl = -depth * np.clip(1 - rr ** 2, 0, None)
    rim = rim_h * np.exp(-((rr - 1.0) ** 2) / (2 * 0.12 ** 2))
    ejecta = rim_h * 0.4 * np.exp(-((rr - 1.5) ** 2) / (2 * 0.35 ** 2))
    terrain = (bowl + rim + ejecta + 6 * gaussian_filter(rng.standard_normal((N, N)), 3)).astype("float32") - 1500.0
    norm = np.clip((terrain - terrain.min()) / np.ptp(terrain), 0, 1)
    rgb = np.stack([100 + norm * 120, 52 + norm * 66, 30 + norm * 40], axis=-1).astype("uint8")

    # chemistry: higher along the rim and on the wall (synthetic); NaN patch = no coverage
    chem = np.clip(0.3 + 0.4 * np.exp(-((rr - 1.0) ** 2) / (2 * 0.25 ** 2)) + 0.2 * np.exp(-((rr - 0.6) ** 2) / (2 * 0.2 ** 2)) + 0.05 * gaussian_filter(rng.standard_normal((N, N)), 2), 0, 1).astype("float32")
    chem[: N // 9, N - N // 7:] = np.nan

    spec = [
        (f"{rid}_base", f"{c['name']} staging point", 12, 50, "Start / base (synthetic)", "Flat outer plain north of the rim used as the start point.", "Staging point for the excursion."),
        (f"{rid}_rim", f"{c['name']} north rim crest", 52, 36, "Sample the exposed rim", "Raised rim exposing material from depth.", "Rim blocks can expose deeper strata excavated by the impact."),
        (f"{rid}_wall", f"{c['name']} inner wall", 72, 64, "Study the inner wall", "Inner wall slope below the rim crest.", "The wall may show layering of material the impact cut through."),
        (f"{rid}_ejecta", f"{c['name']} ejecta blanket", 30, 82, "Inspect ejecta", "Debris thrown out by the impact, outside the rim.", "Ejecta shows what the crater excavated and how far it travelled."),
    ]
    sites = []
    for sid, name, r_, c_, goal, geo, why in spec:
        lat, lon = ll(r_, c_)
        v = float(chem[r_, c_])
        sites.append({"id": sid, "name": name, "lat": lat, "lon": lon, "goal": goal,
                      "description": f"Synthetic stand-in feature on the real, IAU-named crater {c['name']} ({c['diameter_km']} km). {geo}",
                      "geology": geo, "science_purpose": why, "mission": "synthetic demonstration (crater name: IAU/USGS Gazetteer)",
                      "observed": "synthetic", "source_url": c["gazetteer"], "chem_index": None if v != v else round(v, 2),
                      "chemistry": "Synthetic chemical index: NO COVERAGE (missing)" if v != v else f"Synthetic chemical index: {v:.2f}",
                      "pov_images": []})   # no rover has visited: honest empty state in the UI
    hz = []
    for i, (name, r_, c_, rad, why) in enumerate([("Synthetic boulder field", 40, 56, 200, "Synthetic obstacle for route avoidance"),
                                                  ("Synthetic loose-sand patch", 62, 50, 180, "Synthetic terrain hazard for route avoidance")]):
        lat, lon = ll(r_, c_)
        hz.append({"id": f"{rid}_hz{i}", "name": name, "lat": lat, "lon": lon, "radius_m": rad, "reason": why, "source_url": "", "synthetic": True})

    def ring(rad_cells, n=20, seed=0, wob=0.06):
        rg = np.random.default_rng(seed)
        pts = []
        for j in range(n):
            a = 2 * math.pi * j / n
            rr_ = rad_cells * (1 + wob * rg.uniform(-1, 1))
            r_, c_ = cy - rr_ * math.cos(a), cx + rr_ * math.sin(a)
            if -5 <= r_ <= N + 5 and -5 <= c_ <= N + 5:
                pts.append(list(ll(min(max(r_, 0), N - 1), min(max(c_, 0), N - 1))))
        return pts
    R_c = R_m / CELL
    geology = [
        {"id": f"{rid}_geo_rim", "name": "Crater rim crest (synthetic outline)", "type": "crater_rim", "polygon": ring(R_c, seed=1) + ring(R_c * 0.9, seed=2)[::-1], "description": "Approximate rim position from the published diameter.", "synthetic": True},
        {"id": f"{rid}_geo_ejecta", "name": "Ejecta zone (synthetic outline)", "type": "ejecta", "polygon": [list(ll(2, 4)), list(ll(2, N - 4)), list(ll(N * 0.45, N - 4)), list(ll(N * 0.45, 4))], "description": "Illustrative ejecta extent north of the rim.", "synthetic": True},
    ]

    meta = {
        "id": rid, "name": f"{c['name']} crater - north-rim window (Bangladesh name, SYNTHETIC)", "role": "bangladesh", "synthetic": True,
        "science_goal": f"Plan an excursion on the north rim of {c['name']} crater: ejecta, rim crest and inner wall",
        "center": {"lat": wlat, "lon": lon0}, "coord_status": reg.get("coord_status", "approx_needs_verify"),
        "bangladesh": {"name": c["name"], "diameter_km": c["diameter_km"], "approved": c["approved"], "named_after": c["named_after"], "gazetteer": c["gazetteer"],
                       "crater_center": {"lat": lat0, "lon": lon0}},
        "grid": {"width": N, "height": N, "cell_m": CELL, "north_lat": north_lat, "west_lon": west_lon},
        "layers": [
            layer_entry("topographic", "Synthetic rim elevation / slope", "none", "numpy", "make_bangladesh_demo.py", CELL, "synthetic", "static", "",
                        "Synthetic bowl + rim built from the published diameter. NOT measured terrain. A real global DEM (~200 m/px) is coarser than this demo grid and could not resolve walking-scale hazards."),
            layer_entry("optical", "Synthetic surface imagery", "none", "numpy/Pillow", "make_bangladesh_demo.py", CELL, "synthetic", "historical", "", "Synthetic colourised terrain. Not an orbital image."),
            layer_entry("chemical", "Synthetic chemical index", "none", "numpy", "make_bangladesh_demo.py", CELL, "synthetic", "static", "", "Synthetic. Grey patch = NO coverage."),
            layer_entry("radiation", "Illustrative radiation / space-weather context", "none", "config.py assumptions", "spaceweather.py", 0, "synthetic", "predicted", "", "Placeholder; not a NASA measurement."),
        ],
        "warnings": [
            f"Real crater name and size ({c['name']}, {c['diameter_km']} km, approved {c['approved']}); the 8 km window terrain is SYNTHETIC - no walking-scale NASA data is used here.",
            "No rover has visited this crater: rover photos are MISSING (no substitute is shown).",
            "Coarse-data warning: published global elevation for this area is ~200 m/px, too coarse to judge boulders or small slopes.",
        ] + (["Crater centre coordinates are approximate - verify in the USGS Gazetteer before presenting."] if reg.get("coord_status") != "verified_gazetteer" else []),
    }
    out = write_region(rid, meta, terrain, rgb, sites, hz, chem=chem, geology=geology)
    print("built", rid, f"{N}x{N} @ {CELL:.0f} m", "->", out)
