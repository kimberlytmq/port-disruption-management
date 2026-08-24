"""Schedule schemas."""

from datetime import datetime

from pydantic import BaseModel


class ScheduleEntry(BaseModel):
    berth_id: str
    vessel_id: str
    start_time: datetime
    end_time: datetime
    cranes_used: int = 0
