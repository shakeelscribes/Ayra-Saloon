from fastapi import APIRouter, Depends, HTTPException, status
from typing import List
from datetime import datetime, timedelta, timezone
from beanie import PydanticObjectId
import models, schemas
from auth import get_current_user, get_current_admin
from routes.availability import ALL_SLOTS

router = APIRouter(prefix="/bookings", tags=["Bookings"])

SALON_PHONE = "918270606750"

# The salon runs on IST. Date/slot freshness must be judged in IST — using UTC
# would accept "today 10:00" bookings placed at 05:15 IST (still 23:45 UTC
# "yesterday") and mis-handle the midnight window.
IST = timezone(timedelta(hours=5, minutes=30))


def _ist_now() -> datetime:
    return datetime.now(IST)


def _now():
    from datetime import datetime, timezone
    return datetime.now(timezone.utc)


async def serialize_booking(booking: models.Booking) -> schemas.BookingOut:
    """Build the response from the booking + its slot rows.
    Compat fields (service, time_slot) are derived from the first slot so the
    current frontend keeps working until the multi-slot UI ships (PR-2/3)."""
    slots = await models.BookingSlot.find(
        models.BookingSlot.booking_id == booking.id
    ).sort(models.BookingSlot.sequence).to_list()

    stylist = await models.Stylist.get(booking.stylist_id)
    user = await models.User.get(booking.user_id)

    service = None
    first = slots[0] if slots else None
    if first:
        service = await models.Service.get(first.service_id)
    elif booking.services:
        service = await models.Service.get(booking.services[0])

    return schemas.BookingOut(
        id=booking.id,
        date=booking.date,
        # live slot first; snapshot fallback for cancelled/declined bookings
        time_slot=first.time_slot if first else (booking.time_slot or None),
        notes=booking.notes,
        status=booking.status if isinstance(booking.status, str) else booking.status.value,
        service=schemas.ServiceOut.model_validate(service) if service else None,
        stylist=schemas.StylistOut.model_validate(stylist) if stylist else None,
        customer_name=user.name if user else None,
        services=booking.services,
        slots=[
            schemas.BookingSlotOut(
                id=s.id, service_id=s.service_id, stylist_id=s.stylist_id,
                sequence=s.sequence, date=s.date, time_slot=s.time_slot,
                duration_mins=s.duration_mins,
                service=schemas.ServiceOut.model_validate(svc) if (svc := await models.Service.get(s.service_id)) else None,
                stylist=schemas.StylistOut.model_validate(sty) if (sty := await models.Stylist.get(s.stylist_id)) else None,
            ) for s in slots
        ],
        audience=booking.audience,
        proposed_date=booking.proposed_date,
        proposed_time_slot=booking.proposed_time_slot,
        history=booking.history,
        created_at=booking.created_at,
        updated_at=booking.updated_at,
    )


def write_history(booking: models.Booking, actor: str, action: str, from_status, to_status, payload=None):
    booking.history = booking.history or []
    booking.history.append({
        "ts": _now().isoformat(),
        "actor": actor,
        "action": action,
        "from_status": from_status,
        "to_status": to_status,
        "payload": payload or {},
    })
    booking.updated_at = _now()


async def write_notification(booking: models.Booking, user: models.User, kind: str, text: str):
    phone = (user.phone or "").strip()
    deep_link = ""
    if phone:
        digits = "".join(ch for ch in phone if ch.isdigit())
        deep_link = f"https://wa.me/{digits}?text={text.replace(' ', '%20')}"
    await models.Notification(
        booking_id=booking.id,
        user_id=user.id,
        phone=phone,
        kind=kind,
        rendered_text=text,
        deep_link=deep_link,
        created_at=_now(),
    ).insert()


