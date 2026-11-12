"""SYNTHETIC test region (NOT NASA data). Only used to prove the code logic works."""
import json
import numpy as np
import pytest
from fastapi.testclient import TestClient


def make_region(folder, cell_m=10.0, n=100):
    folder.mkdir(parents=True)
    y, x = np.mgrid[0:n, 0:n].astype("float32")
    dem = np.zeros((n, n), dtype="float32")
    # a steep N-S ridge at col 50 with a gentle pass (gap) at rows 20-30
    ridge = 200.0 * np.exp(-((x - 50) ** 2) / (2 * 3.0 ** 2))
    gap = (y > 20) & (y < 30)
    dem += np.where(gap, 0, ridge)
    np.save(folder / "dem.npy", dem)
    meta = {"id": "synthetic", "name": "Synthetic test region", "center": {"lat": 18.4, "lon": 77.5},
            "grid": {"width": n, "height": n, "cell_m": cell_m, "north_lat": 18.5, "west_lon": 77.4},
            "layers": []}
    (folder / "meta.json").write_text(json.dumps(meta))
    g_lat = lambda r: 18.5 - r * cell_m / (3396190.0 * np.pi / 180)
    g_lon = lambda c: 77.4 + c * cell_m / (3396190.0 * np.cos(np.radians(18.4)) * np.pi / 180)
    sites = [{"id": "siteB", "name": "Site B", "lat": g_lat(60), "lon": g_lon(90), "goal": "test"},
             {"id": "siteC", "name": "Site C", "lat": g_lat(25), "lon": g_lon(70), "goal": "test"}]
    # a third site that lies right next to the straight route (for routed-detour tests) and a chemical raster with a coverage gap
    sites.append({"id": "siteD", "name": "Site D", "lat": g_lat(70), "lon": g_lon(40), "goal": "test", "science_purpose": "test purpose", "pov_images": []})
    (folder / "sites.json").write_text(json.dumps(sites))
    chem = np.full((n, n), 0.5, dtype="float32")
    chem[55:66, 85:96] = np.nan          # siteB (row 60, col 90) has NO chemical coverage
    np.save(folder / "chem.npy", chem)
    (folder / "geology.json").write_text(json.dumps([{"id": "g1", "name": "unit", "type": "delta", "polygon": [[18.4, 77.4], [18.4, 77.41], [18.39, 77.41]]}]))
    (folder / "hazards.json").write_text("[]")
    return g_lat, g_lon


@pytest.fixture()
def client(tmp_path, monkeypatch):
    from app import config, store
    root = tmp_path / "processed"
    gl, gc = make_region(root / "synthetic")
    monkeypatch.setattr(config, "DATA_DIR", root)
    monkeypatch.setattr(store, "DATA_DIR", root)
    monkeypatch.setattr(store, "RASTER_ENABLED", False)   # raster system has its own tests (test_raster.py)
    store.get_region.cache_clear()
    from app.main import app
    c = TestClient(app)
    c.latlon = (gl, gc)
    return c
