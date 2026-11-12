from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
import math
import numpy as np

from . import config
from .models import RouteRequest
from .store import get_region, list_region_ids, RASTER_ENABLED
from .routing.astar import astar
from .routing.costmap import build_cost
from .routing.mission import summarize_path
from .routing.explain import build_explanation, direct_line_check, insights, routed_detours
from . import spaceweather
from .services import route_planner
from .api.routes import layers as layers_routes, terrain as terrain_routes, navigation as nav_routes, chat as chat_routes
from .core.config import RASTER_REGION_ID

app = FastAPI(title="RedNav-N399 API", version="0.1.0",
              description="Layered Mars surface data + traversal route planning from NASA data (hackathon prototype).")
app.include_router(layers_routes.router)
app.include_router(terrain_routes.router)
app.include_router(nav_routes.router)
app.include_router(chat_routes.router)
app.add_middleware(CORSMiddleware, allow_origins=config.CORS_ORIGINS, allow_methods=["*"], allow_headers=["*"])

LAYER_FILES = {"imagery": "imagery.png", "hillshade": "hillshade.png", "slope": "slope.png", "hazard": "hazard.png", "chemical": "chemical.png"}


def _region_or_404(rid: str):  # noqa
    try:
        return get_region(rid)
    except KeyError:
        raise HTTPException(404, f"region '{rid}' has no processed data. Run: python data/scripts/run_all.py --region {rid}")


@app.get("/api/health")
def health():
    return {"ok": True, "regions_ready": list_region_ids()}


@app.get("/api/regions")
def regions():
    out = []
    for rid in list_region_ids():
        m = get_region(rid).meta
        role = m.get("role", "primary")
        if role == "primary" and rid != RASTER_REGION_ID and RASTER_ENABLED:
            role = "demo"   # the GeoTIFF region is the main one; the old synthetic Jezero stays selectable as a demo
        out.append({"id": rid, "name": m["name"], "role": role, "center": m["center"],
                    "synthetic": bool(m.get("synthetic")), "is_raster": bool(m.get("raster")), "bangladesh": m.get("bangladesh"), "coord_status": m.get("coord_status")})
    return out


@app.get("/api/regions/{rid}")
def region_meta(rid: str):
    reg = _region_or_404(rid)
    m = dict(reg.meta)
    cell = reg.grid.cell_m
    warnings = list(m.get("warnings", []))
    if cell > 50:
        warnings.append(f"Elevation grid is {cell:.0f} m/pixel: slope is a coarse indicator; boulders and small hazards are NOT resolved.")
    m["warnings"] = warnings
    m["defaults"] = {"max_slope_deg": config.DEFAULT_MAX_SLOPE_DEG, "caution_slope_deg": config.DEFAULT_CAUTION_SLOPE_DEG,
                     "walk_speed_ms": config.DEFAULT_WALK_SPEED_MS, "load_factor": config.DEFAULT_LOAD_FACTOR,
                     "science_stop_min": config.DEFAULT_SCIENCE_STOP_MIN}
    m["suit_assumptions"] = {"o2_capacity_min": config.SUIT_O2_CAPACITY_MIN, "o2_reserve_pct": config.O2_RESERVE_PCT,
                             "o2_slope_factor_per_deg": config.O2_SLOPE_FACTOR_PER_DEG, "o2_load_weight": config.O2_LOAD_FACTOR_WEIGHT,
                             "o2_stop_factor": config.O2_SCIENCE_STOP_FACTOR}
    m["crs"] = {"coordinates": "planetocentric latitude, longitude degrees EAST (0-360)", "body_radius_m": config.MARS_RADIUS_M,
                "grid": "local equirectangular metre grid, row 0 = north edge; every layer shares this exact grid",
                "alignment": "All raster layers are produced on one grid (same width/height/cell), so they overlay pixel-for-pixel."}
    m["layer_urls"] = {k: f"/api/regions/{rid}/layers/{k}.png" for k, f in LAYER_FILES.items() if (reg.folder / f).exists()}
    m["stats"] = {"elev_min_m": float(np.nanmin(reg.dem)), "elev_max_m": float(np.nanmax(reg.dem)),
                  "slope_max_deg": float(np.nanmax(reg.slope)), "nodata_pct": round(float(np.isnan(reg.dem).mean() * 100), 2)}
    return m


@app.get("/api/regions/{rid}/sites")
def sites(rid: str):
    return _region_or_404(rid).sites


@app.get("/api/regions/{rid}/geology")
def geology(rid: str):
    return _region_or_404(rid).geology


@app.get("/api/space-weather")
def space_weather():
    return spaceweather.get_space_weather()


@app.get("/api/regions/{rid}/hazards")
def hazards(rid: str):
    return _region_or_404(rid).hazards


@app.get("/api/regions/{rid}/layers/{name}.png")
def layer_png(rid: str, name: str):
    reg = _region_or_404(rid)
    fn = LAYER_FILES.get(name)
    if not fn or not (reg.folder / fn).exists():
        raise HTTPException(404, f"layer '{name}' not available for {rid} (shown as MISSING in UI, never faked)")
    return FileResponse(reg.folder / fn, media_type="image/png")


@app.get("/api/regions/{rid}/media/{filename}")
def media(rid: str, filename: str):
    reg = _region_or_404(rid)
    p = (reg.folder / "media" / filename).resolve()
    if reg.folder.resolve() not in p.parents or not p.exists():
        raise HTTPException(404, "media not found")
    return FileResponse(p)


@app.post("/api/route")
def route(req: RouteRequest):
    return route_planner.plan(req)
