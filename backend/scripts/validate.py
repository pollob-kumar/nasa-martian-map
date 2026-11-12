"""Evidence for docs/VALIDATION.md. Run: python backend/scripts/validate.py   (needs processed regions: run_all.py --full-demo)
Prints PASS/FAIL lines for the six checks from the NASA brief, on the Jezero demo region (SYNTHETIC data)."""
import sys, warnings
from pathlib import Path
warnings.filterwarnings("ignore")
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import numpy as np
from PIL import Image
from fastapi.testclient import TestClient
from app.main import app
from app.store import get_region

c = TestClient(app)
RID = "jezero_delta"
reg = get_region(RID)
sites = {s["id"]: s for s in reg.sites}
b, d = sites["jezero_demo_base"], sites["jezero_demo_delta"]
ok_all = True


def check(name, ok, detail):
    global ok_all
    ok_all &= bool(ok)
    print(f"{'PASS' if ok else 'FAIL'}  {name}: {detail}")


def route(**kw):
    body = {"region_id": RID, "start": {"lat": b["lat"], "lon": b["lon"]}, "goal_site_id": d["id"], "obstacles": []}
    body.update(kw)
    return c.post("/api/route", json=body).json()


# 1 layers aligned: every raster has exactly the grid size of the elevation model
g = reg.grid
sizes = {f: Image.open(reg.folder / f).size for f in ["imagery.png", "hillshade.png", "slope.png", "hazard.png", "chemical.png"]}
check("layers aligned", all(s == (g.width, g.height) for s in sizes.values()) and reg.dem.shape == (g.height, g.width) == reg.chem.shape,
      f"grid {g.width}x{g.height} @ {g.cell_m} m; rasters {sizes}")

# 2 route reaches goal
r = route(); p = next(x for x in r["routes"] if x["found"])
end = p["points"][-1]
gr, gc = g.latlon_to_cell(d["lat"], d["lon"])
check("route reaches goal", g.xy_to_cell(end["x"], end["y"]) == (gr, gc), f"{len(r['routes'])} routes, balanced {p['distance_m']} m, max slope {p['max_slope_deg']} deg, no cell over the limit")

# 3 obstacle changes route (close the only pass in the scarp)
lat, lon = g.cell_to_latlon(45, 55)
r2 = route(obstacles=[{"lat": lat, "lon": lon, "radius_m": 400}]); p2 = next(x for x in r2["routes"] if x["found"])
check("obstacle changes route", p2["distance_m"] > p["distance_m"] + 500, f"{p['distance_m']} m -> {p2['distance_m']} m after blocking the pass")

# 4 slope limit changes route
r3 = route(max_slope_deg=70, caution_slope_deg=60); p3 = next(x for x in r3["routes"] if x["found"])
check("slope limit changes route", p3["distance_m"] < p["distance_m"], f"limit 20 deg: {p['distance_m']} m; limit 70 deg: {p3['distance_m']} m")

# 5 missing data is visible: coverage gap in the chemical raster
gap = np.isnan(reg.chem).sum()
meta = c.get(f"/api/regions/{RID}").json()
bd = c.get("/api/regions/bd_bogra/sites").json()[1]
check("missing data visible", gap > 0 and (reg.chem_at(*g.cell_to_latlon(5, 90)) is None),
      f"{int(gap)} chemical cells have NO coverage (returned as None, drawn grey); BD craters report 'rover photos: MISSING' ({len(bd['pov_images'])} images)")

# 6 travel-time and oxygen assumptions explained
a = route(load_factor=1.0, science_stop_min=0)["routes"][0]; a2 = route(load_factor=2.0, science_stop_min=0)["routes"][0]
ox = p["safety"]["oxygen"]
check("travel-time / oxygen assumptions explained", a2["walk_time_min"] > 1.9 * a["walk_time_min"] and "assumption" in ox["assumption"].lower() and meta["suit_assumptions"],
      f"walk {a['walk_time_min']} min -> {a2['walk_time_min']} min with 2x cargo; O2 on arrival {ox['remaining_on_arrival_pct']}%, after return {ox['remaining_after_return_pct']}% (reserve {ox['reserve_pct']}%)")

# 7 Bangladesh regions load and route
bd_ok = []
for rid in ["bd_bogra", "bd_sripur", "bd_teknaf", "bd_ruhea", "bd_satkania"]:
    ss = c.get(f"/api/regions/{rid}/sites").json()
    rr = c.post("/api/route", json={"region_id": rid, "start": {"lat": ss[0]["lat"], "lon": ss[0]["lon"]}, "goal_site_id": ss[1]["id"], "obstacles": []}).json()
    bd_ok.append(any(x["found"] for x in rr["routes"]))
check("5 Bangladesh regions route", all(bd_ok), "Bogra, Sripur, Teknaf, Ruhea, Satkania: base -> rim route found in each (SYNTHETIC terrain)")

print("\nALL PASS" if ok_all else "\nSOME FAILED")
sys.exit(0 if ok_all else 1)
