from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from typing import List
from datetime import datetime, timedelta, timezone
from beanie import PydanticObjectId
import models, schemas
from auth import get_current_user, get_current_admin, can_act_on_booking
from limiter import limiter
from routes.availability import (ALL_SLOTS, BOOKING_CUTOFF_MINS, hm_to_mins,
                                 mins_to_hm, slots_needed, intervals_overlap)
from services.timeoff import stylist_is_off

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
        customer_phone=user.phone if user else None,
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
        source=booking.source or "online",
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
    from services.whatsapp import build_deep_link, send
    phone = (user.phone or "").strip()
    deep_link = build_deep_link(phone, text) if phone else ""
    # Manual mode today: send() reports "pending" and the admin completes the
    # delivery from the staff panel. When the Cloud API lands, auto-sends are
    # stamped here without touching any route.
    result = await send(phone, text) if phone else {"status": "failed", "error": "no phone number on file"}
    delivery_status = result.get("status", "pending")
    await models.Notification(
        booking_id=booking.id,
        user_id=user.id,
        phone=phone,
        kind=kind,
        rendered_text=text,
        deep_link=deep_link,
        delivery_status=delivery_status,
        sent_at=_now() if delivery_status == "auto_sent" else None,
        created_at=_now(),
    ).insert()


async def send_calendar_invite(booking: models.Booking, user: models.User,
                               kind: str, to_email: str = None) -> dict:
    """Email the .ics calendar invite for a booking lifecycle moment.

    kind — "confirmed" | "rescheduled" | "cancelled" (drives the email copy;
           the ICS METHOD is REQUEST for the first two — same UID + higher
           SEQUENCE updates the customer's existing event — and CANCEL for
           the last, which deletes it).
    to_email — optional override (walk-in form email). The customer's ACCOUNT
           email is never touched; the invite is just sent to this address.

    Never raises: an email outage must never fail the booking operation.
    Skips synthetic walk-in addresses (walkin.*@ayrasaloon.local) — those
    inboxes don't exist.
    """
    try:
        from services.emailer import booking_invite_email, send_email
        from services.ics import build_ics, calendar_uid

        to = (to_email or user.email or "").strip()
        if not to or to.endswith("@ayrasaloon.local"):
            return {"status": "skipped", "error": "no real email on file"}
        if not booking.date or not booking.time_slot:
            return {"status": "skipped", "error": "booking has no date/time"}

        services_list = []
        total_mins = 0
        for sid in booking.services or []:
            svc = await models.Service.get(sid)
            services_list.append(svc)
            total_mins += (svc.duration_mins if svc and svc.duration_mins else 60)
        stylist = await models.Stylist.get(booking.stylist_id)

        method = "CANCEL" if kind == "cancelled" else "REQUEST"
        ics = build_ics(
            uid=booking.calendar_uid or calendar_uid(booking.id),
            sequence=booking.calendar_sequence or 0,
            method=method,
            date=booking.date,
            time_slot=booking.time_slot,
            duration_mins=total_mins,
            services=services_list,
            stylist=stylist,
            customer_name=user.name,
        )
        subject, html = booking_invite_email(
            kind=kind,
            customer_name=user.name,
            service_names=" + ".join(s.name for s in services_list if s) or "Appointment",
            stylist_name=stylist.name if stylist else "our team",
            date=booking.date,
            time_slot=booking.time_slot,
        )
        result = await send_email(to, subject, html, ics=ics, ics_method=method)
        # ASCII-only log line — Windows consoles (cp1252) can't print '→'.
        print(f"Calendar invite [{kind}] booking {booking.id} to {to}: "
              f"{result.get('status')} {result.get('error') or ''}".strip(), flush=True)
        return result
    except Exception as e:
        print(f"Calendar invite error (booking {booking.id}): {e}", flush=True)
        return {"status": "failed", "error": str(e)}


