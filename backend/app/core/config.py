"""Raster-system settings. Change values here (or with environment variables) - nothing else needs editing."""
import os
from pathlib import Path

APP_DIR = Path(__file__).resolve().parents[1]

# >>> DROP YOUR .tif FILES HERE (names must match, see app/data/rasters/README.md) <<<
RASTER_DIR = Path(os.environ.get("REDNAV_RASTER_DIR", APP_DIR / "data" / "rasters"))
CACHE_DIR = Path(os.environ.get("REDNAV_CACHE_DIR", APP_DIR / "data" / "cache"))

MARS_RADIUS_M = 3_396_190.0
RASTER_REGION_ID = "jezero_hirise"
RASTER_REGION_NAME = "Jezero Crater - HiRISE terrain"

TILE_SIZE = 256
# Route/analysis grid: coarse on purpose (5-10 m) so A* is fast. Automatically coarsened if the area is huge.
ANALYSIS_CELL_M = float(os.environ.get("REDNAV_ANALYSIS_CELL_M", 10))
MAX_ANALYSIS_CELLS = int(os.environ.get("REDNAV_MAX_ANALYSIS_CELLS", 2_500_000))
# Resolution of generated (demo / derived) layers: longest side in pixels
DEMO_MAX_PX = int(os.environ.get("REDNAV_DEMO_MAX_PX", 1792))
# Build external .ovr overviews for big files that have none (makes tiles + analysis load fast). 0 = never touch the folder.
AUTO_OVERVIEWS = os.environ.get("REDNAV_AUTO_OVERVIEWS", "1") == "1"

# Fallback map centre when no real raster is present (Jezero crater, Mars) and demo frame size
DEMO_CENTER = (18.4447, 77.4508)
DEMO_FRAME_KM = 12.0

# Route cost add-ons (assumptions, shown in the UI)
MEDIUM_HAZARD_PENALTY = 1.5
LOW_CONFIDENCE_LEVEL = 0.35
LOW_CONFIDENCE_PENALTY = 2.0
SLOPE_DISAGREE_DEG = 6.0
SLOPE_DISAGREE_PENALTY = 1.0
