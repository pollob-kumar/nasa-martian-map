"""Tests for the NASA-brief features: oxygen/travel time, route analysis, context insights, routed detours,
missing-data honesty (chemical layer), space-weather context."""
import pytest
from .test_api import _req


def _routes(client, **kw):
    return _req(client, **kw).json()


# ---- oxygen / suit model ------------------------------------------------------------------------------------
def test_oxygen_block_present_and_consistent(client):
    r = _routes(client)["routes"][0]
    ox = r["safety"]["oxygen"]
    assert 0 < ox["one_way_used_pct"] < ox["round_trip_used_pct"]
    assert ox["remaining_on_arrival_pct"] == pytest.approx(100 - ox["one_way_used_pct"], abs=0.2)
    assert r["points"][0]["o2_used_pct"] == 0 and r["points"][-1]["o2_used_pct"] > 0   # HUD can read it per point


def test_cargo_and_slow_speed_use_more_oxygen(client):
    a = _routes(client, load_factor=1.0)["routes"][0]["safety"]["oxygen"]["walk_used_pct"]
    b = _routes(client, load_factor=2.0)["routes"][0]["safety"]["oxygen"]["walk_used_pct"]
    assert b > a * 2   # more time AND higher consumption per minute


def test_reserve_breach_is_reported_in_reasons_and_insights(client):
    d = _routes(client, walk_speed_ms=0.3, load_factor=3.0)
    ox = d["routes"][0]["safety"]["oxygen"]
    assert not ox["one_way_ok"]
    assert any(i["kind"] == "oxygen" and i["level"] == "critical" for i in d["insights"])
    assert any("below the" in t and "reserve" in t for t in d["routes"][0]["reasons"])


def test_radiation_is_labelled_synthetic(client):
    rad = _routes(client)["routes"][0]["safety"]["radiation"]
    assert rad["synthetic"] is True and "placeholder" in rad["assumption"].lower()


# ---- 'make connections / apply context' --------------------------------------------------------------------
def test_direct_path_warning_names_high_slope_zone(client):
    d = _routes(client)
    msg = next(i for i in d["insights"] if i["kind"] == "direct_path")
    assert msg["level"] == "warning" and "high-slope zone" in msg["text"] and "alternative route" in msg["text"]
    assert d["direct_line"]["over_limit"] > 0


# ---- Route analysis window (5 questions) -------------------------------------------------------------------
def test_route_explanation_answers_the_five_questions(client):
    ex = _routes(client)["routes"][0]["explanation"]
    assert all({"kind", "effect"} <= set(x) for x in ex["data_used"])                                 # 1. which data
    assert "blocked_steep_cells" in ex["obstacles"] and ex["obstacles"]["blocked_steep_cells"] > 0  # 2. obstacles
    assert ex["science_destination"]["name"] == "Site B"                                             # 3. destination
    assert isinstance(ex["why_alternatives"], list)                                                   # 4. alternatives
    assert ex["evidence"] and all(e["evidence"] for e in ex["evidence"])                              # 5. evidence
    assert "slope limit in the data used" in ex["route_statement"]
    assert "safe" not in ex["route_statement"].lower().replace("safety", "")


def test_user_obstacle_listed_near_route(client):
    gl, gc = client.latlon
    d = _routes(client, obstacles=[{"lat": gl(25), "lon": gc(30), "radius_m": 60, "name": "rock"}])
    ex = d["routes"][0]["explanation"]
    assert any(o["type"] == "user obstacle" for o in ex["obstacles"]["near_route"])


# ---- routed science detours --------------------------------------------------------------------------------
def test_nearby_science_is_routed_not_straight_line(client):
    near = _routes(client)["nearby_science"]
    d = next(n for n in near if n["id"] == "siteD")
    assert d["reachable"] and d["method"].startswith("A*") and d["extra_distance_m"] >= 0
    assert d["why_interesting"] == "test purpose" and d["extra_time_min"] > 0


# ---- missing data is shown as missing ----------------------------------------------------------------------
def test_missing_chemical_coverage_at_destination(client):
    d = _routes(client)
    sci = d["routes"][0]["explanation"]["science_destination"]
    assert sci["chemical_status"] == "MISSING" and sci["chemical_index"] is None
    assert any(i["kind"] == "missing_chemical" for i in d["insights"])
    assert any("Rover photo" in m for m in d["routes"][0]["explanation"]["missing_data"])


def test_chemical_value_available_elsewhere(client):
    d = _routes(client, goal_site_id="siteC")
    sci = d["routes"][0]["explanation"]["science_destination"]
    assert sci["chemical_status"] == "available" and sci["chemical_index"] == 0.5


def test_chemical_png_404_when_not_built_and_not_in_layer_urls(client):
    assert "chemical" not in client.get("/api/regions/synthetic").json()["layer_urls"]
    r = client.get("/api/regions/synthetic/layers/chemical.png")
    assert r.status_code == 404 and "never faked" in r.json()["detail"]


def test_geology_endpoint(client):
    g = client.get("/api/regions/synthetic/geology").json()
    assert g[0]["type"] == "delta"


# ---- space weather -----------------------------------------------------------------------------------------
def test_space_weather_defaults_to_labelled_illustrative(client, monkeypatch):
    from app import spaceweather
    monkeypatch.delenv("REDNAV_LIVE_SPACE_WEATHER", raising=False)
    spaceweather._CACHE.update(t=0.0, v=None)
    sw = client.get("/api/space-weather").json()
    assert sw["synthetic"] is True and "ILLUSTRATIVE" in sw["source"] and sw["safety_context"]


def test_space_weather_live_failure_falls_back_honestly(client, monkeypatch):
    from app import spaceweather
    monkeypatch.setenv("REDNAV_LIVE_SPACE_WEATHER", "1")
    monkeypatch.setattr(spaceweather, "_live_donki", lambda: None)
    spaceweather._CACHE.update(t=0.0, v=None)
    sw = client.get("/api/space-weather").json()
    assert "live_error" in sw and sw["synthetic"] is True
    spaceweather._CACHE.update(t=0.0, v=None)


def test_space_weather_live_success_is_attributed(client, monkeypatch):
    from app import spaceweather
    monkeypatch.setenv("REDNAV_LIVE_SPACE_WEATHER", "1")
    monkeypatch.setattr(spaceweather, "_live_donki", lambda: [{"class": "M1.0", "begin": "x", "peak": "y", "link": "z"}])
    spaceweather._CACHE.update(t=0.0, v=None)
    sw = client.get("/api/space-weather").json()
    assert "NASA DONKI" in sw["source"] and sw["solar_activity"]["events"][0]["class"] == "M1.0"
    spaceweather._CACHE.update(t=0.0, v=None)