@router.post("/", response_model=schemas.BookingOut, status_code=201)
async def create_booking(
    booking_data: schemas.BookingCreate,
    current_user: models.User = Depends(get_current_user),
):
    # ── Resolve items: v2 multi-service or PR-1 legacy single-service body ────
    if booking_data.items:
        items = booking_data.items
    elif booking_data.service_id and booking_data.stylist_id:
        items = [schemas.BookingItem(service_id=booking_data.service_id,
                                     stylist_id=booking_data.stylist_id)]
    else:
        raise HTTPException(status_code=422, detail="Provide items[] or service_id + stylist_id.")

    n = len(items)
    if n > len(ALL_SLOTS):
        raise HTTPException(status_code=400, detail="Too many services for one day.")
    if booking_data.time_slot not in ALL_SLOTS:
        raise HTTPException(status_code=400, detail="Invalid time slot.")

    start_idx = ALL_SLOTS.index(booking_data.time_slot)
    if start_idx + n > len(ALL_SLOTS):
        raise HTTPException(
            status_code=400,
            detail=f"Not enough time before closing for {n} service(s). Pick an earlier start.",
        )

    # ── Freshness guard (IST): no bookings in the past ────────────────────────
    now_ist = _ist_now()
    today_ist = now_ist.date().isoformat()
    if booking_data.date < today_ist:
        raise HTTPException(status_code=400, detail="That date has already passed.")
    if booking_data.date == today_ist:
        now_hm = now_ist.strftime("%H:%M")
        if any(t <= now_hm for t in ALL_SLOTS[start_idx:start_idx + n]):
            raise HTTPException(
                status_code=400,
                detail="That time has already passed today. Pick a later slot.",
            )

    # ── Validate + resolve every item (service, stylist, its own slot time) ───
    resolved = []
    audience = None
    seen_services = set()
    for i, item in enumerate(items):
        service = await models.Service.get(item.service_id)
        if not service:
            raise HTTPException(status_code=404, detail=f"Service not found (item {i + 1}).")
        if service.id in seen_services:
            raise HTTPException(status_code=400, detail="Each service can be added only once.")
        seen_services.add(service.id)
        if service.bookable is False:
            raise HTTPException(
                status_code=400,
                detail=f"'{service.name}' is enquiry-only — please contact us to book it.",
            )

        stylist = await models.Stylist.get(item.stylist_id)
        if not stylist:
            raise HTTPException(status_code=404, detail=f"Stylist not found (item {i + 1}).")
        # Category guard: enforce only when the category actually has a
        # specialist. If NO stylist handles it (rare fallback), any stylist
        # is accepted — mirrors the frontend's show-all-stylists fallback.
        if (stylist.categories or []) and service.category not in stylist.categories:
            specialist_count = await models.Stylist.find(
                {"categories": service.category}
            ).count()
            if specialist_count > 0:
                raise HTTPException(
                    status_code=409,
                    detail=f"{stylist.name} does not handle {service.category} services.",
                )

        if audience is None and (service.audience or "unisex") != "unisex":
            audience = service.audience
        if audience and (service.audience or "unisex") not in (audience, "unisex"):
            raise HTTPException(
                status_code=409,
                detail=f"'{service.name}' doesn't match the other selected services.",
            )

        resolved.append((service, stylist, ALL_SLOTS[start_idx + i]))

    # ── Conflict checks: stylist + customer, per slot ─────────────────────────
    for service, stylist, slot_time in resolved:
        stylist_conflict = await models.BookingSlot.find_one(
            models.BookingSlot.stylist_id == stylist.id,
            models.BookingSlot.date == booking_data.date,
            models.BookingSlot.time_slot == slot_time,
        )
        if stylist_conflict:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"{stylist.name} is already booked at {slot_time} on {booking_data.date}.",
            )
        own_conflict = await models.BookingSlot.find_one(
            models.BookingSlot.user_id == current_user.id,
            models.BookingSlot.date == booking_data.date,
            models.BookingSlot.time_slot == slot_time,
        )
        if own_conflict:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"You already have a booking at {slot_time}. Pick a different start time.",
            )

    # ── Create booking (soft-hold) + slot rows ────────────────────────────────
    primary_stylist = resolved[0][1]
    booking = models.Booking(
        user_id=current_user.id,
        stylist_id=primary_stylist.id,
        audience=audience or "unisex",
        services=[service.id for service, _, _ in resolved],
        date=booking_data.date,
        time_slot=booking_data.time_slot,   # snapshot — survives slot-row deletion
        notes=booking_data.notes,
        status=models.BookingStatus.pending,   # soft-hold: awaiting admin approval
        history=[{
            "ts": _now().isoformat(),
            "actor": "customer",
            "action": "created",
            "from_status": None,
            "to_status": "pending",
        }],
    )
    await booking.insert()

    for i, (service, stylist, slot_time) in enumerate(resolved):
        await models.BookingSlot(
            booking_id=booking.id,
            user_id=current_user.id,
            service_id=service.id,
            stylist_id=stylist.id,
            sequence=i,
            date=booking_data.date,
            time_slot=slot_time,
            duration_mins=service.duration_mins,
        ).insert()

    service_names = " + ".join(s.name for s, _, _ in resolved)
    stylist_names = " + ".join(dict.fromkeys(s.name for _, s, _ in resolved))
    slot_range = f"{booking_data.time_slot}–{ALL_SLOTS[start_idx + n - 1] + ' (end)'}" if n > 1 else booking_data.time_slot
    await write_notification(
        booking, current_user, "booking_pending",
        f"Hi {current_user.name}! Your request ({service_names}) with {stylist_names} "
        f"on {booking_data.date} at {booking_data.time_slot} is received and awaiting "
        f"confirmation from Ayra Saloon.",
    )

    return await serialize_booking(booking)


