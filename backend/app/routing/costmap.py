import numpy as np


def build_cost(slope_deg: np.ndarray, hazard_mask: np.ndarray, *, max_slope: float, caution_slope: float,
               slope_weight: float = 1.0, obstacles: np.ndarray | None = None) -> np.ndarray:
    """Traversal-cost multiplier per cell.
    - NaN slope (no data)  -> blocked (we never route through unknown terrain)
    - slope > max_slope    -> blocked
    - hazard / obstacle    -> blocked
    - caution..max slope   -> cost grows quadratically
    slope_weight scales the penalty: higher = prefers gentler terrain over short distance."""
    cost = np.ones(slope_deg.shape, dtype="float64")
    over_caution = np.clip((slope_deg - caution_slope) / max(max_slope - caution_slope, 1e-6), 0, 1)
    cost += slope_weight * 6.0 * over_caution ** 2
    cost[np.isnan(slope_deg)] = np.inf
    cost[slope_deg > max_slope] = np.inf
    cost[hazard_mask.astype(bool)] = np.inf
    if obstacles is not None:
        cost[obstacles.astype(bool)] = np.inf
    return cost
