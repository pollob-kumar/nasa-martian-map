"""GeoTIFF layer system: demo fill, drop-in real files (different CRS/res), tiles, probe, route, chat."""
import math
import numpy as np
import pytest
import rasterio
from rasterio.crs import CRS
from rasterio.transform import from_origin
from fastapi.testclient import TestClient

R = 3396190.0


def _fresh(monkeypatch, tmp_path, raster_dir):
    from app.core import config as C, raster_manager as rm
    from app import store
    monkeypatch.setattr(C, "RASTER_DIR", raster_dir)
    monkeypatch.setattr(C, "CACHE_DIR", tmp_path / "cache")
    monkeypatch.setattr(C, "AUTO_OVERVIEWS", False)
    monkeypatch.setattr(C, "DEMO_MAX_PX", 512)
    monkeypatch.setattr(C, "ANALYSIS_CELL_M", 40)
    monkeypatch.setattr(store, "RASTER_ENABLED", True)
    rm.reset_manager(); store.get_region.cache_clear()
    from app.main import app
    return TestClient(app)


def test_demo_fill_everything_works(monkeypatch, tmp_path):
    c = _fresh(monkeypatch, tmp_path, tmp_path / "empty")
    L = c.get("/api/layers").json()
    assert len(L["layers"]) == 7 and all(l["origin"] == "demo" for l in L["layers"])
    meta = c.get("/api/regions/jezero_hirise").json()
    assert meta["synthetic"] and meta["raster"]["real_layers"] == 0
    for k in ["orthomosaic", "elevation", "hazard", "hirise_slope", "hillshade", "confidence", "secondary_slope"]:
        r = c.get(f"/api/layers/{k}/tile/1/0/0.png")
        assert r.status_code == 200 and r.content[:4] == b"\x89PNG"
    p = c.get(f"/api/terrain/probe?lat={meta['center']['lat']}&lon={meta['center']['lon']}").json()
    assert p["inside"] and p["elevation_m"] is not None and len(p["layers"]) == 7
    assert not c.get("/api/terrain/probe?lat=-60&lon=10").json()["inside"]
    s = c.get("/api/regions/jezero_hirise/sites").json()
    body = {"region_id": "jezero_hirise", "start": {"lat": s[0]["lat"], "lon": s[0]["lon"]}, "goal_site_id": s[1]["id"]}
    r = c.post("/api/navigation/route", json=body).json()
    assert any(x["found"] for x in r["routes"])
    chat = c.post("/api/chat", json={"message": "slope?", "context": {"lat": s[0]["lat"], "lon": s[0]["lon"]}}).json()
    assert chat["source"] == "local" and "lope" in chat["reply"]


def _write(path, arr, crs, tr, nodata=None):
    a = arr if arr.ndim == 3 else arr[None]
    with rasterio.open(path, "w", driver="GTiff", height=a.shape[1], width=a.shape[2], count=a.shape[0], dtype=a.dtype,
                       crs=crs, transform=tr, nodata=nodata, tiled=True, compress="deflate") as d:
        d.write(a)


def test_real_files_different_crs_align(monkeypatch, tmp_path):
    rd = tmp_path / "rasters"; rd.mkdir()
    proj = CRS.from_user_input("IAU_2015:49910")
    n, res = 800, 10.0
    x0, y1 = R * math.radians(77.40), R * math.radians(18.45)
    tr = from_origin(x0, y1, res, res)
    yy, xx = np.mgrid[0:n, 0:n].astype("float32")
    bump = np.exp(-(((xx - 600) ** 2 + (yy - 200) ** 2) / (2 * 60 ** 2)))
    elev = (-2500 + 400 * bump).astype("float32")
    _write(rd / "elevation.tif", elev, proj, tr, nodata=-3.4e38)
    _write(rd / "orthomosaic.tif", (50 + 200 * bump).astype("uint8"), proj, tr)
    hz = np.where(bump > 0.5, 3, 1).astype("float32")
    _write(rd / "hazard.tif", hz, proj, tr)
    c = _fresh(monkeypatch, tmp_path, rd)
    layers = {l["key"]: l["origin"] for l in c.get("/api/layers").json()["layers"]}
    assert layers["elevation"] == layers["orthomosaic"] == layers["hazard"] == "nasa"
    assert layers["hirise_slope"] == "derived"          # filled from the real elevation
    from app.core.raster_manager import get_manager
    m = get_manager()
    # the bump peak must be at the same place in every layer
    px, py = x0 + 600.5 * res, y1 - 200.5 * res
    lat, lon = math.degrees(py / R), math.degrees(px / R)
    # the layers use clat=0 equirect; convert through the frame
    fl = m.frame.to_latlon(*m.frame.to_xy(lat, lon))
    p = c.get(f"/api/terrain/probe?lat={lat}&lon={lon}").json()
    assert p["elevation_m"] > -2150 and p["hazard"] == "danger"
    p2 = c.get(f"/api/terrain/probe?lat={lat}&lon={lon - 0.03}").json()
    assert p2["inside"] and p2["elevation_m"] < -2400 and p2["hazard"] == "safer"


def test_hazard_decode_directions():
    from app.core import decode as D
    raw = np.array([[1, 2, 3, 0]], "float32"); ok = np.ones((1, 4), bool)
    cls, _, _ = D.decode_hazard(raw, ok, {})
    assert list(cls[0]) == [D.SAFE, D.MEDIUM, D.DANGER, D.NODATA]
    cls, _, _ = D.decode_hazard(raw, ok, {"higher_is": "safe"})
    assert list(cls[0]) == [D.DANGER, D.MEDIUM, D.SAFE, D.NODATA]


def test_astar_corridor_matches_full():
    from app.routing.astar import astar, _search
    cost = np.ones((600, 600)); cost[:, 300] = np.inf; cost[100, 300] = 1
    a = astar(cost, (300, 10), (300, 590)); b = _search(cost, (300, 10), (300, 590))
    assert a and b and len(a) == len(b)