async def _resolve_and_check(items, date, time_slot, customer_id,
                             ignore_cutoff=False):
    """Shared validation for customer and admin (walk-in) booking creation.

    Resolves every item's service + stylist, enforces the freshness guard
    (IST), category/audience rules, closing-time fit and conflict checks.
    `ignore_cutoff` (admin walk-in override) waives ONLY the time cutoff —
    a started/passed slot today becomes bookable at any point. Past dates
    and conflict checks always apply.

    Returns (resolved, windows, total_mins, audience):
      resolved — [(service, stylist), ...] in booking order
      windows  — [(service, stylist, start_min, end_min), ...] back-to-back
    """
    if time_slot not in ALL_SLOTS:
        raise HTTPException(status_code=400, detail="Invalid time slot.")

    # ── Freshness guard (IST): no bookings in the past ────────────────────────
    now_ist = _ist_now()
    today_ist = now_ist.date().isoformat()
    if date < today_ist:
        raise HTTPException(status_code=400, detail="That date has already passed.")
    if date == today_ist and not ignore_cutoff:
        # Booking closes BOOKING_CUTOFF_MINS before the slot starts: the 10:00
        # slot is bookable until 09:50, gone from 09:51 on.
        slot_min = hm_to_mins(time_slot)
        now_min = now_ist.hour * 60 + now_ist.minute
        if slot_min - now_min < BOOKING_CUTOFF_MINS:
            raise HTTPException(
                status_code=400,
                detail=(f"Booking for this slot closes {BOOKING_CUTOFF_MINS} "
                        f"minutes before start. Pick a later slot."),
            )

    # ── Validate + resolve every item (service, stylist) ──────────────────────
    resolved = []
    total_mins = 0
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
        # Time-off guard: a stylist who marked this date off cannot be booked
        # on it (defensive — the wizard already hides off stylists per date).
        if await stylist_is_off(stylist.id, date):
            raise HTTPException(
                status_code=409,
                detail=f"{stylist.name} is unavailable on {date}. Pick another day or stylist.",
            )
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

        total_mins += service.duration_mins or 60
        resolved.append((service, stylist))

    # ── Duration-based block sizing ───────────────────────────────────────────
    # Whole hourly slots, 30-min grace past each hour boundary (stylists are
    # experienced): 140 min → 2 slots, 150 → 2, 151 → 3.
    n_slots = slots_needed(total_mins)
    start_idx = ALL_SLOTS.index(time_slot)
    if start_idx + n_slots > len(ALL_SLOTS):
        raise HTTPException(
            status_code=400,
            detail=(f"This visit takes about {total_mins} min ({n_slots} hour(s)) — "
                    f"not enough time before closing. Pick an earlier start."),
        )

    # ── Real back-to-back windows: each service starts where the last ends ────
    cursor = hm_to_mins(time_slot)
    windows = []
    for service, stylist in resolved:
        dur = service.duration_mins or 60
        windows.append((service, stylist, cursor, cursor + dur))
        cursor += dur

    # ── Conflict checks (interval overlap): stylist per service window,
    #    customer for the whole visit ─────────────────────────────────────────
    day_rows = await models.BookingSlot.find(
        models.BookingSlot.date == date
    ).to_list()
    visit_start = hm_to_mins(time_slot)
    visit_end = visit_start + total_mins
    for row in day_rows:
        row_start = hm_to_mins(row.time_slot)
        row_end = row_start + (row.duration_mins or 60)
        if not intervals_overlap(visit_start, visit_end, row_start, row_end):
            continue
        if row.user_id == customer_id:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(f"You already have a booking overlapping this time "
                        f"({mins_to_hm(row_start)}–{mins_to_hm(row_end)}) on {date}."),
            )
    for service, stylist, ws, we in windows:
        for row in day_rows:
            if row.stylist_id != stylist.id:
                continue
            row_start = hm_to_mins(row.time_slot)
            row_end = row_start + (row.duration_mins or 60)
            if intervals_overlap(ws, we, row_start, row_end):
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=(f"{stylist.name} is already booked "
                            f"{mins_to_hm(row_start)}–{mins_to_hm(row_end)} on {date}."),
                )

    return resolved, windows, total_mins, audience


