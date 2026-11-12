from pydantic import BaseModel
from typing import Optional


class LayerValue(BaseModel):
    key: str
    label: str
    value: str
    origin: str            # nasa | derived | demo
    source: str            # mission / instrument
    res_m: Optional[float] = None


class ProbeResponse(BaseModel):
    lat: float
    lon: float
    inside: bool
    summary: str
    elevation_m: Optional[float] = None
    slope_main_deg: Optional[float] = None
    slope_check_deg: Optional[float] = None
    hazard: Optional[str] = None
    trust: Optional[str] = None
    nearest_site: Optional[dict] = None
    layers: list[LayerValue] = []


class ProfileRequest(BaseModel):
    points: list[list[float]]   # [[lat, lon], ...]
