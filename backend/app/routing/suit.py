"""Suit / oxygen / travel-time model.

Everything numeric here is an ASSUMPTION from config.py (not a validated NASA suit spec).
It answers one question for the astronaut: "can I walk there, work, and still have my oxygen reserve?"
"""
import math
from .. import config


def consumption_factor(slope_deg: float, load_factor: float) -> float:
    """Relative oxygen use vs. walking flat with no cargo (1.0). Steeper ground and cargo raise it."""
    s = 0.0 if not math.isfinite(slope_deg) else max(slope_deg, 0.0)
    return (1.0 + config.O2_SLOPE_FACTOR_PER_DEG * s) * (1.0 + config.O2_LOAD_FACTOR_WEIGHT * (load_factor - 1.0))


def oxygen_budget(seg_dist_m: list[float], seg_slope_deg: list[float], *, walk_speed_ms: float, load_factor: float,
                  stop_min: float, stops: int) -> dict:
    """seg_* = one entry per path segment. Returns cumulative walk oxygen use per segment end + totals (in % of a full tank)."""
    eff_speed = max(walk_speed_ms / max(load_factor, 0.1), 1e-6)
    cap = config.SUIT_O2_CAPACITY_MIN
    cum_pct, cum_min = [0.0], [0.0]
    for d, sl in zip(seg_dist_m, seg_slope_deg):
        t_min = d / eff_speed / 60.0
        cum_min.append(cum_min[-1] + t_min)
        cum_pct.append(cum_pct[-1] + 100.0 * t_min / cap * consumption_factor(sl, load_factor))
    walk_pct = cum_pct[-1]
    # standing/working at a science stop: lower rate than walking, cargo still counts
    stop_pct = stops * 100.0 * stop_min / cap * config.O2_SCIENCE_STOP_FACTOR * (1.0 + config.O2_LOAD_FACTOR_WEIGHT * (load_factor - 1.0))
    one_way = walk_pct + stop_pct
    # return trip: same ground walked again (slope magnitude is symmetric in this model)
    round_trip = 2.0 * walk_pct + stop_pct
    reserve = config.O2_RESERVE_PCT
    return {
        "cum_walk_pct": cum_pct, "cum_walk_min": cum_min,
        "oxygen": {
            "capacity_min_baseline": cap,
            "walk_used_pct": round(walk_pct, 1), "stop_used_pct": round(stop_pct, 1),
            "one_way_used_pct": round(one_way, 1),
            "remaining_on_arrival_pct": round(100.0 - one_way, 1),
            "round_trip_used_pct": round(round_trip, 1),
            "remaining_after_return_pct": round(100.0 - round_trip, 1),
            "reserve_pct": reserve,
            "one_way_ok": (100.0 - one_way) >= reserve,
            "round_trip_ok": (100.0 - round_trip) >= reserve,
            "assumption": "Oxygen model is an illustrative assumption (config.py), not a validated suit specification.",
        },
    }
