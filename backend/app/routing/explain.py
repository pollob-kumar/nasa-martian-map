"""Turns raw route numbers into the NASA-brief explanations:
  - 'make connections / apply context' insights (slope + science target + terrain => advice)
  - the 5-question Route Analysis window (what data, where obstacles, where science, why alternatives, what evidence)
  - routed (A*) detours to interesting science sites near the route
All wording follows the honesty rules: never 'safe' - say 'below the slope limit in the data used'."""
import math
import numpy as np
from .astar import astar
from .costmap import build_cost
from ..geo import Grid


def _line_cells(a, b):
    n = int(max(abs(b[0] - a[0]), abs(b[1] - a[1]))) + 1
    return [(int(round(a[0] + (b[0] - a[0]) * i / max(n - 1, 1))), int(round(a[1] + (b[1] - a[1]) * i / max(n - 1, 1)))) for i in range(n)]


def direct_line_check(reg, start_rc, goal_rc, hazard_mask, max_slope, caution_slope):
    """What would a straight walk from start to goal cross? (used for the 'apply context' message)"""
    cells = [c for c in _line_cells(start_rc, goal_rc) if reg.grid.inside(*c)]
    sl = np.array([reg.slope[c] for c in cells], dtype="float64")
    return {
        "cells": len(cells),
        "max_slope_deg": None if np.all(np.isnan(sl)) else round(float(np.nanmax(sl)), 1),
        "over_limit": int(np.sum(sl > max_slope)),
        "over_caution": int(np.sum((sl > caution_slope) & (sl <= max_slope))),
        "no_data": int(np.sum(np.isnan(sl))),
        "hazard_cells": int(sum(1 for c in cells if hazard_mask[c])),
    }


def insights(reg, goal, direct, primary, max_slope, caution_slope):
    """Short astronaut-facing sentences that connect several datasets (NASA 'make connections / apply context')."""
    out = []
    gname = goal.get("name", "target")
    if direct["over_limit"] or direct["hazard_cells"] or direct["no_data"]:
        parts = []
        if direct["over_limit"]:
            parts.append(f"a high-slope zone (up to {direct['max_slope_deg']}° vs the {max_slope:.0f}° limit)")
        if direct["hazard_cells"]:
            parts.append("a marked hazard area")
        if direct["no_data"]:
            parts.append("cells with no elevation data")
        out.append({"level": "warning", "kind": "direct_path",
                    "text": f"Science target {gname} is located here. The direct path crosses {' and '.join(parts)}. Check the alternative route."})
    elif direct["over_caution"]:
        out.append({"level": "info", "kind": "direct_path",
                    "text": f"Science target {gname} is reachable in a straight line, but {direct['over_caution']} cells on that line exceed the {caution_slope:.0f}° caution slope; the planned route avoids most of them."})
    else:
        out.append({"level": "ok", "kind": "direct_path", "text": f"The direct line to {gname} stays below the slope limit in the data used."})
    if primary:
        ox = primary["safety"]["oxygen"]
        if not ox["one_way_ok"]:
            out.append({"level": "critical", "kind": "oxygen", "text": f"Oxygen on arrival would be {ox['remaining_on_arrival_pct']}%, below the {ox['reserve_pct']:.0f}% reserve (model assumption). Choose a closer target or reduce cargo."})
        elif not ox["round_trip_ok"]:
            out.append({"level": "warning", "kind": "oxygen", "text": f"One-way oxygen is within reserve, but the return walk would leave {ox['remaining_after_return_pct']}%. Plan a pickup or a shorter excursion."})
        if not primary["safety"]["radiation"]["within_limit"]:
            out.append({"level": "warning", "kind": "radiation", "text": "Estimated dose (illustrative assumption) exceeds the planning limit for this mission time."})
    chem = reg.chem_at(goal["lat"], goal["lon"]) if goal.get("lat") is not None else None
    if reg.chem is not None and chem is None:
        out.append({"level": "info", "kind": "missing_chemical", "text": f"Chemical data is MISSING at {gname}; the science value there is unconfirmed."})
    if goal.get("pov_images") == []:
        out.append({"level": "info", "kind": "missing_pov", "text": f"No rover photo taken at {gname} is available; no substitute image is shown."})
    return out


def _hazard_dist_m(grid: Grid, hz, pts):
    r0, c0 = grid.latlon_to_cell(hz["lat"], hz["lon"])
    x0, y0 = grid.cell_to_xy(r0, c0)
    return min(math.hypot(p["x"] - x0, p["y"] - y0) for p in pts) - float(hz.get("radius_m", 0))


