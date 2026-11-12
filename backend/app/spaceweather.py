"""Space weather / radiation safety context.

Honesty rules: a live NASA source (DONKI via api.nasa.gov) is used ONLY when REDNAV_LIVE_SPACE_WEATHER=1 and the call
succeeds. Otherwise we return a clearly-labelled ILLUSTRATIVE (synthetic) context so the Safety panel can be demonstrated.
DONKI describes solar events seen near Earth/the heliosphere; it is NOT a Mars-surface dose measurement."""
import os
import time
from datetime import date, timedelta
from . import config

_CACHE: dict = {"t": 0.0, "v": None}
_TTL_S = 600


def _synthetic() -> dict:
    return {
        "source": "ILLUSTRATIVE (synthetic) - not a NASA measurement",
        "synthetic": True,
        "dose_rate_usv_per_h": config.SYNTHETIC_DOSE_RATE_USV_PER_H,
        "planning_limit_usv": config.SYNTHETIC_DOSE_LIMIT_USV,
        "solar_activity": {"level": "QUIET (illustrative)", "events": []},
        "safety_context": [
            "Radiation and solar events matter for a Marswalk because the surface has little shielding: a longer EVA means more dose.",
            "A real system would read surface dose rate (e.g. MSL RAD) and solar-event alerts (e.g. NASA DONKI) before approving an excursion.",
            "The numbers shown here are placeholders to demonstrate the panel; they are not predictions or limits from NASA.",
        ],
        "how_to_go_live": "Set NASA_API_KEY and REDNAV_LIVE_SPACE_WEATHER=1 to add recent solar flares from NASA DONKI.",
    }


def _live_donki() -> list | None:
    """Recent solar flares from NASA DONKI. Returns None on any failure (we never fake it)."""
    try:
        import requests  # optional dependency
        end = date.today(); start = end - timedelta(days=7)
        r = requests.get("https://api.nasa.gov/DONKI/FLR", timeout=4,
                         params={"startDate": start.isoformat(), "endDate": end.isoformat(), "api_key": config.NASA_API_KEY or "DEMO_KEY"})
        r.raise_for_status()
        return [{"class": f.get("classType"), "begin": f.get("beginTime"), "peak": f.get("peakTime"), "link": f.get("link")} for f in r.json()][:10]
    except Exception:
        return None


def get_space_weather() -> dict:
    now = time.time()
    if _CACHE["v"] is not None and now - _CACHE["t"] < _TTL_S:
        return _CACHE["v"]
    v = _synthetic()
    if os.environ.get("REDNAV_LIVE_SPACE_WEATHER") == "1":
        flares = _live_donki()
        if flares is not None:
            v["solar_activity"] = {"level": "see events (NASA DONKI, near-Earth observations)", "events": flares}
            v["source"] = "NASA DONKI (live solar events) + ILLUSTRATIVE dose placeholders"
        else:
            v["live_error"] = "Live NASA DONKI request failed; showing illustrative context only."
    _CACHE.update(t=now, v=v)
    return v
