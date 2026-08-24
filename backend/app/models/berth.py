"""Berth schemas."""

from pydantic import BaseModel, Field


class Berth(BaseModel):
    id: str
    length: float = Field(gt=0)
    cranes: list[str] = Field(default_factory=list)
