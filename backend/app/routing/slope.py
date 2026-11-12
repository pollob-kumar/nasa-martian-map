import numpy as np


def compute_slope_deg(dem: np.ndarray, cell_m: float) -> np.ndarray:
    """Slope in degrees from a DEM (metres) using central differences.
    NaN (no-data) cells stay NaN so the UI can show 'missing data' honestly."""
    dzdy, dzdx = np.gradient(dem.astype("float64"), cell_m)
    return np.degrees(np.arctan(np.hypot(dzdx, dzdy))).astype("float32")
