from fastapi import APIRouter, Query
import models, schemas
from beanie import PydanticObjectId

router = APIRouter(prefix="/availability", tags=["Availability"])

# All possible time slots for a day (9 AM – 6 PM, every 30 min)
ALL_SLOTS = [
    f"{h:02d}:{m:02d}"
    for h in range(9, 18)
    for m in (0, 30)
]

@router.get("/", response_model=schemas.AvailabilityResponse)
async def get_availability(
    stylist_id: PydanticObjectId = Query(..., description="Stylist ID"),
    date: str = Query(..., description="Date in YYYY-MM-DD format"),
):
    booked = await models.Booking.find(
        models.Booking.stylist_id == stylist_id,
        models.Booking.date == date,
        models.Booking.status != "cancelled",
    ).to_list()

    booked_slots = [b.time_slot for b in booked]
    available_slots = [s for s in ALL_SLOTS if s not in booked_slots]

    return schemas.AvailabilityResponse(
        stylist_id=stylist_id,
        date=date,
        available_slots=available_slots,
        booked_slots=booked_slots,
    )
