"""Crane schemas."""

from typing import Literal

from pydantic import BaseModel


class Crane(BaseModel):
    id: str
    berth_id: str | None = None
    status: Literal["available", "in_use", "down"] = "available"