def build_explanation(reg, route, all_routes, goal, obstacles, *, max_slope, caution_slope, region_warnings):
    pts = route["points"]
    g = reg.grid
    layers = reg.meta.get("layers", [])
    # ---- 1. which data influenced the route ----
    n_blocked = int(np.sum(reg.slope > max_slope))
    pct_blocked = round(100.0 * n_blocked / reg.slope.size, 1)
    nodata = int(np.sum(np.isnan(reg.slope)))
    data_used = []
    for l in layers:
        k = l["kind"]
        if k == "topographic":
            eff = (f"Slope from this elevation grid blocked {n_blocked} cells ({pct_blocked}% of the region) above {max_slope:.0f}° and added cost above {caution_slope:.0f}°; "
                   f"{nodata} no-data cells are never crossed.")
        elif k == "optical":
            eff = "Visual context for the route and for marking hazards by eye; it does not change the cost grid by itself."
        elif k == "chemical":
            eff = "Used to rank science targets (chemical index at each site); it does not block or open terrain."
        elif k == "radiation":
            eff = "Safety context: estimated dose for the mission time (illustrative if marked synthetic)."
        else:
            eff = "Shown for context."
        data_used.append({"kind": k, "name": l["name"], "mission": l["mission"], "instrument": l["instrument"], "resolution_m": l["resolution_m"], "synthetic": "synthetic" in str(l.get("acquired", "")).lower() or "synthetic" in l["name"].lower(), "effect": eff})
    # ---- 2. where are the obstacles ----
    near = []
    for hz in list(reg.hazards) + [dict(o, name=o.get("name", "user obstacle"), reason="added by the user in this session") for o in obstacles]:
        d = _hazard_dist_m(g, hz, pts)
        if d <= 800:
            near.append({"name": hz.get("name", "obstacle"), "type": "user obstacle" if hz.get("reason", "").startswith("added by the user") else "marked hazard",
                         "radius_m": hz.get("radius_m"), "route_clearance_m": round(max(d, 0)), "reason": hz.get("reason", ""), "source_url": hz.get("source_url", "")})
    near.sort(key=lambda x: x["route_clearance_m"])
    obstacles_out = {"near_route": near, "blocked_steep_cells": n_blocked, "blocked_pct_of_region": pct_blocked, "no_data_cells": nodata,
                     "note": "Cells over the slope limit, cells with no data, hazards and obstacles are all excluded from routing."}
    # ---- 3. where is the science destination ----
    chem = reg.chem_at(goal["lat"], goal["lon"])
    gr, gc = g.latlon_to_cell(goal["lat"], goal["lon"])
    science = {
        "id": goal.get("id"), "name": goal.get("name"), "goal": goal.get("goal"), "description": goal.get("description"),
        "lat": goal["lat"], "lon": goal["lon"], "elev_m": float(reg.dem[gr, gc]) if g.inside(gr, gc) and not np.isnan(reg.dem[gr, gc]) else None,
        "slope_deg": float(reg.slope[gr, gc]) if g.inside(gr, gc) and not np.isnan(reg.slope[gr, gc]) else None,
        "mission": goal.get("mission"), "observed": goal.get("observed"), "source_url": goal.get("source_url"),
        "geology": goal.get("geology"), "chemical_index": None if chem is None else round(chem, 2),
        "chemical_status": "MISSING" if (reg.chem is not None and chem is None) else ("no chemical layer for this region" if reg.chem is None else "available"),
        "rover_photos": len(goal.get("pov_images") or []),
        "scientific_purpose": goal.get("science_purpose") or goal.get("goal"),
    }
    # ---- 4. why were alternatives considered ----
    alts = []
    for r in all_routes:
        if r["strategy"] == route["strategy"]:
            continue
        if not r["found"]:
            alts.append({"strategy": r["strategy"], "found": False, "why": "No traversable path under the same limits."})
            continue
        dd = round(r["distance_m"] - route["distance_m"]); ds = round(r["max_slope_deg"] - route["max_slope_deg"], 1); dt = round(r["mission_time_min"] - route["mission_time_min"], 1)
        if r["strategy"] == "safest":
            why = "Weights gentle slopes heavily: it follows lower-slope parts according to the available terrain data, usually at the price of distance."
        elif r["strategy"] == "shortest_feasible":
            why = "Ignores the slope penalty (but still obeys the no-go limit, hazards and no-data cells): shortest path that is feasible."
        else:
            why = "Balances distance against slope cost."
        alts.append({"strategy": r["strategy"], "found": True, "delta_distance_m": dd, "delta_max_slope_deg": ds, "delta_mission_min": dt,
                     "oxygen_round_trip_ok": r["safety"]["oxygen"]["round_trip_ok"], "why": why})
    # ---- 5. evidence for each decision ----
    ev = []
    topo = next((l for l in layers if l["kind"] == "topographic"), None)
    ev.append({"decision": f"Max slope on this route is {route['max_slope_deg']}° (limit {max_slope:.0f}°)",
               "evidence": [f"Slope = finite differences of the DEM at {g.cell_m:.0f} m cells" + (f" ({topo['mission']} / {topo['instrument']})" if topo else ""),
                            f"Limits are team assumptions (config.py), not validated NASA values"]})
    for h in near[:3]:
        ev.append({"decision": f"Route keeps {h['route_clearance_m']} m clear of {h['name']}", "evidence": [f"{h['type']} radius {h['radius_m']} m", h["reason"] or "no reason recorded", h["source_url"] or "no source URL (synthetic or not provided)"]})
    ox = route["safety"]["oxygen"]
    ev.append({"decision": f"Oxygen round trip {'fits' if ox['round_trip_ok'] else 'does NOT fit'} the {ox['reserve_pct']:.0f}% reserve",
               "evidence": [f"Walk {route['walk_time_min']} min at {route['assumptions']['walk_speed_ms']} m/s, load x{route['assumptions']['load_factor']}", f"Tank model {ox['capacity_min_baseline']:.0f} min baseline (assumption)"]})
    missing = []
    if reg.chem is None:
        missing.append("Chemical layer: MISSING for this region")
    if not goal.get("pov_images"):
        missing.append("Rover photo at the destination: MISSING (no substitute shown)")
    if nodata:
        missing.append(f"Elevation: {nodata} cells have no data and are treated as impassable")
    missing += [w for w in region_warnings if "MISSING" in w.upper() and w not in missing]
    return {"data_used": data_used, "obstacles": obstacles_out, "science_destination": science, "why_alternatives": alts,
            "evidence": ev, "missing_data": missing,
            "route_statement": ("This route follows lower-slope parts according to the available terrain data." if route["strategy"] == "safest"
                                else "This route stays below the slope limit in the data used, trading distance against slope cost.")}


