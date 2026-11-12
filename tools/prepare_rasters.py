"""Optional: prepare the fast reduced copies NOW (otherwise the server does it automatically on first start).
   python tools/prepare_rasters.py [folder]      Your original .tif files are never modified."""
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(ROOT))
if len(sys.argv) > 1:
    os.environ["REDNAV_RASTER_DIR"] = sys.argv[1]
os.environ["REDNAV_AUTO_OVERVIEWS"] = "1"
from app.core.raster_manager import get_manager  # noqa: E402

m = get_manager()
for k, i in m.infos.items():
    print(f"{k:16s} {i.origin:8s} {i.width}x{i.height}px  fast copy: {'yes' if i.proxy else 'not needed'}")
print("done. notes:", m.notes or "none")
