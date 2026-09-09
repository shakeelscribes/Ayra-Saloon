"""Shared time-off helpers — used by booking creation, availability, the
stylists routes and the economy of the staff dash.

A TimeOff range is INCLUSIVE on both ends and stored as "YYYY-MM-DD" strings,
so plain string comparison works for containment (start <= date <= end)."""
from typing import Dict, List, Optional

import models


async def stylist_is_off(stylist_id, date: str) -> bool:
    """True when the stylist marked `date` (a single day) unavailable."""
    off = await models.TimeOff.find_one(
        models.TimeOff.stylist_id == stylist_id,
        models.TimeOff.start <= date,
        models.TimeOff.end >= date,
    )
    return off is not None


async def off_map_for_date(date: str) -> Dict:
    """stylist_id -> TimeOff doc for every stylist off on `date`.
    One query for the whole day — the customer wizard and the walk-in form
    both filter per date."""
    rows = await models.TimeOff.find(
        models.TimeOff.start <= date,
        models.TimeOff.end >= date,
    ).to_list()
    return {r.stylist_id: r for r in rows}


async def active_booking_conflicts(stylist_id, start: str, end: str) -> List[models.Booking]:
    """Active bookings (pending / awaiting_reschedule / confirmed) whose slot
    rows fall on any day inside [start, end] for this stylist. Marking the
    range off is BLOCKED while these exist — the UI lists them for
    cancel/reschedule first (block-with-list, no auto-cancel)."""
    active = [models.BookingStatus.pending, models.BookingStatus.awaiting_reschedule,
              models.BookingStatus.confirmed]
    slots = await models.BookingSlot.find(
        models.BookingSlot.stylist_id == stylist_id,
        models.BookingSlot.date >= start,
        models.BookingSlot.date <= end,
    ).to_list()
    if not slots:
        return []
    booking_ids = list({s.booking_id for s in slots})
    bookings = await models.Booking.find(
        {"_id": {"$in": booking_ids}, "status": {"$in": [s.value for s in active]}}
    ).sort(-models.Booking.date).to_list()
    return bookings


def range_overlaps(start_a: str, end_a: str, start_b: str, end_b: str) -> bool:
    """Inclusive date-range overlap (touching ranges DO overlap: 03/09-03/09
    vs 03/09-05/09 share the 3rd)."""
    return start_a <= end_b and start_b <= end_a
