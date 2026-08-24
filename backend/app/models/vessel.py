"""Vessel schemas."""

from datetime import datetime

from pydantic import BaseModel, Field


class Vessel(BaseModel):
    """A vessel that needs a berth and quay-crane service.

    ``priority=1`` is the highest priority.  The scheduler uses priority as a
    multiplier when minimising waiting time.
    """

    id: str
    eta: datetime
    move_count: int = Field(gt=0)
    length: float = Field(gt=0)
    priority: int = Field(default=3, ge=1)
