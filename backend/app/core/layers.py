"""The 7 data layers. File names here == file names you drop into app/data/rasters/."""
import json
from dataclasses import dataclass, asdict
from . import config as C


@dataclass(frozen=True)
class LayerSpec:
    key: str
    filename: str
    label: str          # short name shown to the user
    role: str           # one-line purpose (also used by the chatbot)
    kind: str           # imagery | elevation | slope | shade | hazard | confidence
    color: str          # theme colour: this layer is drawn in this colour family
    mission: str
    instrument: str
    nominal_res_m: float
    z: int              # draw order (low = bottom)
    default_on: bool
    default_opacity: float
    blend: str = "normal"


LAYERS = [
    LayerSpec("orthomosaic", "orthomosaic.tif", "HiRISE photo", "Surface photo. Map background.", "imagery", "#e2b48a",
              "Mars Reconnaissance Orbiter", "HiRISE orthomosaic", 0.25, 0, True, 1.0),
    LayerSpec("elevation", "elevation.tif", "Elevation", "Height of the ground (DTM / MOLA).", "elevation", "#38bdf8",
              "MRO / Mars Global Surveyor", "HiRISE DTM / MOLA", 1.0, 1, False, 0.65),
    LayerSpec("hillshade", "hillshade.tif", "Relief shading", "Shows hills, craters, bumps.", "shade", "#cbd5e1",
              "MRO", "HiRISE DTM hillshade", 1.0, 2, True, 0.55, "multiply"),
    LayerSpec("hirise_slope", "hirise_slope.tif", "Slope (main)", "Ground tilt. Used for routes.", "slope", "#f59e0b",
              "MRO", "HiRISE DTM slope", 1.0, 3, False, 0.65),
    LayerSpec("secondary_slope", "secondary_slope.tif", "Slope (check)", "Second slope set. Cross-checks the main one.", "slope", "#d946ef",
              "MRO", "Jezero slope", 1.0, 4, False, 0.6),
    LayerSpec("confidence", "confidence.tif", "Data trust", "How reliable the elevation data is.", "confidence", "#22c55e",
              "MRO", "HiRISE FOM color confidence", 1.0, 5, False, 0.6),
    LayerSpec("hazard", "hazard.tif", "Hazard zones", "Danger / medium / safer ground.", "hazard", "#ef4444",
              "MRO", "Jezero hazard map", 1.0, 6, True, 0.7),
]
BY_KEY = {l.key: l for l in LAYERS}


def spec_dict(l: LayerSpec) -> dict:
    return asdict(l)


def load_overrides() -> dict:
    """Optional app/data/rasters/layers.json - only needed if auto-detection guesses an encoding wrong.
    Example: {"hazard": {"higher_is": "safe", "classes": {"safe": [3], "medium": [2], "danger": [1]}},
              "hirise_slope": {"units": "percent"}, "confidence": {"mode": "gray"}}"""
    p = C.RASTER_DIR / "layers.json"
    if p.exists():
        try:
            return json.loads(p.read_text(encoding="utf-8"))
        except Exception:
            return {}
    return {}
