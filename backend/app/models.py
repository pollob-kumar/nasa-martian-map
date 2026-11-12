from pydantic import BaseModel, Field
from typing import Optional


class LatLon(BaseModel):
    lat: float
    lon: float


class Obstacle(LatLon):
    radius_m: float = Field(gt=0, le=2000)
    name: str = "user obstacle"


class RouteRequest(BaseModel):
    region_id: str
    start: LatLon
    goal_site_id: Optional[str] = None
    goal: Optional[LatLon] = None
    via_site_ids: list[str] = []
    max_slope_deg: Optional[float] = Field(default=None, gt=0, lt=90)
    caution_slope_deg: Optional[float] = Field(default=None, gt=0, lt=90)
    walk_speed_ms: Optional[float] = Field(default=None, gt=0, le=3)
    load_factor: Optional[float] = Field(default=None, ge=1, le=3)
    science_stop_min: Optional[float] = Field(default=None, ge=0, le=240)
    obstacles: list[Obstacle] = []
