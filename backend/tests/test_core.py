import numpy as np
from app.routing.slope import compute_slope_deg
from app.routing.astar import astar
from app.routing.costmap import build_cost


def test_slope_flat_and_ramp():
    flat = np.zeros((5, 5), dtype="float32")
    assert np.allclose(compute_slope_deg(flat, 10), 0)
    ramp = np.tile(np.arange(5, dtype="float32") * 10, (5, 1))  # 10 m rise per 10 m = 45 deg
    assert np.allclose(compute_slope_deg(ramp, 10), 45, atol=0.5)


def test_astar_goes_around_block():
    cost = np.ones((10, 10))
    cost[:, 5] = np.inf
    cost[0, 5] = 1  # gap at the top
    path = astar(cost, (9, 0), (9, 9))
    assert path and (0, 5) in path


def test_astar_none_when_walled():
    cost = np.ones((10, 10))
    cost[:, 5] = np.inf
    assert astar(cost, (0, 0), (0, 9)) is None


def test_nodata_is_blocked():
    slope = np.zeros((3, 3), dtype="float32")
    slope[1, 1] = np.nan
    c = build_cost(slope, np.zeros((3, 3), bool), max_slope=20, caution_slope=10)
    assert np.isinf(c[1, 1])
