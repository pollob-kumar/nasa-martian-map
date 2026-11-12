"""Tiny local-grid <-> lat/lon helpers (equirectangular; fine for areas of a few tens of km)."""
import math
from .config import MARS_RADIUS_M


class Grid:
    """Raster grid description. Row 0 is the NORTH edge. x grows east, y grows south (metres)."""

    def __init__(self, meta: dict):
        g = meta["grid"]
        self.width: int = int(g["width"])
        self.height: int = int(g["height"])
        self.cell_m: float = float(g["cell_m"])
        self.lat0: float = float(g["north_lat"])   # latitude of north edge
        self.lon0: float = float(g["west_lon"])    # longitude of west edge (deg east)

    def xy_to_cell(self, x: float, y: float) -> tuple[int, int]:
        return int(round(y / self.cell_m)), int(round(x / self.cell_m))  # (row, col)

    def cell_to_xy(self, row: int, col: int) -> tuple[float, float]:
        return col * self.cell_m, row * self.cell_m

    def cell_to_latlon(self, row: int, col: int) -> tuple[float, float]:
        lat = self.lat0 - (row * self.cell_m) / (MARS_RADIUS_M * math.pi / 180.0)
        lon = self.lon0 + (col * self.cell_m) / (MARS_RADIUS_M * math.cos(math.radians(lat)) * math.pi / 180.0)
        return lat, lon

    def latlon_to_cell(self, lat: float, lon: float) -> tuple[int, int]:
        row = (self.lat0 - lat) * (MARS_RADIUS_M * math.pi / 180.0) / self.cell_m
        col = (lon - self.lon0) * (MARS_RADIUS_M * math.cos(math.radians(lat)) * math.pi / 180.0) / self.cell_m
        return int(round(row)), int(round(col))

    def inside(self, row: int, col: int) -> bool:
        return 0 <= row < self.height and 0 <= col < self.width
