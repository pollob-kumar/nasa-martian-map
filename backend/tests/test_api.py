def _req(client, **kw):
    gl, gc = client.latlon
    body = {"region_id": "synthetic", "start": {"lat": gl(60), "lon": gc(10)}, "goal_site_id": "siteB"}
    body.update(kw)
    return client.post("/api/route", json=body)


def test_regions_and_meta(client):
    assert client.get("/api/regions").json()[0]["id"] == "synthetic"
    m = client.get("/api/regions/synthetic").json()
    assert m["stats"]["slope_max_deg"] > 20 and "defaults" in m


def test_route_crosses_ridge_only_through_gap(client):
    r = _req(client).json()
    p = r["routes"][0]
    assert p["found"]
    # ridge cols ~ 45..55 are steep except rows 20..30, so the route must pass the gap
    crossing = [pt for pt in p["points"] if 47 <= pt["x"] / 10 <= 53]
    assert crossing and all(20 <= pt["y"] / 10 <= 30 for pt in crossing)
    assert p["max_slope_deg"] <= 20


def test_obstacle_changes_route(client):
    gl, gc = client.latlon
    base = _req(client).json()["routes"][0]
    blocked = _req(client, obstacles=[{"lat": gl(25), "lon": gc(50), "radius_m": 200}]).json()
    assert not blocked["routes"][0]["found"]          # the only pass is closed
    assert base["found"]


def test_raising_slope_limit_shortens_route(client):
    strict = _req(client, max_slope_deg=20).json()["routes"][0]
    loose = _req(client, max_slope_deg=80, caution_slope_deg=70).json()["routes"][0]
    assert loose["distance_m"] <= strict["distance_m"]


def test_travel_time_uses_assumptions(client):
    a = _req(client, walk_speed_ms=0.8, science_stop_min=0).json()["routes"][0]
    b = _req(client, walk_speed_ms=0.8, load_factor=2.0, science_stop_min=0).json()["routes"][0]
    assert b["walk_time_min"] > a["walk_time_min"] * 1.9


def test_unknown_region_404(client):
    assert client.get("/api/regions/nope").status_code == 404
