import math
import numpy as np
from ..geo import Grid
from .suit import oxygen_budget
from .. import config


def summarize_path(path, dem, slope, grid: Grid, *, walk_speed_ms: float, load_factor: float, stop_min: float,
                   caution_slope: float, max_slope: float, stops: int = 1) -> dict:
    pts = []
    dist = 0.0
    prev = None
    seg_reasons = []
    for (r, c) in path:
        lat, lon = grid.cell_to_latlon(r, c)
        x, y = grid.cell_to_xy(r, c)
        pts.append({"x": x, "y": y, "lat": lat, "lon": lon, "elev_m": float(dem[r, c]), "slope_deg": float(slope[r, c])})
        if prev:
            dist += math.hypot(c - prev[1], r - prev[0]) * grid.cell_m
        prev = (r, c)
    sl = np.array([p["slope_deg"] for p in pts])
    n_caution = int(np.sum(sl > caution_slope))
    if n_caution:
        seg_reasons.append(f"{n_caution} of {len(pts)} route cells exceed the {caution_slope:.0f}° caution slope (still under the {max_slope:.0f}° limit).")
    else:
        seg_reasons.append(f"Route stays below the {caution_slope:.0f}° caution slope everywhere (per the DEM used).")
    effective_speed = walk_speed_ms / max(load_factor, 0.1)
    walk_s = dist / effective_speed
    total_s = walk_s + stops * stop_min * 60.0
    # per-segment distance + mean slope -> oxygen model (feeds the Travel-time / Oxygen features and the HUD)
    seg_d, seg_sl = [], []
    for i in range(1, len(path)):
        seg_d.append(math.hypot(path[i][1] - path[i - 1][1], path[i][0] - path[i - 1][0]) * grid.cell_m)
        seg_sl.append(0.5 * (pts[i]["slope_deg"] + pts[i - 1]["slope_deg"]))
    ox = oxygen_budget(seg_d, seg_sl, walk_speed_ms=walk_speed_ms, load_factor=load_factor, stop_min=stop_min, stops=stops)
    for p_, t_, o_ in zip(pts, ox["cum_walk_min"], ox["cum_walk_pct"]):
        p_["t_min"] = round(t_, 2)
        p_["o2_used_pct"] = round(o_, 2)
    mission_h = total_s / 3600.0
    dose = config.SYNTHETIC_DOSE_RATE_USV_PER_H * mission_h
    radiation = {
        "dose_rate_usv_per_h": config.SYNTHETIC_DOSE_RATE_USV_PER_H,
        "estimated_dose_usv": round(dose, 1),
        "planning_limit_usv": config.SYNTHETIC_DOSE_LIMIT_USV,
        "within_limit": dose <= config.SYNTHETIC_DOSE_LIMIT_USV,
        "synthetic": True,
        "assumption": "Illustrative placeholder rate and limit. Real surface dose rates (e.g. Curiosity RAD) are not bundled; do not treat as NASA values.",
    }
    if not ox["oxygen"]["one_way_ok"]:
        seg_reasons.append(f"Oxygen: arrival with {ox['oxygen']['remaining_on_arrival_pct']}% left is below the {config.O2_RESERVE_PCT:.0f}% reserve (model assumption).")
    elif not ox["oxygen"]["round_trip_ok"]:
        seg_reasons.append(f"Oxygen: one-way is within reserve, but a walk back would leave {ox['oxygen']['remaining_after_return_pct']}% (< {config.O2_RESERVE_PCT:.0f}% reserve) - plan a pickup or a shorter target.")
    else:
        seg_reasons.append(f"Oxygen: round trip leaves {ox['oxygen']['remaining_after_return_pct']}% (reserve {config.O2_RESERVE_PCT:.0f}%), per the suit-model assumptions.")
    return {
        "points": pts,
        "distance_m": round(dist, 1),
        "max_slope_deg": round(float(np.nanmax(sl)), 1),
        "mean_slope_deg": round(float(np.nanmean(sl)), 1),
        "elev_gain_m": round(float(sum(max(0, pts[i + 1]["elev_m"] - pts[i]["elev_m"]) for i in range(len(pts) - 1))), 1),
        "walk_time_min": round(walk_s / 60, 1),
        "mission_time_min": round(total_s / 60, 1),
        "reasons": seg_reasons,
        "safety": {"oxygen": ox["oxygen"], "radiation": radiation},
        "assumptions": {"walk_speed_ms": walk_speed_ms, "load_factor": load_factor, "science_stop_min": stop_min,
                        "max_slope_deg": max_slope, "caution_slope_deg": caution_slope},
    }
