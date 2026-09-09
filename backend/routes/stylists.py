from fastapi import APIRouter, Depends, HTTPException
from datetime import datetime, timezone, timedelta
import models, schemas
from typing import List
from beanie import PydanticObjectId
from auth import get_current_stylist_user, get_current_admin
from services.timeoff import (stylist_is_off, off_map_for_date,
                              active_booking_conflicts, range_overlaps)

router = APIRouter(prefix="/stylists", tags=["Stylists"])


@router.get("/", response_model=List[schemas.StylistOut])
async def get_stylists():
    return await models.Stylist.find_all().to_list()


@router.get("/available", response_model=schemas.StylistsAvailableResponse)
async def get_available_stylists(date: str):
    """Working vs off stylists for ONE date. The customer wizard fetches this
    right after the date step: services whose only specialists are `off` get
    hidden, the stylist step offers only `working`, and a notice names who is
    off. Also powers the shared staff-dash banner."""
    try:
        datetime.strptime(date, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(status_code=400, detail="Date must be YYYY-MM-DD")

    off_map = await off_map_for_date(date)
    working, off = [], []
    for s in await models.Stylist.find_all().sort(models.Stylist.name).to_list():
        entry = schemas.StylistAvailabilityOut(stylist=schemas.StylistOut.model_validate(s))
        if s.id in off_map:
            entry.is_off = True
            off.append(entry)
        else:
            working.append(entry)
    return schemas.StylistsAvailableResponse(date=date, working=working, off=off)


@router.get("/time-off/upcoming", response_model=List[schemas.TimeOffOut])
async def upcoming_time_off(_admin: models.User = Depends(get_current_admin)):
    """All staff-marked ranges from today on — the shared banner on the dash."""
    today = datetime.now(timezone(timedelta(hours=5, minutes=30))).date().isoformat()
    rows = await models.TimeOff.find(models.TimeOff.end >= today).sort(
        models.TimeOff.start).to_list()
    return rows


@router.get("/time-off/me", response_model=List[schemas.TimeOffOut])
async def my_time_off(current: models.User = Depends(get_current_stylist_user)):
    return await models.TimeOff.find(
        models.TimeOff.stylist_id == current.stylist_id
    ).sort(-models.TimeOff.start).to_list()


@router.post("/time-off/me", response_model=List[schemas.TimeOffOut], status_code=201)
async def mark_time_off(
    body: schemas.TimeOffCreate,
    current: models.User = Depends(get_current_stylist_user),
):
    """Mark a range off (self-only). BLOCKED with 409 + the conflicting
    bookings list while active bookings exist anywhere in the range —
    cancel/reschedule them first, then re-submit."""
    start, end = (body.start or "").strip(), (body.end or "").strip()
    try:
        s = datetime.strptime(start, "%Y-%m-%d")
        e = datetime.strptime(end, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(status_code=400, detail="Dates must be YYYY-MM-DD")
    if e < s:
        raise HTTPException(status_code=400, detail="End date is before start date.")
    today = datetime.now(timezone(timedelta(hours=5, minutes=30))).date()
    if s.date() < today:
        raise HTTPException(status_code=400, detail="Start date is in the past.")

    # Overlapping existing range? Idempotent no-op instead of a double doc.
    existing = await models.TimeOff.find(
        models.TimeOff.stylist_id == current.stylist_id).to_list()
    for r in existing:
        if range_overlaps(start, end, r.start, r.end):
            raise HTTPException(
                status_code=409,
                detail=(f"You already marked {r.start} to {r.end} off. "
                        f"Remove that range first if plans changed."),
            )

    conflicts = await active_booking_conflicts(current.stylist_id, start, end)
    if conflicts:
        raise HTTPException(
            status_code=409,
            detail={
                "message": ("You still have bookings in this range. Cancel or "
                            "reschedule them before marking the day off."),
                "conflicts": [
                    {
                        "booking_id": str(b.id),
                        "date": b.date,
                        "time_slot": b.time_slot,
                        "status": b.status if isinstance(b.status, str) else b.status.value,
                        "source": b.source or "online",
                    } for b in conflicts
                ],
            },
        )

    await models.TimeOff(
        stylist_id=current.stylist_id,
        start=start,
        end=end,
        reason=(body.reason or "").strip() or None,
        created_by=current.id,
    ).insert()
    return await models.TimeOff.find(
        models.TimeOff.stylist_id == current.stylist_id
    ).sort(-models.TimeOff.start).to_list()


@router.delete("/time-off/me/{time_off_id}", status_code=204)
async def remove_time_off(
    time_off_id: PydanticObjectId,
    current: models.User = Depends(get_current_stylist_user),
):
    """Un-mark a range — availability returns immediately."""
    row = await models.TimeOff.get(time_off_id)
    if not row or row.stylist_id != current.stylist_id:
        raise HTTPException(status_code=404, detail="Time-off entry not found")
    await row.delete()


@router.get("/{stylist_id}", response_model=schemas.StylistOut)
async def get_stylist(stylist_id: PydanticObjectId):
    stylist = await models.Stylist.get(stylist_id)
    if not stylist:
        raise HTTPException(status_code=404, detail="Stylist not found")
    return stylist
