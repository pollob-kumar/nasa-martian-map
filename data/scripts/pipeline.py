"""Shared helpers for the data pipeline. Output contract = what backend/app/store.py reads.

data/processed/<region_id>/
    meta.json      region info, grid, provenance (one entry per layer), warnings
    dem.npy        float32 metres, NaN = no data, row 0 = north
    slope.npy      float32 degrees
    imagery.png    base picture aligned to the grid (optional)
    hillshade.png, slope.png, hazard.png   pre-rendered layers
    sites.json     science sites (+ POV images)       hazards.json  analyst-marked hazards
    media/         POV images
"""
import json, math, sys
from pathlib import Path
import numpy as np
import yaml
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))
from app.routing.slope import compute_slope_deg  # single source of truth for slope

MARS_R = 3_396_190.0
PROCESSED = ROOT / "data" / "processed"


def load_regions() -> dict:
    cfg = yaml.safe_load((ROOT / "data" / "regions.yaml").read_text(encoding="utf-8"))
    return {r["id"]: r for r in cfg["regions"]}


def region_grid(reg: dict) -> dict:
    """Square box around centre -> grid description used everywhere."""
    lat, lon = reg["center"]["lat"], reg["center"]["lon"]
    half_m = reg["size_km"] * 1000 / 2
    n = int(round(reg["size_km"] * 1000 / reg["cell_m"]))
    north_lat = lat + math.degrees(half_m / MARS_R)
    west_lon = lon - math.degrees(half_m / (MARS_R * math.cos(math.radians(lat))))
    return {"width": n, "height": n, "cell_m": reg["cell_m"], "north_lat": north_lat, "west_lon": west_lon}


def hillshade(dem: np.ndarray, cell_m: float, az=315.0, alt=45.0) -> np.ndarray:
    d = np.nan_to_num(dem, nan=float(np.nanmean(dem)) if np.isfinite(dem).any() else 0.0)
    dzdy, dzdx = np.gradient(d, cell_m)
    slope = np.arctan(np.hypot(dzdx, dzdy))
    aspect = np.arctan2(-dzdx, dzdy)
    azr, altr = math.radians(360 - az + 90), math.radians(alt)
    hs = np.sin(altr) * np.cos(slope) + np.cos(altr) * np.sin(slope) * np.cos(azr - aspect)
    return (np.clip(hs, 0, 1) * 255).astype("uint8")


def slope_rgba(slope: np.ndarray, caution: float, limit: float) -> np.ndarray:
    """green <caution, amber caution..limit, red >limit, transparent grey = NO DATA."""
    rgba = np.zeros(slope.shape + (4,), dtype="uint8")
    ok = np.isfinite(slope)
    rgba[ok & (slope <= caution)] = (40, 200, 120, 90)
    rgba[ok & (slope > caution) & (slope <= limit)] = (255, 180, 0, 140)
    rgba[ok & (slope > limit)] = (255, 40, 40, 170)
    rgba[~ok] = (120, 120, 120, 200)
    return rgba


def chem_rgba(chem: np.ndarray) -> np.ndarray:
    """Chemical index 0..1 -> purple (low) .. yellow (high). NaN = NO COVERAGE -> grey, shown as MISSING in the UI."""
    rgba = np.zeros(chem.shape + (4,), dtype="uint8")
    ok = np.isfinite(chem)
    t = np.clip(np.nan_to_num(chem, nan=0.0), 0, 1)
    rgba[..., 0] = (70 + 185 * t).astype("uint8")
    rgba[..., 1] = (20 + 200 * t ** 1.3).astype("uint8")
    rgba[..., 2] = (120 * (1 - t) + 30).astype("uint8")
    rgba[..., 3] = np.where(ok, 150, 0)
    rgba[~ok] = (120, 120, 120, 170)
    return rgba


def write_region(rid: str, meta: dict, dem: np.ndarray, imagery_rgb: np.ndarray | None = None,
                 sites=None, hazards=None, limit=20.0, caution=12.0, chem: np.ndarray | None = None, geology=None):
    out = PROCESSED / rid
    out.mkdir(parents=True, exist_ok=True)
    cell = meta["grid"]["cell_m"]
    slope = compute_slope_deg(dem, cell)
    np.save(out / "dem.npy", dem.astype("float32"))
    np.save(out / "slope.npy", slope)
    Image.fromarray(hillshade(dem, cell)).save(out / "hillshade.png")
    Image.fromarray(slope_rgba(slope, caution, limit), "RGBA").save(out / "slope.png")
    if imagery_rgb is not None:
        Image.fromarray(imagery_rgb.astype("uint8")).save(out / "imagery.png")
    hz = np.zeros(slope.shape + (4,), dtype="uint8")
    hz[np.isfinite(slope) & (slope > limit)] = (255, 40, 40, 190)
    Image.fromarray(hz, "RGBA").save(out / "hazard.png")
    (out / "meta.json").write_text(json.dumps(meta, indent=2, ensure_ascii=False), encoding="utf-8")
    (out / "sites.json").write_text(json.dumps(sites or [], indent=2, ensure_ascii=False), encoding="utf-8")
    (out / "hazards.json").write_text(json.dumps(hazards or [], indent=2, ensure_ascii=False), encoding="utf-8")
    if chem is not None:
        np.save(out / "chem.npy", chem.astype("float32"))
        Image.fromarray(chem_rgba(chem), "RGBA").save(out / "chemical.png")
    (out / "geology.json").write_text(json.dumps(geology or [], indent=2, ensure_ascii=False), encoding="utf-8")
    (out / "media").mkdir(exist_ok=True)
    return out


def base_meta(rid: str, reg: dict, layers: list, warnings: list) -> dict:
    g = region_grid(reg)
    return {"id": rid, "name": reg["name"], "role": reg.get("role", "primary"),
            "science_goal": reg.get("science_goal", ""), "center": reg["center"],
            "coord_status": reg.get("coord_status", "set_by_team"),
            "grid": g, "layers": layers, "warnings": warnings}


def layer_entry(kind, name, mission, instrument, product, resolution_m, acquired, nature, url, limitation):
    """nature in {static, historical, current, predicted}  -> shown as a badge in the UI (NASA brief: 'current vs historical')."""
    return {"kind": kind, "name": name, "mission": mission, "instrument": instrument, "product": product,
            "resolution_m": resolution_m, "acquired": acquired, "nature": nature, "source_url": url,
            "limitation": limitation}
