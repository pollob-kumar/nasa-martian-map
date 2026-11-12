"""Elevation at a point / along a line."""
import math
from ..core.raster_manager import get_manager


def at(lat, lon):
    m = get_manager()
    if not m.has("elevation"):
        return None
    vals, ok = m.sample("elevation", lat, lon)
    if not ok or not math.isfinite(vals[0]):
        return None
    return round(float(vals[0]), 1)


def profile(points, n=60):
    """points: [(lat, lon), ...] -> [{d_m, elev_m}] (straight segments between points, native-resolution samples)."""
    out, dist = [], 0.0
    pts = list(points)
    for a, b in zip(pts[:-1], pts[1:]):
        xa, ya = get_manager().frame.to_xy(*a)
        xb, yb = get_manager().frame.to_xy(*b)
        L = math.hypot(xb - xa, yb - ya)
        k = max(2, int(n / max(len(pts) - 1, 1)))
        for i in range(k):
            t = i / k
            lat = a[0] + (b[0] - a[0]) * t
            lon = a[1] + (b[1] - a[1]) * t
            out.append({"d_m": round(dist + L * t, 1), "elev_m": at(lat, lon)})
        dist += L
    return out
