"""Makes the raster system look like a normal 'Region' to the existing planner / HUD / map code."""
import json
import math
from pathlib import Path
import numpy as np
from rasterio.enums import Resampling
from . import config as C
from . import decode as D
from .layers import LAYERS
from .raster_manager import get_manager
from ..geo import Grid
from ..routing.slope import compute_slope_deg
from ..services import terrain_service, hazard_service, visualization_service as viz

LAYER_PNG = {"imagery": "orthomosaic", "hillshade": "hillshade", "slope": "hirise_slope", "hazard": "hazard"}


def _demo_sites(m, lat_lon_inside):
    base = [("landing", "Octavia E. Butler Landing Site", 0.18, 0.78, "Perseverance Landing Site", "Flat open terrain where Perseverance touched down on Mars. Primary mission staging zone."),
            ("seitah", "Séítah Formation", 0.12, 0.2, "Olivine-Rich Igneous Bedrock", "Ancient layered olivine and pyroxene bedrock formed early in Martian history."),
            ("three_forks", "Three Forks", 0.45, 0.45, "Delta Entrance & Depot", "Key intersection at the delta front where ancient river tributaries met Jezero lake."),
            ("cape_nukshak", "Cape Nukshak", 0.82, 0.25, "Delta Promontory", "Elevated delta outcrop providing panoramic exposure of ancient river delta sediments."),
            ("hogwallow", "Hogwallow Flats", 0.75, 0.62, "Fine-Grained Mudstones", "Fine-grained sedimentary rocks with high potential for preserving ancient biosignatures.")]
    f = m.frame
    out = []
    for sid, name, fx, fy, goal, desc in base:
        x = f.minx + fx * f.width_m
        y = f.maxy - fy * f.height_m
        lat, lon = f.to_latlon(x, y)
        out.append({"id": f"site_{sid}", "name": name, "lat": lat, "lon": lon, "goal": goal, "description": desc,
                    "geology": goal, "science_purpose": desc, "mission": "Placement for demonstration",
                    "observed": "demo placement", "source_url": "", "pov_images": [], "chem_index": None, "chemistry": None})
    return out