@router.get("/me", response_model=List[schemas.BookingOut])
async def get_my_bookings(
    current_user: models.User = Depends(get_current_user),
):
    bookings = await models.Booking.find(
        models.Booking.user_id == current_user.id
    ).sort(-models.Booking.created_at).to_list()

    return [await serialize_booking(b) for b in bookings]


@router.delete("/{booking_id}", status_code=204)
async def cancel_booking(
    booking_id: PydanticObjectId,
    current_user: models.User = Depends(get_current_user),
):
    booking = await models.Booking.get(booking_id)
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    if booking.user_id != current_user.id and not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Not authorized")
    if booking.status in (models.BookingStatus.cancelled, models.BookingStatus.declined):
        return  # already terminal

    from_status = booking.status if isinstance(booking.status, str) else booking.status.value
    booking.status = models.BookingStatus.cancelled
    write_history(booking, "customer", "cancelled", from_status, "cancelled")
    await booking.save()

    # Delete-on-free: removing the slot rows is what frees the slots
    await models.BookingSlot.find(
        models.BookingSlot.booking_id == booking.id
    ).delete()

    user = await models.User.get(booking.user_id)
    if user:
        await write_notification(
            booking, user, "booking_cancelled",
            f"Your Ayra Saloon appointment on {booking.date} has been cancelled. "
            f"Book again anytime — we'd love to see you.",
        )


# ── Admin: approve / decline pending bookings ─────────────────────────────────
@router.post("/{booking_id}/approve", response_model=schemas.BookingOut)
async def approve_booking(
    booking_id: PydanticObjectId,
    _admin: models.User = Depends(get_current_admin),
):
    booking = await models.Booking.get(booking_id)
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    from_status = booking.status if isinstance(booking.status, str) else booking.status.value
    if booking.status != models.BookingStatus.pending:
        raise HTTPException(status_code=409, detail=f"Only pending bookings can be approved (current: {from_status}).")

    booking.status = models.BookingStatus.confirmed
    write_history(booking, "admin", "approved", from_status, "confirmed")
    await booking.save()

    user = await models.User.get(booking.user_id)
    if user:
        await write_notification(
            booking, user, "booking_confirmed",
            f"Good news {user.name}! Your Ayra Saloon booking on {booking.date} is confirmed. See you soon!",
        )
    return await serialize_booking(booking)


@router.post("/{booking_id}/decline", response_model=schemas.BookingOut)
async def decline_booking(
    booking_id: PydanticObjectId,
    _admin: models.User = Depends(get_current_admin),
):
    booking = await models.Booking.get(booking_id)
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    from_status = booking.status if isinstance(booking.status, str) else booking.status.value
    if booking.status != models.BookingStatus.pending:
        raise HTTPException(status_code=409, detail=f"Only pending bookings can be declined (current: {from_status}).")

    booking.status = models.BookingStatus.declined
    write_history(booking, "admin", "declined", from_status, "declined")
    await booking.save()

    # Delete-on-free: declining releases the held slots
    await models.BookingSlot.find(
        models.BookingSlot.booking_id == booking.id
    ).delete()

    user = await models.User.get(booking.user_id)
    if user:
        await write_notification(
            booking, user, "booking_declined",
            f"Your Ayra Saloon booking request on {booking.date} could not be accommodated. "
            f"Call us to find an alternative slot.",
        )
    return await serialize_booking(booking)


