from fastapi import APIRouter
from ...schemas.navigation import RouteRequest
from ...services import route_planner
from ...core.config import RASTER_REGION_ID

router = APIRouter(prefix="/api/navigation", tags=["navigation"])


@router.post("/route")
def route(req: RouteRequest):
    """Same planner as /api/route. region_id defaults to the GeoTIFF region."""
    if not req.region_id:
        req.region_id = RASTER_REGION_ID
    return route_planner.plan(req)