@router.post("/", response_model=schemas.BookingOut, status_code=201)
@limiter.limit("5/minute")
async def create_booking(
    request: Request,
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

    resolved, windows, total_mins, audience = await _resolve_and_check(
        items, booking_data.date, booking_data.time_slot, current_user.id)

    # ── Create booking (soft-hold) + slot rows ────────────────────────────────
    primary_stylist = resolved[0][1]
    booking = models.Booking(
        user_id=current_user.id,
        stylist_id=primary_stylist.id,
        audience=audience or "unisex",
        services=[service.id for service, _ in resolved],
        date=booking_data.date,
        time_slot=booking_data.time_slot,   # snapshot — survives slot-row deletion
        notes=booking_data.notes,
        source="online",
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

    for i, (service, stylist, ws, we) in enumerate(windows):
        await models.BookingSlot(
            booking_id=booking.id,
            user_id=current_user.id,
            service_id=service.id,
            stylist_id=stylist.id,
            sequence=i,
            date=booking_data.date,
            time_slot=mins_to_hm(ws),           # REAL start — services run back-to-back
            duration_mins=service.duration_mins or 60,
        ).insert()

    service_names = " + ".join(s.name for s, _, _, _ in windows)
    stylist_names = " + ".join(dict.fromkeys(s.name for _, s, _, _ in windows))
    await write_notification(
        booking, current_user, "booking_pending",
        f"Hi {current_user.name}! Your request ({service_names}) with {stylist_names} "
        f"on {booking_data.date} at {booking_data.time_slot} is received and awaiting "
        f"confirmation from Ayra Unisex Salon.",
    )

    return await serialize_booking(booking)


# ── Admin: walk-in booking — salon enters it on the customer's behalf ─────────
@router.post("/admin/create", response_model=schemas.BookingOut, status_code=201)
async def admin_create_booking(
    data: schemas.AdminBookingCreate,
    _admin: models.User = Depends(get_current_admin),
):
    import re
    from auth import get_password_hash

    # Ops separation: a stylist staff account enters walk-ins for their OWN
    # chair only; the owner (no stylist link) books anyone.
    if _admin.stylist_id:
        foreign = [it for it in data.items if str(it.stylist_id) != str(_admin.stylist_id)]
        if foreign:
            raise HTTPException(
                status_code=403,
                detail="You can only create appointments assigned to yourself.",
            )

    digits = "".join(ch for ch in (data.phone or "") if ch.isdigit())
    if len(digits) < 10:
        raise HTTPException(status_code=400, detail="A valid 10-digit phone number is required.")
    tail = digits[-10:]

    # Find-or-create the customer by phone. Stored phones vary in format
    # ("98765 43210", "+91…"), so match on the trailing 10 digits.
    user = await models.User.find_one({"phone": {"$regex": re.escape(tail) + "$"}})
    created_user = False
    if not user:
        # Synthetic email keeps the account claimable later; the password is
        # a random secret the customer was never given — effectively unusable.
        import secrets
        user = models.User(
            name=data.customer_name.strip(),
            # A form-provided email becomes the account email (claimable later);
            # otherwise the synthetic walkin.*@ayrasaloon.local placeholder.
            email=(data.customer_email or "").strip() or f"walkin.{tail}@ayrasaloon.local",
            hashed_password=get_password_hash(secrets.token_urlsafe(24)),
            phone=("+91" + tail) if len(digits) == 10 else data.phone.strip(),
        )
        await user.insert()
        created_user = True

    # Walk-in override: ignore_cutoff=true seats a customer in a started/passed
    # slot today at any point; conflicts and closing-fit still apply.
    resolved, windows, total_mins, audience = await _resolve_and_check(
        data.items, data.date, data.time_slot, user.id,
        ignore_cutoff=data.ignore_cutoff)

    status_value = (models.BookingStatus.confirmed if data.confirm_now
                    else models.BookingStatus.pending)
    primary_stylist = resolved[0][1]
    booking = models.Booking(
        user_id=user.id,
        stylist_id=primary_stylist.id,
        audience=audience or "unisex",
        services=[service.id for service, _ in resolved],
        date=data.date,
        time_slot=data.time_slot,
        notes=data.notes,
        source="walk_in",
        status=status_value,
        history=[{
            "ts": _now().isoformat(),
            "actor": "admin",
            "action": "created_walk_in",
            "from_status": None,
            "to_status": status_value.value if isinstance(status_value, models.BookingStatus) else status_value,
            "payload": {"by_admin": _admin.email, "created_user": created_user},
        }],
    )
    await booking.insert()

    for i, (service, stylist, ws, we) in enumerate(windows):
        await models.BookingSlot(
            booking_id=booking.id,
            user_id=user.id,
            service_id=service.id,
            stylist_id=stylist.id,
            sequence=i,
            date=data.date,
            time_slot=mins_to_hm(ws),
            duration_mins=service.duration_mins or 60,
        ).insert()

    service_names = " + ".join(s.name for s, _, _, _ in windows)
    stylist_names = " + ".join(dict.fromkeys(s.name for _, s, _, _ in windows))
    if data.confirm_now:
        # Calendar invite: stamp UID + SEQUENCE 0 on the confirmed walk-in.
        from services.ics import calendar_uid
        booking.calendar_uid = booking.calendar_uid or calendar_uid(booking.id)
        booking.calendar_sequence = 0
        await booking.save()
        await write_notification(
            booking, user, "booking_confirmed",
            f"Hi {user.name}! Your appointment ({service_names}) with {stylist_names} "
            f"on {data.date} at {data.time_slot} is confirmed. See you at Ayra Unisex Salon!",
        )
        # Invite goes to the form email if given (matched customer's account
        # email is never overwritten); falls back to the account email.
        await send_calendar_invite(booking, user, "confirmed",
                                   to_email=(data.customer_email or "").strip() or None)
    else:
        await write_notification(
            booking, user, "booking_pending",
            f"Hi {user.name}! Your request ({service_names}) with {stylist_names} "
            f"on {data.date} at {data.time_slot} is received and awaiting "
            f"confirmation from Ayra Unisex Salon.",
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


@router.get("/{booking_id}/calendar.ics")
async def download_calendar_invite(
    booking_id: PydanticObjectId,
    current_user: models.User = Depends(get_current_user),
):
    """Fallback tap-to-add: serves the booking's .ics invite as a download for
    customers who missed the email (or prefer a button). Same UID/SEQUENCE as
    the emailed invite, so adding it updates rather than duplicates."""
    booking = await models.Booking.get(booking_id)
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    if booking.user_id != current_user.id and not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Not authorized")
    if booking.status != models.BookingStatus.confirmed:
        raise HTTPException(status_code=409, detail="Only confirmed bookings have a calendar invite.")
    if not booking.date or not booking.time_slot:
        raise HTTPException(status_code=409, detail="Booking has no date/time.")

    from services.ics import build_ics, calendar_uid

    services_list = []
    total_mins = 0
    for sid in booking.services or []:
        svc = await models.Service.get(sid)
        services_list.append(svc)
        total_mins += (svc.duration_mins if svc and svc.duration_mins else 60)
    stylist = await models.Stylist.get(booking.stylist_id)
    user = await models.User.get(booking.user_id)

    ics = build_ics(
        uid=booking.calendar_uid or calendar_uid(booking.id),
        sequence=booking.calendar_sequence or 0,
        method="REQUEST",
        date=booking.date,
        time_slot=booking.time_slot,
        duration_mins=total_mins,
        services=services_list,
        stylist=stylist,
        customer_name=user.name if user else "",
    )
    return Response(
        content=ics,
        media_type="text/calendar; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="ayra-appointment.ics"'},
    )


@router.delete("/{booking_id}", status_code=204)
async def cancel_booking(
    booking_id: PydanticObjectId,
    current_user: models.User = Depends(get_current_user),
):
    booking = await models.Booking.get(booking_id)
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    if booking.user_id != current_user.id:
        # Stylist staff cancel only bookings in their own chair; the owner
        # (is_admin without stylist link) cancels anything.
        if not current_user.is_admin or (
            current_user.stylist_id
            and not await can_act_on_booking(current_user, booking)
        ):
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
            f"Your Ayra Unisex Salon appointment on {booking.date} has been cancelled. "
            f"Book again anytime — we'd love to see you.",
        )
        # METHOD:CANCEL with the stored UID deletes the event from the
        # customer's calendar. No UID → no invite was ever sent → nothing to
        # remove (declined / TTL-expired bookings land here too).
        if booking.calendar_uid:
            await send_calendar_invite(booking, user, "cancelled")


# ── Admin: approve / decline pending bookings ─────────────────────────────────
@router.post("/{booking_id}/approve", response_model=schemas.BookingOut)
async def approve_booking(
    booking_id: PydanticObjectId,
    _admin: models.User = Depends(get_current_admin),
):
    booking = await models.Booking.get(booking_id)
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    if not await can_act_on_booking(_admin, booking):
        raise HTTPException(status_code=403, detail="You can only manage your own bookings.")
    from_status = booking.status if isinstance(booking.status, str) else booking.status.value
    if booking.status != models.BookingStatus.pending:
        raise HTTPException(status_code=409, detail=f"Only pending bookings can be approved (current: {from_status}).")

    booking.status = models.BookingStatus.confirmed
    write_history(booking, "admin", "approved", from_status, "confirmed")
    # Calendar invite: stamp the UID + SEQUENCE 0 now so every later email
    # (reschedule / cancel) references the same event.
    from services.ics import calendar_uid
    booking.calendar_uid = booking.calendar_uid or calendar_uid(booking.id)
    booking.calendar_sequence = 0
    await booking.save()

    user = await models.User.get(booking.user_id)
    if user:
        await write_notification(
            booking, user, "booking_confirmed",
            f"Good news {user.name}! Your Ayra Unisex Salon booking on {booking.date} is confirmed. See you soon!",
        )
        await send_calendar_invite(booking, user, "confirmed")
    return await serialize_booking(booking)


@router.post("/{booking_id}/decline", response_model=schemas.BookingOut)
async def decline_booking(
    booking_id: PydanticObjectId,
    _admin: models.User = Depends(get_current_admin),
):
    booking = await models.Booking.get(booking_id)
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    if not await can_act_on_booking(_admin, booking):
        raise HTTPException(status_code=403, detail="You can only manage your own bookings.")
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
            f"Your Ayra Unisex Salon booking request on {booking.date} could not be accommodated. "
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
    if not await can_act_on_booking(_admin, booking):
        raise HTTPException(status_code=403, detail="You can only manage your own bookings.")
    from_status = booking.status if isinstance(booking.status, str) else booking.status.value
    if booking.status not in (models.BookingStatus.pending, models.BookingStatus.confirmed):
        raise HTTPException(status_code=409, detail=f"Cannot reschedule a {from_status} booking.")

    if body.time_slot not in ALL_SLOTS:
        raise HTTPException(status_code=400, detail="Invalid time slot.")

    # Keep each slot's own service → stylist mapping and duration; only the
    # date/start moves. (Cascade bookings can involve several stylists.)
    current_rows = await models.BookingSlot.find(
        models.BookingSlot.booking_id == booking.id
    ).sort(models.BookingSlot.sequence).to_list()
    if len(current_rows) != len(booking.services):
        raise HTTPException(
            status_code=409,
            detail="Booking slots are out of sync with the booking. Contact support.",
        )

    # ── Duration-based block sizing (same rule as creation) ───────────────────
    total_mins = sum(r.duration_mins or 60 for r in current_rows)
    n_slots = slots_needed(total_mins)
    start_idx = ALL_SLOTS.index(body.time_slot)
    if start_idx + n_slots > len(ALL_SLOTS):
        raise HTTPException(
            status_code=400,
            detail=(f"This visit takes about {total_mins} min ({n_slots} hour(s)) — "
                    f"not enough time before closing. Pick an earlier start."),
        )

    # ── Freshness guard (IST): never propose a slot in the past ───────────────
    # Reschedule is strictly future-facing: the 10-min booking cutoff applies
    # with no walk-in override (started-slot seating belongs to admin create).
    now_ist = _ist_now()
    today_ist = now_ist.date().isoformat()
    if body.date < today_ist:
        raise HTTPException(status_code=400, detail="That date has already passed.")
    if body.date == today_ist:
        slot_min = hm_to_mins(body.time_slot)
        now_min = now_ist.hour * 60 + now_ist.minute
        if slot_min - now_min < BOOKING_CUTOFF_MINS:
            raise HTTPException(
                status_code=400,
                detail=(f"Booking for this slot closes {BOOKING_CUTOFF_MINS} "
                        f"minutes before start. Pick a later slot."),
            )

    # ── Real back-to-back windows from the proposed start ─────────────────────
    cursor = hm_to_mins(body.time_slot)
    windows = []
    for row in current_rows:
        dur = row.duration_mins or 60
        windows.append((row, cursor, cursor + dur))
        cursor += dur

    # Time-off guard: every stylist involved must be working on the target
    # date — a proposal into someone's marked-off day is rejected up front.
    checked_stylists = set()
    for row_obj, _, _ in windows:
        if row_obj.stylist_id in checked_stylists:
            continue
        checked_stylists.add(row_obj.stylist_id)
        if await stylist_is_off(row_obj.stylist_id, body.date):
            stylist = await models.Stylist.get(row_obj.stylist_id)
            name = stylist.name if stylist else "The stylist"
            raise HTTPException(
                status_code=409,
                detail=f"{name} is unavailable on {body.date}. Pick another day.",
            )

    # Conflict checks per window's OWN stylist + the customer's other bookings,
    # excluding this booking's own rows (they all get replaced below).
    day_rows = await models.BookingSlot.find(
        models.BookingSlot.date == body.date,
        models.BookingSlot.booking_id != booking.id,
    ).to_list()
    visit_start = hm_to_mins(body.time_slot)
    visit_end = visit_start + total_mins
    for row in day_rows:
        row_start = hm_to_mins(row.time_slot)
        row_end = row_start + (row.duration_mins or 60)
        if (intervals_overlap(visit_start, visit_end, row_start, row_end)
                and row.user_id == booking.user_id):
            raise HTTPException(
                status_code=409,
                detail=(f"The customer already has another booking overlapping this time "
                        f"({mins_to_hm(row_start)}–{mins_to_hm(row_end)}) on {body.date}."),
            )
    for row_obj, ws, we in windows:
        for row in day_rows:
            if row.stylist_id != row_obj.stylist_id:
                continue
            row_start = hm_to_mins(row.time_slot)
            row_end = row_start + (row.duration_mins or 60)
            if intervals_overlap(ws, we, row_start, row_end):
                stylist = await models.Stylist.get(row_obj.stylist_id)
                name = stylist.name if stylist else "The stylist"
                raise HTTPException(
                    status_code=409,
                    detail=(f"{name} is already booked "
                            f"{mins_to_hm(row_start)}–{mins_to_hm(row_end)} on {body.date}."),
                )

    # Move the whole block: old rows out, new rows in (same stylists/durations,
    # real back-to-back start times)
    await models.BookingSlot.find(models.BookingSlot.booking_id == booking.id).delete()
    for i, (row_obj, ws, we) in enumerate(windows):
        await models.BookingSlot(
            booking_id=booking.id,
            user_id=booking.user_id,
            service_id=row_obj.service_id,
            stylist_id=row_obj.stylist_id,
            sequence=i,
            date=body.date,
            time_slot=mins_to_hm(ws),
            duration_mins=row_obj.duration_mins,
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
            f"Hi {user.name}! Ayra Unisex Salon proposes moving your appointment to "
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
    if booking.user_id != current_user.id:
        if not current_user.is_admin or (
            current_user.stylist_id
            and not await can_act_on_booking(current_user, booking)
        ):
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
    # SEQUENCE bump: the customer's calendar sees a NEWER version of the SAME
    # event (UID unchanged) — that's what makes the event MOVE.
    booking.calendar_sequence = (booking.calendar_sequence or 0) + 1
    await booking.save()

    user = await models.User.get(booking.user_id)
    if user:
        await write_notification(
            booking, user, "reschedule_confirmed",
            f"Confirmed! Your Ayra Unisex Salon appointment is now {booking.date} at {booking.time_slot}.",
        )
        await send_calendar_invite(booking, user, "rescheduled")
    return await serialize_booking(booking)


@router.post("/{booking_id}/decline-reschedule", response_model=schemas.BookingOut)
async def decline_reschedule(
    booking_id: PydanticObjectId,
    current_user: models.User = Depends(get_current_user),
):
    booking = await models.Booking.get(booking_id)
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    if booking.user_id != current_user.id:
        if not current_user.is_admin or (
            current_user.stylist_id
            and not await can_act_on_booking(current_user, booking)
        ):
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
            f"Book again anytime at Ayra Unisex Salon.",
        )
    return await serialize_booking(booking)


def booked_times(conflict_slot, date):
    """Best-effort helper for conflict messages (not critical-path)."""
    return []


# ── Admin: all bookings ───────────────────────────────────────────────────────
@router.get("/admin/all", response_model=List[schemas.BookingOut])
async def get_all_bookings(
    date: str = None,
    admin: models.User = Depends(get_current_admin),
):
    """Ops separation: stylist staff accounts get THEIR bookings only (primary
    stylist or any slot row); the owner sees everything."""
    query = {}
    if date:
        query["date"] = date
    if admin.stylist_id:
        own_slots = await models.BookingSlot.find(
            models.BookingSlot.stylist_id == admin.stylist_id
        ).to_list()
        own_ids = list({s.booking_id for s in own_slots})
        query["$or"] = [
            {"stylist_id": admin.stylist_id},
            {"_id": {"$in": own_ids}},
        ]
    if query:
        bookings = await models.Booking.find(query).sort(
            -models.Booking.created_at).to_list()
    else:
        bookings = await models.Booking.find_all().sort(
            -models.Booking.created_at).to_list()

    return [await serialize_booking(b) for b in bookings]