# ── Reschedule: admin proposes, customer accepts/declines ─────────────────────
@router.post("/{booking_id}/propose-reschedule", response_model=schemas.BookingOut)
async def propose_reschedule(
    booking_id: PydanticObjectId,
    body: schemas.RescheduleProposal,
    _admin: models.User = Depends(get_current_admin),
):
    booking = await models.Booking.get(booking_id)
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    from_status = booking.status if isinstance(booking.status, str) else booking.status.value
    if booking.status not in (models.BookingStatus.pending, models.BookingStatus.confirmed):
        raise HTTPException(status_code=409, detail=f"Cannot reschedule a {from_status} booking.")

    n = len(booking.services)
    if body.time_slot not in ALL_SLOTS:
        raise HTTPException(status_code=400, detail="Invalid time slot.")
    start_idx = ALL_SLOTS.index(body.time_slot)
    if start_idx + n > len(ALL_SLOTS):
        raise HTTPException(status_code=400, detail="Not enough time before closing.")

    # Conflict check excluding this booking's own rows (they get replaced)
    own_times = {s.time_slot for s in await models.BookingSlot.find(
        models.BookingSlot.booking_id == booking.id
    ).to_list()} if body.date == booking.date else set()

    for i in range(n):
        t = ALL_SLOTS[start_idx + i]
        if t in own_times:
            continue
        conflict = await models.BookingSlot.find_one(
            models.BookingSlot.stylist_id == booking.stylist_id,
            models.BookingSlot.date == body.date,
            models.BookingSlot.time_slot == t,
        )
        if conflict:
            raise HTTPException(
                status_code=409,
                detail=f"{t} on {body.date} is no longer available. Pick a different time.",
            )

    # Move the whole block: old rows out, new rows in
    await models.BookingSlot.find(models.BookingSlot.booking_id == booking.id).delete()
    for i, sid in enumerate(booking.services):
        await models.BookingSlot(
            booking_id=booking.id,
            user_id=booking.user_id,
            service_id=sid,
            stylist_id=booking.stylist_id,
            sequence=i,
            date=body.date,
            time_slot=ALL_SLOTS[start_idx + i],
            duration_mins=60,
        ).insert()

    booking.proposed_date = body.date
    booking.proposed_time_slot = body.time_slot
    booking.proposed_at = _now()
    booking.status = models.BookingStatus.awaiting_reschedule
    write_history(booking, "admin", "reschedule_proposed", from_status,
                  "awaiting_reschedule", {"date": body.date, "time_slot": body.time_slot,
                                          "reason": body.reason or ""})
    await booking.save()

    user = await models.User.get(booking.user_id)
    if user:
        await write_notification(
            booking, user, "reschedule_proposed",
            f"Hi {user.name}! Ayra Saloon proposes moving your appointment to "
            f"{body.date} at {body.time_slot}. Open My Bookings to accept or decline.",
        )
    return await serialize_booking(booking)


@router.post("/{booking_id}/accept-reschedule", response_model=schemas.BookingOut)
async def accept_reschedule(
    booking_id: PydanticObjectId,
    current_user: models.User = Depends(get_current_user),
):
    booking = await models.Booking.get(booking_id)
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    if booking.user_id != current_user.id and not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Not authorized")
    from_status = booking.status if isinstance(booking.status, str) else booking.status.value
    if booking.status != models.BookingStatus.awaiting_reschedule:
        raise HTTPException(status_code=409, detail="No reschedule proposal pending.")

    booking.date = booking.proposed_date
    booking.time_slot = booking.proposed_time_slot
    booking.status = models.BookingStatus.confirmed
    booking.proposed_date = None
    booking.proposed_time_slot = None
    booking.proposed_at = None
    write_history(booking, "customer", "reschedule_accepted", "awaiting_reschedule", "confirmed")
    await booking.save()

    user = await models.User.get(booking.user_id)
    if user:
        await write_notification(
            booking, user, "reschedule_confirmed",
            f"Confirmed! Your Ayra Saloon appointment is now {booking.date} at {booking.time_slot}.",
        )
    return await serialize_booking(booking)


@router.post("/{booking_id}/decline-reschedule", response_model=schemas.BookingOut)
async def decline_reschedule(
    booking_id: PydanticObjectId,
    current_user: models.User = Depends(get_current_user),
):
    booking = await models.Booking.get(booking_id)
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    if booking.user_id != current_user.id and not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Not authorized")
    from_status = booking.status if isinstance(booking.status, str) else booking.status.value
    if booking.status != models.BookingStatus.awaiting_reschedule:
        raise HTTPException(status_code=409, detail="No reschedule proposal pending.")

    booking.status = models.BookingStatus.declined
    booking.proposed_date = None
    booking.proposed_time_slot = None
    booking.proposed_at = None
    write_history(booking, "customer", "reschedule_declined", "awaiting_reschedule", "declined")
    await booking.save()

    # Proposed rows are soft-holds — freeing them on decline
    await models.BookingSlot.find(models.BookingSlot.booking_id == booking.id).delete()

    user = await models.User.get(booking.user_id)
    if user:
        await write_notification(
            booking, user, "booking_declined",
            f"The proposed reschedule was declined and the request closed. "
            f"Book again anytime at Ayra Saloon.",
        )
    return await serialize_booking(booking)


def booked_times(conflict_slot, date):
    """Best-effort helper for conflict messages (not critical-path)."""
    return []


# ── Admin: all bookings ───────────────────────────────────────────────────────
@router.get("/admin/all", response_model=List[schemas.BookingOut])
async def get_all_bookings(
    date: str = None,
    _admin: models.User = Depends(get_current_admin),
):
    if date:
        bookings = await models.Booking.find(
            models.Booking.date == date
        ).sort(-models.Booking.created_at).to_list()
    else:
        bookings = await models.Booking.find_all().sort(
            -models.Booking.created_at
        ).to_list()

    return [await serialize_booking(b) for b in bookings]