def routed_detours(reg, primary, start_rc, goal_rc, cost, sites_skip, req_params, *, limit=4):
    """For science sites near the primary route: real A* detour (start -> site -> goal) vs the primary route."""
    g = reg.grid
    pts = primary["points"]
    cand = []
    for s in reg.sites:
        if s["id"] in sites_skip:
            continue
        sr, sc = g.latlon_to_cell(s["lat"], s["lon"])
        if not g.inside(sr, sc):
            continue
        sx, sy = g.cell_to_xy(sr, sc)
        if math.hypot(pts[0]["x"] - sx, pts[0]["y"] - sy) <= 3 * g.cell_m:
            continue  # that is the base/start itself
        dmin = min(math.hypot(p["x"] - sx, p["y"] - sy) for p in pts)
        cand.append((dmin, s, (sr, sc)))
    cand.sort(key=lambda t: t[0])
    out = []
    for dmin, s, rc in cand[:limit]:
        if dmin > max(1500.0, 8 * g.cell_m):
            continue
        a = astar(cost, start_rc, rc)
        b = astar(cost, rc, goal_rc) if a else None
        if not a or not b:
            out.append({"id": s["id"], "name": s["name"], "reachable": False, "why_interesting": s.get("goal", ""), "note": "No traversable path through this site under the current limits."})
            continue
        path = a + b[1:]
        dist = sum(math.hypot(path[i][1] - path[i - 1][1], path[i][0] - path[i - 1][0]) for i in range(1, len(path))) * g.cell_m
        extra = dist - primary["distance_m"]
        eff = req_params["walk_speed_ms"] / max(req_params["load_factor"], 0.1)
        extra_min = max(extra, 0) / eff / 60.0 + req_params["science_stop_min"]
        # hazards to consider: marked hazards within 400 m of the site, plus its own slope / missing data
        considerations = []
        for hz in reg.hazards:
            hr, hc = g.latlon_to_cell(hz["lat"], hz["lon"])
            hx, hy = g.cell_to_xy(hr, hc); sx, sy = g.cell_to_xy(*rc)
            d = math.hypot(hx - sx, hy - sy) - float(hz.get("radius_m", 0))
            if d <= 400:
                considerations.append(f"{hz['name']}: {max(round(d), 0)} m from the site ({hz.get('reason', '')})")
        slope_here = float(reg.slope[rc]) if not np.isnan(reg.slope[rc]) else None
        if slope_here is None:
            considerations.append("No elevation data at the site itself.")
        elif slope_here > req_params["caution_slope_deg"]:
            considerations.append(f"Slope at the site is {slope_here:.1f}° (above the {req_params['caution_slope_deg']:.0f}° caution value).")
        if not s.get("pov_images"):
            considerations.append("No rover photo taken at this site is available.")
        chem = reg.chem_at(s["lat"], s["lon"])
        out.append({"id": s["id"], "name": s["name"], "reachable": True, "lat": s["lat"], "lon": s["lon"],
                    "extra_distance_m": round(extra), "extra_time_min": round(extra_min, 1),
                    "why_interesting": s.get("science_purpose") or s.get("goal", ""), "geology": s.get("geology"),
                    "chemical_index": None if chem is None else round(chem, 2),
                    "considerations": considerations, "method": "A* routed detour on the same cost grid"})
    out.sort(key=lambda d: (not d["reachable"], d.get("extra_distance_m", 1e9)))
    return out
