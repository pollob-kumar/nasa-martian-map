from fastapi import APIRouter, HTTPException, Response, Query
from ...core import config as C
from ...core.layers import LAYERS, BY_KEY
from ...core.raster_manager import get_manager, reset_manager
from ...services import visualization_service as viz, hazard_service
from ... import store

router = APIRouter(prefix="/api/layers", tags=["layers"])
_HDR = {"Cache-Control": "public, max-age=3600"}


@router.get("")
def list_layers():
    m = get_manager()
    lg, note = hazard_service.legend()
    out = []
    for l in LAYERS:
        i = m.infos.get(l.key)
        out.append({"key": l.key, "label": l.label, "role": l.role, "color": l.color, "z": l.z, "default_on": l.default_on,
                    "default_opacity": l.default_opacity, "blend": l.blend, "file": l.filename,
                    "origin": i.origin if i else "missing", "res_m": round(i.res_m, 2) if i else None})
    f = m.frame
    return {"layers": out, "frame": {"width_m": f.width_m, "height_m": f.height_m, "max_zoom": m.max_zoom(), "tile_size": C.TILE_SIZE},
            "hazard_legend": lg, "hazard_note": note, "notes": m.notes[:5], "raster_dir": str(C.RASTER_DIR)}


@router.get("/{key}/tile/{z}/{x}/{y}.png")
def tile(key: str, z: int, x: int, y: int):
    if key not in BY_KEY:
        raise HTTPException(404, "unknown layer")
    if z < 0 or z > 12:
        raise HTTPException(404, "bad zoom")
    return Response(viz.tile(key, z, x, y), media_type="image/png", headers=_HDR)


@router.get("/{key}/preview.png")
def preview(key: str, size: int = Query(900, ge=128, le=2400)):
    if key not in BY_KEY:
        raise HTTPException(404, "unknown layer")
    return Response(viz.preview(key, size), media_type="image/png", headers=_HDR)


@router.post("/reload")
def reload_layers():
    """Call after dropping new .tif files in: no server restart needed."""
    reset_manager()
    viz.clear_caches()
    store.get_region.cache_clear()
    m = get_manager()
    return {"ok": True, "real_layers": [k for k, i in m.infos.items() if i.origin == "nasa"]}