class RasterRegion:
    id = C.RASTER_REGION_ID

    def __init__(self):
        m = get_manager()
        self.mgr = m
        self.folder = C.CACHE_DIR / "region"
        self.folder.mkdir(parents=True, exist_ok=True)
        a = terrain_service.analysis()
        w, h, cell = a["w"], a["h"], a["cell"]
        f = m.frame
        north_lat, _ = f.to_latlon(f.minx, f.maxy)
        _, west_lon = f.to_latlon(f.minx, f.maxy)
        center = f.to_latlon((f.minx + f.maxx) / 2, (f.miny + f.maxy) / 2)
        self.dem = a["dem"].astype("float32")
        self.slope = a["slope"].astype("float32")
        self._a = a
        self.grid = Grid({"grid": {"width": w, "height": h, "cell_m": cell, "north_lat": north_lat, "west_lon": west_lon}})
        chem = m.chem()
        self.chem = chem if chem is not None and chem.shape == self.dem.shape else self._resize(chem)
        self.extra_cost = terrain_service.extra_cost()
        # sites / hazards: optional drop-in JSON, else demo placement
        sj, hj = C.RASTER_DIR / "sites.json", C.RASTER_DIR / "hazards.json"
        self.sites = json.loads(sj.read_text(encoding="utf-8")) if sj.exists() else _demo_sites(m, None)
        self.hazards = json.loads(hj.read_text(encoding="utf-8")) if hj.exists() else []
        self.geology = []
        danger = (a["hazard"] == D.DANGER)
        valid = a["hazard"] != D.NODATA
        self.danger_pct = float(danger.sum() / max(valid.sum(), 1) * 100)
        self.danger_blocks = self.danger_pct < 60
        self._danger = danger if self.danger_blocks else np.zeros_like(danger)
        if not self.danger_blocks:
            self.extra_cost = self.extra_cost + danger.astype("float32") * 3.0
        real = [k for k, i in m.infos.items() if i.origin == "nasa"]
        warnings = []
        if not real:
            warnings.append("No .tif files found yet: showing demo terrain. Put your files in backend/app/data/rasters/.")
        elif len(real) < len(LAYERS):
            warnings.append(f"{len(LAYERS) - len(real)} layer(s) are filled with derived/demo data (see Data panel badges).")
        if not self.danger_blocks:
            warnings.append(f"Hazard map marks {self.danger_pct:.0f}% as danger - looks inverted. Set hazard.higher_is in layers.json. Hazards are treated as extra cost, not walls.")
        warnings += m.notes[:3]
        lg, note = hazard_service.legend()
        self.meta = {
            "id": self.id, "name": C.RASTER_REGION_NAME + ("" if real else " (DEMO DATA)"), "role": "primary",
            "synthetic": not real, "science_goal": "Find a route over the delta using slope, hazard and data-trust layers",
            "center": {"lat": center[0], "lon": center[1]}, "coord_status": "from_raster" if real else "synthetic",
            "grid": {"width": w, "height": h, "cell_m": cell, "north_lat": north_lat, "west_lon": west_lon},
            "layers": self._provenance(), "warnings": warnings,
            "raster": self.raster_meta(lg, note),
        }
        self._write_pngs()

    def _resize(self, c):
        if c is None:
            return None
        ys = np.linspace(0, c.shape[0] - 1, self.dem.shape[0]).astype(int)
        xs = np.linspace(0, c.shape[1] - 1, self.dem.shape[1]).astype(int)
        return c[np.ix_(ys, xs)]

    def _write_pngs(self):
        for name, key in LAYER_PNG.items():
            if self.mgr.has(key):
                (self.folder / f"{name}.png").write_bytes(viz.preview(key, 1400))
        cp = viz.chem_png()
        if cp:
            (self.folder / "chemical.png").write_bytes(cp)

    def _provenance(self):
        out = []
        for l in LAYERS:
            i = self.mgr.infos.get(l.key)
            if not i:
                continue
            real = i.origin == "nasa"
            out.append({"kind": {"imagery": "optical", "elevation": "topographic", "slope": "topographic", "shade": "topographic",
                                 "hazard": "topographic", "confidence": "topographic"}[l.kind],
                        "name": l.label, "mission": l.mission if real else "none", "instrument": l.instrument if real else "generated",
                        "product": i.path.name, "resolution_m": round(i.res_m, 2), "acquired": "orbital mapping" if real else "generated",
                        "nature": "static", "source_url": "https://www.uahirise.org/dtm/" if real else "",
                        "limitation": l.role if real else "Filled automatically (not your NASA file) so the view is complete."})
        return out

    def raster_meta(self, legend, note):
        m = self.mgr
        f = m.frame
        layers = []
        for l in LAYERS:
            i = m.infos.get(l.key)
            layers.append({
                "key": l.key, "label": l.label, "role": l.role, "color": l.color, "z": l.z,
                "default_on": l.default_on, "default_opacity": l.default_opacity, "blend": l.blend,
                "origin": i.origin if i else "missing", "mission": l.mission, "instrument": l.instrument,
                "file": l.filename, "res_m": round(i.res_m, 2) if i else l.nominal_res_m,
                "size_mb": round(i.size_mb, 1) if i else 0, "crs": i.crs_text if i else "",
                "overviews": i.overviews if i else 0,
            })
        a = terrain_service.agreement()
        return {
            "layers": layers, "legend": {"hazard": legend, "note": note},
            "frame": {"width_m": f.width_m, "height_m": f.height_m, "max_zoom": m.max_zoom(), "tile_size": C.TILE_SIZE,
                      "tile_url": "/api/layers/{key}/tile/{z}/{x}/{y}.png"},
            "slope_agreement": a, "real_layers": sum(1 for i in m.infos.values() if i.origin == "nasa"),
            "total_layers": len(LAYERS),
        }

    def hazard_mask(self, extra=None):
        mask = self._danger.copy()
        rr, cc = np.ogrid[: self.grid.height, : self.grid.width]
        for hz in list(self.hazards) + list(extra or []):
            r0, c0 = self.grid.latlon_to_cell(hz["lat"], hz["lon"])
            rad = max(1.0, float(hz["radius_m"]) / self.grid.cell_m)
            mask |= (rr - r0) ** 2 + (cc - c0) ** 2 <= rad ** 2
        return mask

    def chem_at(self, lat, lon):
        if self.chem is None:
            return None
        r, c = self.grid.latlon_to_cell(lat, lon)
        if not self.grid.inside(r, c):
            return None
        v = float(self.chem[r, c])
        return None if np.isnan(v) else v
