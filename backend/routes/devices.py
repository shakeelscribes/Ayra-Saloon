"""FCM device-token registration for the Ayra Dashboard app.

Stylists only: the owner console has no use for new-booking alerts (the
owner sees everything on the dashboard; new bookings alert the assigned
stylist's devices). Owners attempting to register are told no.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
import models
from auth import get_current_user

router = APIRouter(prefix="/devices", tags=["Devices"])


class DeviceTokenIn(BaseModel):
    token: str
    platform: str = "android"


class DeviceTokenOut(BaseModel):
    registered: bool


@router.post("/token", response_model=DeviceTokenOut)
async def register_token(
    body: DeviceTokenIn,
    current_user: models.User = Depends(get_current_user),
):
    token = (body.token or "").strip()
    if not token:
        raise HTTPException(status_code=400, detail="Missing FCM token.")
    if current_user.role != "stylist":
        # Owners/customers don't get alert subscriptions — accept-and-ignore
        # would leave dead tokens around; explicit 403 keeps the app honest.
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only stylist accounts register devices for alerts.",
        )
    existing = await models.DeviceToken.find_one(
        models.DeviceToken.token == token)
    if existing:
        existing.user_id = current_user.id
        existing.platform = body.platform
        existing.updated_at = models._now()
        await existing.save()
    else:
        await models.DeviceToken(
            user_id=current_user.id,
            token=token,
            platform=body.platform,
        ).insert()
    return DeviceTokenOut(registered=True)


@router.delete("/token", response_model=DeviceTokenOut)
async def unregister_token(
    token: str = "",
    current_user: models.User = Depends(get_current_user),
):
    token = (token or "").strip()
    if token:
        await models.DeviceToken.find(
            models.DeviceToken.token == token,
            models.DeviceToken.user_id == current_user.id,
        ).delete()
    return DeviceTokenOut(registered=False)
