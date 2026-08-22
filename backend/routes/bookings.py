from fastapi import APIRouter, Depends, HTTPException, status
from typing import List
from beanie import PydanticObjectId
import models, schemas
from auth import get_current_user, get_current_admin

router = APIRouter(prefix="/bookings", tags=["Bookings"])

async def serialize_booking(booking: models.Booking) -> schemas.BookingOut:
    service = await models.Service.get(booking.service_id)
    stylist = await models.Stylist.get(booking.stylist_id)
    return schemas.BookingOut(
        id=booking.id,
        date=booking.date,
        time_slot=booking.time_slot,
        notes=booking.notes,
        status=booking.status,
        service=schemas.ServiceOut.model_validate(service) if service else None,
        stylist=schemas.StylistOut.model_validate(stylist) if stylist else None,
    )

@router.post("/", response_model=schemas.BookingOut, status_code=201)
async def create_booking(
    booking_data: schemas.BookingCreate,
    current_user: models.User = Depends(get_current_user),
):
    # ── Double-booking guard ──────────────────────────────────────────────────
    conflict = await models.Booking.find_one(
        models.Booking.stylist_id == booking_data.stylist_id,
        models.Booking.date == booking_data.date,
        models.Booking.time_slot == booking_data.time_slot,
        models.Booking.status != "cancelled",
    )

    if conflict:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This stylist is already booked for that date and time.",
        )

    # ── Validate service and stylist exist ────────────────────────────────────
    service = await models.Service.get(booking_data.service_id)
    if not service:
        raise HTTPException(status_code=404, detail="Service not found")

    stylist = await models.Stylist.get(booking_data.stylist_id)
    if not stylist:
        raise HTTPException(status_code=404, detail="Stylist not found")

    booking = models.Booking(
        user_id=current_user.id,
        service_id=booking_data.service_id,
        stylist_id=booking_data.stylist_id,
        date=booking_data.date,
        time_slot=booking_data.time_slot,
        notes=booking_data.notes,
        status=models.BookingStatus.confirmed,
    )
    await booking.insert()
    return await serialize_booking(booking)

@router.get("/me", response_model=List[schemas.BookingOut])
async def get_my_bookings(
    current_user: models.User = Depends(get_current_user),
):
    bookings = await models.Booking.find(
        models.Booking.user_id == current_user.id
    ).sort(-models.Booking.date, -models.Booking.time_slot).to_list()
    
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
    booking.status = models.BookingStatus.cancelled
    await booking.save()

# ── Admin: all bookings ───────────────────────────────────────────────────────
@router.get("/admin/all", response_model=List[schemas.BookingOut])
async def get_all_bookings(
    date: str = None,
    _admin: models.User = Depends(get_current_admin),
):
    if date:
        bookings = await models.Booking.find(
            models.Booking.date == date
        ).sort(models.Booking.date, models.Booking.time_slot).to_list()
    else:
        bookings = await models.Booking.find_all().sort(
            models.Booking.date, models.Booking.time_slot
        ).to_list()
        
    return [await serialize_booking(b) for b in bookings]
