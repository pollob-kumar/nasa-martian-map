"""Turns raw raster values into meaning (degrees, hazard class, 0..1 trust). Pure numpy, no I/O."""
import numpy as np

SAFE, MEDIUM, DANGER, NODATA = 0, 1, 2, 255
CLASS_NAMES = {SAFE: "safer", MEDIUM: "medium risk", DANGER: "danger"}


def clean(a):
    a = a.astype("float32", copy=False)
    bad = ~np.isfinite(a) | (np.abs(a) > 1e30)
    return np.where(bad, np.nan, a)


def decode_slope(raw, valid, cfg=None, hi=None):
    cfg = cfg or {}
    a = clean(raw)
    a[~valid] = np.nan
    units = cfg.get("units")
    if units is None:
        top = hi if hi is not None else (np.nanmax(a) if np.isfinite(a).any() else 0)
        units = "percent" if top > 90 else "degrees"
    if units == "percent":
        a = np.degrees(np.arctan(a / 100.0)).astype("float32")
    elif units == "radians":
        a = np.degrees(a).astype("float32")
    return a, units


def decode_hazard(raw, valid, cfg=None):
    """-> (class array 0/1/2 or 255, legend[], note)"""
    cfg = cfg or {}
    a = clean(raw)
    ok = valid & np.isfinite(a)
    out = np.full(a.shape, NODATA, dtype="uint8")
    classes = cfg.get("classes")
    if classes:
        legend = []
        for name, code in (("safe", SAFE), ("medium", MEDIUM), ("danger", DANGER)):
            for v in classes.get(name, []):
                out[ok & (a == v)] = code
                legend.append({"raw": v, "label": CLASS_NAMES[code]})
        return out, legend, "classes from layers.json"
    if not cfg.get("zero_is_data"):
        ok = ok & (a > 0)
    vals = a[ok]
    if vals.size == 0 and not cfg.get("unique"):
        return out, [], "no hazard data"
    rev = cfg.get("higher_is", "danger") == "safe"
    u = np.array(cfg["unique"], dtype="float32") if cfg.get("unique") else np.unique(vals[:: max(1, vals.size // 400000)])
    if not cfg.get("zero_is_data"):
        u = u[u > 0]
    legend, note = [], ""
    if len(u) <= 8:
        n = len(u)
        order = list(range(n))
        if n == 1:
            codes = [MEDIUM]; note = "only one hazard value found - treated as 'medium'. Set classes in layers.json."
        elif n == 2:
            codes = [SAFE, DANGER]
        elif n == 3:
            codes = [SAFE, MEDIUM, DANGER]
        else:
            codes = [SAFE if i < n / 3 else (MEDIUM if i < 2 * n / 3 else DANGER) for i in order]
        if rev:
            codes = codes[::-1]
        for v, c in zip(u, codes):
            out[ok & (a == v)] = c
            legend.append({"raw": float(v), "label": CLASS_NAMES[c]})
        note = note or ("raw values read low->high as " + (" > ".join(CLASS_NAMES[c] for c in codes)))
    else:
        top = float(cfg.get("top") or np.nanmax(vals))
        s = a / (top if top > 1 else 1.0)
        if rev:
            s = 1 - s
        out[ok & (s < 0.34)] = SAFE
        out[ok & (s >= 0.34) & (s < 0.67)] = MEDIUM
        out[ok & (s >= 0.67)] = DANGER
        legend = [{"raw": "0-33%", "label": "safer"}, {"raw": "34-66%", "label": "medium risk"}, {"raw": "67-100%", "label": "danger"}]
        note = "continuous hazard score split in thirds" + (" (high = safer)" if rev else " (high = danger)")
    return out, legend, note


def decode_confidence(data, valid, cfg=None, lo=None, hi=None):
    """data: (bands,h,w). RGB colour map -> trust 0..1 via 'greenness'; single band -> stretched."""
    cfg = cfg or {}
    mode = cfg.get("mode") or ("rgb" if data.shape[0] >= 3 else "gray")
    if mode == "rgb" and data.shape[0] >= 3:
        r, g, b = data[0], data[1], data[2]
        c = np.clip((g - 0.5 * (r + b)) / 255.0 + 0.5, 0, 1)
    else:
        a = clean(data[0])
        lo = np.nanmin(a) if lo is None else lo
        hi = np.nanmax(a) if hi is None else hi
        c = np.clip((a - lo) / max(hi - lo, 1e-6), 0, 1)
    c = c.astype("float32")
    c[~valid] = np.nan
    return c
