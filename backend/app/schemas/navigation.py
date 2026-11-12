from pydantic import BaseModel
from typing import Optional, Any
from ..models import RouteRequest  # same request body as /api/route

__all__ = ["RouteRequest", "ChatRequest", "ChatResponse"]


class ChatRequest(BaseModel):
    message: str
    context: dict[str, Any] = {}


class ChatResponse(BaseModel):
    reply: str
    source: str                      # "local" | "llm"
    facts: Optional[dict] = None
