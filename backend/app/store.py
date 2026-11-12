"""Loads one processed region folder (produced by data/scripts) and caches it."""
import json
from functools import lru_cache
from pathlib import Path
import numpy as np
from .config import DATA_DIR
from .core.config import RASTER_REGION_ID
import os

# the GeoTIFF region is always offered (demo-filled until real .tif files are dropped in); tests can switch it off
RASTER_ENABLED = os.environ.get("REDNAV_RASTER_REGION", "1") == "1"
from .geo import Grid
from .routing.slope import compute_slope_deg


class Region:
    def __init__(self, rid: str, folder: Path):
        self.id = rid
        self.folder = folder
        self.meta = json.loads((folder / "meta.json").read_text(encoding="utf-8"))
        self.grid = Grid(self.meta)
        self.dem = np.load(folder / "dem.npy").astype("float32")
        slope_path = folder / "slope.npy"
        self.slope = np.load(slope_path) if slope_path.exists() else compute_slope_deg(self.dem, self.grid.cell_m)
        self.sites = self._json("sites.json", [])
        self.hazards = self._json("hazards.json", [])
        self.geology = self._json("geology.json", [])
        # chemical index raster (0..1, NaN = no coverage). Optional: absent => layer is MISSING, never faked.
        chem_path = folder / "chem.npy"
        self.chem = np.load(chem_path).astype("float32") if chem_path.exists() else None
        self._hazard_mask = None

    def _json(self, name, default):
        p = self.folder / name
        return json.loads(p.read_text(encoding="utf-8")) if p.exists() else default

    def hazard_mask(self, extra: list[dict] | None = None) -> np.ndarray:
        """Boolean mask of analyst-marked hazards (+ optional user-added obstacles), circles in lat/lon + radius_m."""
        mask = np.zeros(self.dem.shape, dtype=bool)
        rr, cc = np.ogrid[: self.grid.height, : self.grid.width]
        for hz in list(self.hazards) + list(extra or []):
            r0, c0 = self.grid.latlon_to_cell(hz["lat"], hz["lon"])
            rad = max(1.0, float(hz["radius_m"]) / self.grid.cell_m)
            mask |= (rr - r0) ** 2 + (cc - c0) ** 2 <= rad ** 2
        return mask


    def chem_at(self, lat: float, lon: float):
        """Chemical index at a point, or None when the raster is absent / has no coverage there."""
        if self.chem is None:
            return None
        r, c = self.grid.latlon_to_cell(lat, lon)
        if not self.grid.inside(r, c):
            return None
        v = float(self.chem[r, c])
        return None if np.isnan(v) else v


def list_region_ids() -> list[str]:
    ids = sorted(p.name for p in DATA_DIR.iterdir() if (p / "meta.json").exists()) if DATA_DIR.exists() else []
    if RASTER_ENABLED:
        ids = [RASTER_REGION_ID] + ids
    return ids


@lru_cache(maxsize=8)
def get_region(rid: str):
    if RASTER_ENABLED and rid == RASTER_REGION_ID:
        from .core.raster_region import RasterRegion
        return RasterRegion()
    folder = DATA_DIR / rid
    if not (folder / "meta.json").exists():
        raise KeyError(rid)
    return Region(rid, folder)
