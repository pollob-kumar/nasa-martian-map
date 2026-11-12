"""'How much can I trust the elevation here?' (HiRISE FOM colour confidence)."""
from ..core import decode as D
from ..core.raster_manager import get_manager
import numpy as np


def decode(data, valid):
    m = get_manager()
    st = m.stats("confidence") if m.has("confidence") else {}
    return D.decode_confidence(data, valid, m.overrides.get("confidence"), st.get("p2"), st.get("p98"))


def word(c):
    if c is None or not np.isfinite(c):
        return "unknown"
    return "high" if c >= 0.66 else ("medium" if c >= 0.4 else "low")


def at(lat, lon):
    m = get_manager()
    if not m.has("confidence"):
        return None
    vals, ok = m.sample("confidence", lat, lon)
    if not ok:
        return {"value": None, "label": "no data"}
    c = decode(np.array(vals, "float32").reshape(-1, 1, 1), np.ones((1, 1), bool))[0, 0]
    return {"value": round(float(c), 2), "label": word(float(c))}
