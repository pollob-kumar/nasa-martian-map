"""Turns raster windows into coloured PNG tiles / previews. Each layer has its own colour family."""
import io
from functools import lru_cache
import numpy as np
from PIL import Image
from rasterio.enums import Resampling
from ..core import config as C
from ..core import decode as D
from ..core.layers import BY_KEY
from ..core.raster_manager import get_manager
from . import hazard_service, confidence_service, terrain_service

TS = C.TILE_SIZE


def _hex(h): return [int(h[i:i + 2], 16) for i in (1, 3, 5)]


def _lut(stops):
    xs = [s[0] for s in stops]
    cols = np.array([_hex(s[1]) for s in stops], dtype="float32")
    t = np.linspace(0, 1, 256)
    return np.stack([np.interp(t, xs, cols[:, c]) for c in range(3)], axis=1).astype("uint8")


PAL = {
    "elevation": _lut([(0, "#2b1b4a"), (.2, "#3b4aa0"), (.4, "#2aa3a0"), (.55, "#7fc66a"), (.7, "#e8d36a"), (.85, "#c98a4b"), (1, "#ffffff")]),
    "hirise_slope": _lut([(0, "#1b9e5a"), (.35, "#a8d83f"), (.55, "#ffd23f"), (.75, "#ff8c1a"), (1, "#e0261f")]),
    "secondary_slope": _lut([(0, "#0ea5e9"), (.4, "#6366f1"), (.7, "#c026d3"), (1, "#fb7185")]),
    "confidence": _lut([(0, "#1e3a8a"), (.5, "#14b8a6"), (1, "#4ade80")]),
}
HAZ_RGBA = {D.SAFE: (34, 197, 94, 70), D.MEDIUM: (245, 158, 11, 160), D.DANGER: (239, 68, 68, 205)}
SLOPE_TOP = 35.0


def _ramp(a, lo, hi, lut):
    t = np.clip((a - lo) / max(hi - lo, 1e-9), 0, 1)
    return lut[(np.nan_to_num(t) * 255).astype("uint8")]


def _stretch8(a, lo, hi):
    return (np.clip((a - lo) / max(hi - lo, 1e-9), 0, 1) * 255).astype("uint8")


def render(key, data, valid):
    """data float32 [bands,h,w], valid bool -> RGBA uint8 [h,w,4]"""
    m = get_manager()
    spec = BY_KEY[key]
    st = m.stats(key)
    h, w = valid.shape
    out = np.zeros((h, w, 4), "uint8")
    if spec.kind == "imagery":
        if data.shape[0] >= 3:
            if m.infos[key].dtype == "uint8":
                rgb = data[:3].clip(0, 255).astype("uint8")
            else:
                rgb = np.stack([_stretch8(data[i], st["p2"], st["p98"]) for i in range(3)])
            out[..., :3] = np.moveaxis(rgb, 0, -1)
        else:
            g = _stretch8(data[0], st["p2"], st["p98"])
            out[..., :3] = np.stack([g, (g * 0.93).astype("uint8"), (g * 0.86).astype("uint8")], -1)
    elif spec.kind == "shade":
        g = data[0] if (st["max"] > 1.5) else data[0] * 255
        g = np.clip(g, 0, 255).astype("uint8")
        out[..., :3] = np.stack([g, g, g], -1)
    elif spec.kind == "elevation":
        out[..., :3] = _ramp(data[0], st["p2"], st["p98"], PAL["elevation"])
    elif spec.kind == "slope":
        s, _ = terrain_service.slope_decode(key, data[0], valid)
        valid = valid & np.isfinite(s)
        out[..., :3] = _ramp(np.nan_to_num(s), 0, SLOPE_TOP, PAL[key])
    elif spec.kind == "hazard":
        cls, _, _ = hazard_service.decode(data[0], valid)
        for c, rgba in HAZ_RGBA.items():
            out[cls == c] = rgba
        return out
    elif spec.kind == "confidence":
        if data.shape[0] >= 3 and not (m.overrides.get("confidence", {}).get("mode") == "gray"):
            out[..., :3] = np.moveaxis(data[:3].clip(0, 255).astype("uint8"), 0, -1)
        else:
            c = confidence_service.decode(data, valid)
            valid = valid & np.isfinite(c)
            out[..., :3] = _ramp(np.nan_to_num(c), 0, 1, PAL["confidence"])
    out[..., 3] = np.where(valid, 255, 0)
    return out


def _png(rgba) -> bytes:
    b = io.BytesIO()
    Image.fromarray(rgba, "RGBA").save(b, "PNG", compress_level=3)
    return b.getvalue()


_EMPTY = _png(np.zeros((TS, TS, 4), "uint8"))


def _resampling(key):
    return Resampling.nearest if BY_KEY[key].kind == "hazard" else Resampling.bilinear


@lru_cache(maxsize=3000)
def tile(key: str, z: int, x: int, y: int) -> bytes:
    m = get_manager()
    if key not in m.infos:
        return _EMPTY
    n = 2 ** z
    if not (0 <= x < n and 0 <= y < n):
        return _EMPTY
    b = m.tile_bounds(z, x, y)
    f = m.frame
    if b[0] >= f.maxx or b[1] >= f.maxy or b[2] <= f.minx or b[3] <= f.miny:
        return _EMPTY
    data, valid = m.read(key, b, TS, TS, _resampling(key))
    # outside the frame stays transparent
    xs = b[0] + (np.arange(TS) + 0.5) * (b[2] - b[0]) / TS
    ys = b[3] - (np.arange(TS) + 0.5) * (b[3] - b[1]) / TS
    inside = (ys[:, None] >= f.miny) & (ys[:, None] <= f.maxy) & (xs[None, :] >= f.minx) & (xs[None, :] <= f.maxx)
    return _png(render(key, data, valid & inside))


@lru_cache(maxsize=64)
def preview(key: str, size: int = 900) -> bytes:
    m = get_manager()
    if key not in m.infos:
        return _EMPTY
    w, h = m.grid_wh(size)
    data, valid = m.read(key, m.frame.bounds, w, h, _resampling(key))
    return _png(render(key, data, valid))


def chem_png(size: int = 900) -> bytes | None:
    c = get_manager().chem()
    if c is None:
        return None
    t = np.clip(np.nan_to_num(c), 0, 1)
    lut = _lut([(0, "#461e78"), (1, "#ffdc1e")])
    rgba = np.zeros(c.shape + (4,), "uint8")
    rgba[..., :3] = lut[(t * 255).astype("uint8")]
    rgba[..., 3] = np.where(np.isnan(c), 0, 235)
    return _png(rgba)


def clear_caches():
    tile.cache_clear(); preview.cache_clear()
