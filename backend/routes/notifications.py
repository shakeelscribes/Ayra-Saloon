from fastapi import APIRouter, Depends, HTTPException
from typing import List
from beanie import PydanticObjectId
import models, schemas
from auth import get_current_user, get_current_admin

router = APIRouter(prefix="/notifications", tags=["Notifications"])


@router.get("/me", response_model=List[schemas.NotificationOut])
async def my_notifications(current_user: models.User = Depends(get_current_user)):
    return await models.Notification.find(
        models.Notification.user_id == current_user.id
    ).sort(-models.Notification.created_at).to_list()


@router.get("/all", response_model=List[schemas.NotificationOut])
async def all_notifications(
    limit: int = 50,
    admin: models.User = Depends(get_current_admin),
):
    """WhatsApp panel feed — recent notifications across customers. Stylist
    staff accounts see only messages tied to bookings in their own chair."""
    if admin.stylist_id:
        own_slots = await models.BookingSlot.find(
            models.BookingSlot.stylist_id == admin.stylist_id
        ).to_list()
        own_ids = list({s.booking_id for s in own_slots})
        own_primary = await models.Booking.find(
            models.Booking.stylist_id == admin.stylist_id).to_list()
        booking_ids = list({b.id for b in own_primary} | set(own_ids))
        if not booking_ids:
            return []
        return await models.Notification.find(
            {"booking_id": {"$in": booking_ids}}
        ).sort(-models.Notification.created_at).limit(max(1, min(limit, 200))).to_list()

    return await models.Notification.find_all().sort(
        -models.Notification.created_at
    ).limit(max(1, min(limit, 200))).to_list()


@router.post("/{notification_id}/mark-sent", response_model=schemas.NotificationOut)
async def mark_sent(
    notification_id: PydanticObjectId,
    _admin: models.User = Depends(get_current_admin),
):
    notification = await models.Notification.get(notification_id)
    if not notification:
        raise HTTPException(status_code=404, detail="Notification not found")
    from datetime import datetime, timezone
    notification.sent_at = datetime.now(timezone.utc)
    notification.delivery_status = "manual_sent"
    await notification.save()
    return notification
