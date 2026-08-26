from fastapi import APIRouter, Query
import models, schemas
from beanie import PydanticObjectId

router = APIRouter(prefix="/availability", tags=["Availability"])

# Booking slots — salon hours 10 AM – 9 PM, open all week, 1-hour intervals.
# Last start: 20:00 (occupies the 8–9 PM window).
ALL_SLOTS = [f"{h:02d}:00" for h in range(10, 21)]


@router.get("/", response_model=schemas.AvailabilityResponse)
async def get_availability(
    stylist_id: PydanticObjectId = Query(..., description="Stylist ID"),
    date: str = Query(..., description="Date in YYYY-MM-DD format"),
):
    # Delete-on-free model: an existing BookingSlot row for this stylist/date
    # IS a booked slot (rows only exist for active bookings).
    slots = await models.BookingSlot.find(
        models.BookingSlot.stylist_id == stylist_id,
        models.BookingSlot.date == date,
    ).to_list()

    booked_slots = [s.time_slot for s in slots]
    available_slots = [s for s in ALL_SLOTS if s not in booked_slots]

    return schemas.AvailabilityResponse(
        stylist_id=stylist_id,
        date=date,
        available_slots=available_slots,
        booked_slots=booked_slots,
    )
