"""Hazard layer: danger / medium / safer ground."""
import numpy as np
from ..core import decode as D
from ..core.raster_manager import get_manager

_cache = {}


def hazard_cfg():
    """Global, tile-independent decoding rule (built once from the layer's value statistics)."""
    m = get_manager()
    if "cfg" in _cache and _cache.get("sig") is m:
        return _cache["cfg"]
    cfg = dict(m.overrides.get("hazard") or {})
    if m.has("hazard"):
        st = m.stats("hazard")
        if st.get("unique") and not cfg.get("classes"):
            cfg["unique"] = st["unique"]
        cfg["top"] = st["max"]
    _cache.update(cfg=cfg, sig=m)
    return cfg


def decode(raw, valid):
    return D.decode_hazard(raw, valid, hazard_cfg())


def legend():
    m = get_manager()
    if not m.has("hazard"):
        return [], ""
    st = m.stats("hazard")
    probe = np.array(st["unique"] or [st["max"]], dtype="float32").reshape(1, -1)
    _, lg, note = D.decode_hazard(probe, np.ones(probe.shape, bool), hazard_cfg())
    return lg, note


def label_at(lat, lon):
    m = get_manager()
    if not m.has("hazard"):
        return None
    vals, ok = m.sample("hazard", lat, lon)
    if not ok:
        return {"label": "no data", "raw": None}
    cls, _, _ = decode(np.array([[vals[0]]], "float32"), np.ones((1, 1), bool))
    c = int(cls[0, 0])
    return {"label": D.CLASS_NAMES.get(c, "no data"), "raw": vals[0], "class": c if c != D.NODATA else None}
