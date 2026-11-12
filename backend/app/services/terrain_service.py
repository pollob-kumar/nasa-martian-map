"""Slope analysis + the analysis grid used by routing (built once, cached on disk)."""
import hashlib
import json
import math
import numpy as np
from rasterio.enums import Resampling
from ..core import config as C
from ..core import decode as D
from ..core.raster_manager import get_manager
from . import hazard_service, confidence_service

_A = {}


def slope_decode(key, raw, valid):
    m = get_manager()
    st = m.stats(key) if m.has(key) else {}
    return D.decode_slope(raw, valid, m.overrides.get(key), st.get("p98"))


def slope_at(key, lat, lon):
    m = get_manager()
    if not m.has(key):
        return None
    vals, ok = m.sample(key, lat, lon)
    if not ok:
        return None
    a, _ = slope_decode(key, np.array([[vals[0]]], "float32"), np.ones((1, 1), bool))
    v = float(a[0, 0])
    return None if not math.isfinite(v) else round(v, 1)


def grid_spec(m):
    f = m.frame
    cell = max(C.ANALYSIS_CELL_M, math.sqrt(f.width_m * f.height_m / C.MAX_ANALYSIS_CELLS))
    return int(math.ceil(f.width_m / cell)), int(math.ceil(f.height_m / cell)), float(cell)


def _signature(m, w, h, cell):
    parts = [str(w), str(h), f"{cell:.3f}", json.dumps(m.frame.bounds), json.dumps(m.overrides, sort_keys=True), "v2"]
    for k, i in sorted(m.infos.items()):
        st = i.path.stat()
        parts.append(f"{k}:{i.origin}:{st.st_size}:{int(st.st_mtime)}")
    return hashlib.sha1("|".join(parts).encode()).hexdigest()[:16]


def analysis():
    """dict of arrays on the common analysis grid (row 0 = north)."""
    m = get_manager()
    w, h, cell = grid_spec(m)
    sig = _signature(m, w, h, cell)
    if _A.get("sig") == sig:
        return _A["v"]
    cache = C.CACHE_DIR / "analysis"
    cache.mkdir(parents=True, exist_ok=True)
    f = cache / f"{sig}.npz"
    if f.exists():
        z = np.load(f)
        v = {k: z[k] for k in z.files}
    else:
        b = m.frame.bounds
        dem = m._read_float("elevation", b, w, h, Resampling.average)
        raw, ok = m.read("hirise_slope", b, w, h, Resampling.average)
        s1, _ = slope_decode("hirise_slope", raw[0], ok)
        raw, ok = m.read("secondary_slope", b, w, h, Resampling.average)
        s2, _ = slope_decode("secondary_slope", raw[0], ok)
        raw, ok = m.read("hazard", b, w, h, Resampling.nearest)
        hz, _, _ = hazard_service.decode(raw[0], ok)
        data, ok = m.read("confidence", b, w, h, Resampling.average)
        conf = confidence_service.decode(data, ok)
        v = dict(dem=dem, slope1=s1, slope2=s2, hazard=hz, conf=conf)
        np.savez_compressed(f, **v)
        for old in cache.glob("*.npz"):
            if old != f:
                old.unlink(missing_ok=True)
    # effective slope: main set, else second set, else from the DEM (never the same set twice)
    from ..core.demo_data import slope_deg
    s = v["slope1"].copy()
    nan = np.isnan(s)
    s[nan] = v["slope2"][nan]
    nan = np.isnan(s)
    if nan.any():
        s[nan] = slope_deg(np.nan_to_num(v["dem"], nan=float(np.nanmedian(v["dem"]))), cell)[nan]
    v = dict(v, slope=s, w=w, h=h, cell=cell)
    _A.update(sig=sig, v=v)
    return v


def agreement():
    """How well the two slope sets agree (cross-check)."""
    v = analysis()
    d = np.abs(v["slope1"] - v["slope2"])
    ok = np.isfinite(d)
    if not ok.any():
        return None
    return {"mean_diff_deg": round(float(np.nanmean(d)), 1), "pct_over_limit": round(float((d[ok] > C.SLOPE_DISAGREE_DEG).mean() * 100), 1)}


def extra_cost():
    """Added route cost: medium hazard, low data trust, slope sets disagree."""
    v = analysis()
    e = np.zeros(v["dem"].shape, dtype="float32")
    e[v["hazard"] == D.MEDIUM] += C.MEDIUM_HAZARD_PENALTY
    c = v["conf"]
    low = np.isfinite(c) & (c < C.LOW_CONFIDENCE_LEVEL)
    e[low] += C.LOW_CONFIDENCE_PENALTY * (C.LOW_CONFIDENCE_LEVEL - c[low]) / C.LOW_CONFIDENCE_LEVEL
    d = np.abs(v["slope1"] - v["slope2"])
    e[np.isfinite(d) & (d > C.SLOPE_DISAGREE_DEG)] += C.SLOPE_DISAGREE_PENALTY
    return e
