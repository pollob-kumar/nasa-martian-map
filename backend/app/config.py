"""Central config. Everything NASA-assumption-like lives here so the team can
change it in ONE place and so the UI can show it as an 'Assumption' to judges."""
import os
from pathlib import Path

# data/processed/<region_id>/... is produced by data/scripts/run_all.py
DATA_DIR = Path(os.environ.get("REDNAV_DATA_DIR", Path(__file__).resolve().parents[2] / "data" / "processed"))

MARS_RADIUS_M = 3_396_190.0

# ---- ASSUMPTIONS (NOT validated NASA numbers!) -------------------------------
# The NASA brief says thresholds must be validated / disclosed. We expose them
# as request parameters with these defaults and show them in the UI.
DEFAULT_MAX_SLOPE_DEG = 20.0      # cells steeper than this are NOT traversable
DEFAULT_CAUTION_SLOPE_DEG = 12.0  # cells steeper than this get extra cost
DEFAULT_WALK_SPEED_MS = 0.8       # m/s, suited EVA walking (assumption)
DEFAULT_LOAD_FACTOR = 1.0         # 1.0 = no cargo; >1 slows the crew
DEFAULT_SCIENCE_STOP_MIN = 10.0   # minutes of science work per site stop
CORS_ORIGINS = os.environ.get("REDNAV_CORS", "http://localhost:3000").split(",")

# ---- SUIT / OXYGEN MODEL (ASSUMPTIONS, not validated suit specs) ---------------
# Used for the "how long can the astronaut work" feature. Shown in the UI as assumptions.
SUIT_O2_CAPACITY_MIN = 480.0      # minutes of oxygen at the BASELINE (flat, no cargo) consumption rate
O2_RESERVE_PCT = 25.0             # keep at least this much oxygen in reserve at the end of the mission
O2_SLOPE_FACTOR_PER_DEG = 0.02    # +2 % consumption per degree of slope walked (assumption)
O2_LOAD_FACTOR_WEIGHT = 0.6       # how strongly cargo (load_factor) raises consumption (assumption)
O2_SCIENCE_STOP_FACTOR = 0.6      # standing / working consumes less than walking (assumption)

# ---- RADIATION / SPACE WEATHER (ILLUSTRATIVE ASSUMPTIONS unless a live source answers) ----
# Real Mars surface dose rates come from the Curiosity RAD instrument; we do NOT ship real numbers here.
# These are clearly-labelled placeholders used to show how a Safety Context panel would work.
SYNTHETIC_DOSE_RATE_USV_PER_H = 25.0   # illustrative surface dose rate, NOT a NASA measurement
SYNTHETIC_DOSE_LIMIT_USV = 1000.0      # illustrative per-EVA planning limit, NOT an official limit
NASA_API_KEY = os.environ.get("NASA_API_KEY", "")
