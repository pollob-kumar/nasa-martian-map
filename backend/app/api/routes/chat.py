"""Astronaut assistant. Answers from real context (position, terrain probe, route, oxygen). Short on purpose.
Uses an LLM only when ANTHROPIC_API_KEY is set; otherwise a built-in rule engine (no key needed)."""
import json
import os
from fastapi import APIRouter
from ...schemas.navigation import ChatRequest, ChatResponse
from .terrain import probe_point
from ...core.raster_manager import get_manager

router = APIRouter(prefix="/api", tags=["chat"])

SYSTEM = ("You are RedNav, a calm assistant inside a Mars astronaut's helmet. Answer in at most 2 short sentences, plain words. "
          "Use ONLY the facts in the JSON context. If a fact is missing say so. Never say 'safe'; say 'below the slope limit in the data used'. "
          "Mention demo/derived data if the context says a layer is not NASA data.")


def _facts(ctx):
    f = {}
    lat, lon = ctx.get("lat"), ctx.get("lon")
    if lat is not None and lon is not None:
        p = probe_point(float(lat), float(lon))
        f["here"] = {k: p[k] for k in ("summary", "elevation_m", "slope_main_deg", "slope_check_deg", "hazard", "trust", "inside")}
        f["data_origin"] = {l["key"]: l["origin"] for l in p["layers"]}
    for k in ("oxygen_pct", "oxygen_reserve_pct", "distance_remaining_m", "eta_min", "goal", "goal_why", "next_hazard", "heading", "visible_layers", "steepest_ahead_deg", "route_max_slope_deg"):
        if ctx.get(k) is not None:
            f[k] = ctx[k]
    return f


def _local(msg, f):
    q = msg.lower()
    h = f.get("here", {})
    has = lambda *w: any(x in q for x in w)
    if has("oxygen", "o2", "air", "breath"):
        if "oxygen_pct" in f:
            res = f.get("oxygen_reserve_pct", 25)
            return f"Oxygen {round(f['oxygen_pct'])}% (model). Reserve limit {round(res)}%." + (" Turn back soon." if f["oxygen_pct"] < res + 10 else " Enough for now.")
        return "No oxygen figure yet. Plan a route first."
    if has("hazard", "danger", "risk", "avoid", "careful"):
        hz = h.get("hazard")
        nh = f.get("next_hazard")
        return (f"Here: {hz} zone." if hz else "No hazard value here.") + (f" Next marked hazard: {nh}." if nh else "")
    if has("slope", "steep", "tilt", "incline"):
        s = h.get("slope_main_deg")
        a = f.get("steepest_ahead_deg")
        if s is None:
            return "No slope value at this spot."
        c = h.get("slope_check_deg")
        return f"Slope here {s}°" + (f" (second set: {c}°)" if c is not None else "") + (f". Steepest ahead {a}°." if a else ".")
    if has("elevation", "height", "altitude", "high"):
        e = h.get("elevation_m")
        return f"Elevation here: {e} m." if e is not None else "No elevation value at this spot."
    if has("trust", "reliable", "confidence", "accurate"):
        return f"Elevation data trust here: {h.get('trust') or 'unknown'}."
    if has("where", "position", "location", "coordinate"):
        return f"You are at {f.get('here', {}).get('summary', 'an unknown spot')}. Elevation {h.get('elevation_m')} m." if h else "Position unknown."
    if has("route", "next", "goal", "destination", "far", "eta", "how long", "time"):
        if f.get("goal"):
            return f"Target: {f['goal']}. {round(f.get('distance_remaining_m', 0))} m left, about {f.get('eta_min', '?')} min."
        return "No route yet. Open the map and press PLAN ROUTE."
    if has("layer", "data", "source", "nasa", "real", "demo"):
        o = f.get("data_origin", {})
        real = [k for k, v in o.items() if v == "nasa"]
        return f"{len(real)} of {len(o)} layers here are your NASA files." + ("" if len(real) == len(o) else " The rest are filled automatically.")
    if has("why", "science", "interesting"):
        return f.get("goal_why") or "Pick a site on the map to see why it matters."
    return "Ask about oxygen, slope, hazards, elevation, route or data."


def _llm(msg, f):
    key = os.environ.get("ANTHROPIC_API_KEY")
    if not key:
        return None
    try:
        import requests
        r = requests.post("https://api.anthropic.com/v1/messages", timeout=12,
                          headers={"x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json"},
                          json={"model": os.environ.get("REDNAV_CHAT_MODEL", "claude-sonnet-5-5"), "max_tokens": 200, "system": SYSTEM,
                                "messages": [{"role": "user", "content": f"Context: {json.dumps(f)}\nQuestion: {msg}"}]})
        r.raise_for_status()
        return "".join(b.get("text", "") for b in r.json()["content"]).strip() or None
    except Exception:
        return None


@router.post("/chat", response_model=ChatResponse)
def chat(req: ChatRequest):
    get_manager()
    f = _facts(req.context)
    out = _llm(req.message, f)
    if out:
        return ChatResponse(reply=out, source="llm", facts=f)
    return ChatResponse(reply=_local(req.message, f), source="local", facts=f)
