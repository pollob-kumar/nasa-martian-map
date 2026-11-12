import math
from fastapi import APIRouter, Query
from ...core.layers import LAYERS
from ...core.raster_manager import get_manager
from ...schemas.terrain import ProbeResponse, LayerValue, ProfileRequest
from ...services import elevation_service, hazard_service, confidence_service, terrain_service

router = APIRouter(prefix="/api/terrain", tags=["terrain"])


def feel(slope):
    if slope is None:
        return "ground slope unknown"
    return "gentle ground" if slope < 8 else ("moderate slope" if slope < 15 else ("steep slope" if slope < 25 else "very steep"))


def probe_point(lat: float, lon: float) -> dict:
    m = get_manager()
    x, y = m.frame.to_xy(lat, lon)
    f = m.frame
    inside = f.minx <= x <= f.maxx and f.miny <= y <= f.maxy
    elev = elevation_service.at(lat, lon) if inside else None
    s1 = terrain_service.slope_at("hirise_slope", lat, lon) if inside else None
    s2 = terrain_service.slope_at("secondary_slope", lat, lon) if inside else None
    hz = hazard_service.label_at(lat, lon) if inside else None
    tr = confidence_service.at(lat, lon) if inside else None
    layers = []
    for l in LAYERS:
        i = m.infos.get(l.key)
        if not i or not inside:
            continue
        val = "-"
        if l.key == "elevation": val = f"{elev} m" if elev is not None else "no data"
        elif l.key == "hirise_slope": val = f"{s1}°" if s1 is not None else "no data"
        elif l.key == "secondary_slope": val = f"{s2}°" if s2 is not None else "no data"
        elif l.key == "hazard": val = hz["label"] if hz else "no data"
        elif l.key == "confidence": val = f"{tr['label']} ({tr['value']})" if tr and tr.get("value") is not None else "no data"
        else:
            vals, ok = m.sample(l.key, lat, lon)
            val = "no data" if not ok else (", ".join(str(round(v)) for v in vals[:3]))
        layers.append(LayerValue(key=l.key, label=l.label, value=val, origin=i.origin,
                                 source=f"{l.mission} · {l.instrument}" if i.origin == "nasa" else "generated fill",
                                 res_m=round(i.res_m, 2)))
    parts = [feel(s1 if s1 is not None else s2)]
    if hz and hz.get("class") is not None:
        parts.append(hz["label"] + " zone")
    if tr and tr.get("value") is not None:
        parts.append(f"{tr['label']} data trust")
    return ProbeResponse(lat=lat, lon=lon, inside=inside, summary=", ".join(parts) if inside else "outside the mapped area",
                         elevation_m=elev, slope_main_deg=s1, slope_check_deg=s2, hazard=hz["label"] if hz else None,
                         trust=tr["label"] if tr else None, layers=layers).model_dump()


@router.get("/probe")
def probe(lat: float = Query(...), lon: float = Query(...)):
    return probe_point(lat, lon)


@router.post("/profile")
def profile(req: ProfileRequest):
    return elevation_service.profile([(p[0], p[1]) for p in req.points])


@router.get("/summary")
def summary():
    v = terrain_service.analysis()
    import numpy as np
    return {"grid": {"w": v["w"], "h": v["h"], "cell_m": v["cell"]}, "slope_agreement": terrain_service.agreement(),
            "elev_min_m": float(np.nanmin(v["dem"])), "elev_max_m": float(np.nanmax(v["dem"]))}
