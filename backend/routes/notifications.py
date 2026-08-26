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
    await notification.save()
    return notification
