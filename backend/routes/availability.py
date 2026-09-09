from fastapi import APIRouter, Query, Request
from datetime import datetime, timedelta, timezone
import models, schemas
from beanie import PydanticObjectId
from limiter import limiter
from services.timeoff import stylist_is_off

router = APIRouter(prefix="/availability", tags=["Availability"])

# Booking slots — salon hours 10 AM – 9 PM, open all week, 1-hour intervals.
# Last start: 20:00 (occupies the 8–9 PM window).
ALL_SLOTS = [f"{h:02d}:00" for h in range(10, 21)]

# Salon-local time (IST) — past-slot filtering must not use UTC, else the
# 00:00–05:30 IST window judges "today" by the wrong calendar day.
_IST = timezone(timedelta(hours=5, minutes=30))

# ── Duration-based block sizing ──────────────────────────────────────────────
# A visit books whole hourly slots, but stylists are experienced: the first
# 30 minutes of overflow past each hour boundary is absorbed — no extra slot.
#   45 min → 1 slot · 90 min → 1 slot · 91 min → 2 slots
#  140 min → 2 slots · 150 min → 2 slots · 151 min → 3 slots
GRACE_MINS = 30

# Booking cutoff: a slot's booking closes this many minutes before its start
# (the 10:00 slot disappears at 09:50). Enforced here for the shared guard in
# bookings.py and mirrored by every client-side slot grid.
BOOKING_CUTOFF_MINS = 10

# The ONE exception: the day's last slot (20:00) stays bookable until 20:15
# IST — 15 minutes past its start — so the salon can still seat a late
# arrival in the final hour. Mirrored by every client-side slot grid.
LAST_SLOT_CLOSE_MINS = 20 * 60 + 15  # 20:15 IST


def slot_closed_for_today(time_slot: str, now_min: int) -> bool:
    """True when `time_slot`'s booking window has shut for today.

    `now_min` is minutes-since-midnight IST. Every slot closes
    BOOKING_CUTOFF_MINS before its start; the last slot (20:00) instead
    stays open until LAST_SLOT_CLOSE_MINS (20:15).
    """
    if time_slot == ALL_SLOTS[-1]:
        return now_min >= LAST_SLOT_CLOSE_MINS
    return hm_to_mins(time_slot) - now_min < BOOKING_CUTOFF_MINS


def hm_to_mins(hm: str) -> int:
    h, m = hm.split(":")
    return int(h) * 60 + int(m)


def mins_to_hm(mins: int) -> str:
    return f"{mins // 60:02d}:{mins % 60:02d}"


def slots_needed(total_mins: int) -> int:
    """Smallest N where total_mins <= N*60 + GRACE_MINS (never below 1)."""
    if total_mins <= 0:
        return 1
    return max(1, -(-(total_mins - GRACE_MINS) // 60))


def intervals_overlap(a_start: int, a_end: int, b_start: int, b_end: int) -> bool:
    """Touching intervals (10:00–10:45 vs 10:45–11:10) do NOT overlap."""
    return a_start < b_end and b_start < a_end


@router.get("/", response_model=schemas.AvailabilityResponse)
@limiter.limit("60/minute")
async def get_availability(
    request: Request,
    stylist_id: PydanticObjectId = Query(..., description="Stylist ID"),
    date: str = Query(..., description="Date in YYYY-MM-DD format"),
    exclude_booking_id: PydanticObjectId = Query(
        None,
        description="Booking whose own rows count as free — reschedule preview.",
    ),
):
    # Delete-on-free model: an existing BookingSlot row for this stylist/date
    # IS a booked interval [time_slot, time_slot + duration_mins). Rows carry
    # REAL start times (services run back-to-back), so a stylist's busy map is
    # a set of minute intervals, not whole hours.
    is_off = await stylist_is_off(stylist_id, date)
    if is_off:
        # Marked off: no bookable slots at all. Busy stays empty — the UI
        # keys off stylist_off and greys the whole day.
        return schemas.AvailabilityResponse(
            stylist_id=stylist_id, date=date, busy=[], stylist_off=True)

    query = [models.BookingSlot.stylist_id == stylist_id,
             models.BookingSlot.date == date]
    if exclude_booking_id:
        query.append(models.BookingSlot.booking_id != exclude_booking_id)
    rows = await models.BookingSlot.find(*query).to_list()

    busy = sorted(
        (
            schemas.BusyInterval(
                start=r.time_slot,
                end=mins_to_hm(hm_to_mins(r.time_slot) + (r.duration_mins or 60)),
            )
            for r in rows
        ),
        key=lambda b: b.start,
    )
    return schemas.AvailabilityResponse(stylist_id=stylist_id, date=date, busy=busy)
