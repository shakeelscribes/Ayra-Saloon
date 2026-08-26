from fastapi import APIRouter, Depends, HTTPException, status
from typing import List
from beanie import PydanticObjectId
import models, schemas
from auth import get_current_user, get_current_admin

router = APIRouter(prefix="/bookings", tags=["Bookings"])

SALON_PHONE = "918270606750"


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
    # ── Validate service and stylist exist ────────────────────────────────────
    service = await models.Service.get(booking_data.service_id)
    if not service:
        raise HTTPException(status_code=404, detail="Service not found")

    stylist = await models.Stylist.get(booking_data.stylist_id)
    if not stylist:
        raise HTTPException(status_code=404, detail="Stylist not found")

    # Role check: the stylist must handle this service's category
    if (stylist.categories or []) and service.category not in stylist.categories:
        raise HTTPException(
            status_code=409,
            detail=f"{stylist.name} does not handle {service.category} services.",
        )

    # ── Double-booking guard (slot rows = active holds; delete-on-free model) ─
    conflict = await models.BookingSlot.find_one(
        models.BookingSlot.stylist_id == booking_data.stylist_id,
        models.BookingSlot.date == booking_data.date,
        models.BookingSlot.time_slot == booking_data.time_slot,
    )
    if conflict:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This stylist is already booked for that date and time.",
        )

    # The customer can't be in two chairs at once either
    own_conflict = await models.BookingSlot.find_one(
        models.BookingSlot.user_id == current_user.id,
        models.BookingSlot.date == booking_data.date,
        models.BookingSlot.time_slot == booking_data.time_slot,
    )
    if own_conflict:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="You already have a booking at that time. Pick a different slot.",
        )

    booking = models.Booking(
        user_id=current_user.id,
        stylist_id=stylist.id,
        audience=service.audience or "unisex",
        services=[service.id],
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

    slot = models.BookingSlot(
        booking_id=booking.id,
        user_id=current_user.id,
        service_id=service.id,
        stylist_id=stylist.id,
        sequence=0,
        date=booking_data.date,
        time_slot=booking_data.time_slot,
        duration_mins=service.duration_mins,
    )
    await slot.insert()

    await write_notification(
        booking, current_user, "booking_pending",
        f"Hi {current_user.name}! Your {service.name} request with {stylist.name} "
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
