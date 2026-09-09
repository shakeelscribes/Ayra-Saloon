from datetime import datetime, timedelta
from typing import Optional
from jose import JWTError, jwt
import bcrypt
import os
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
import models

# Secret comes from the environment (.env / hosting config). The fallback
# keeps local dev working without setup; production MUST set SECRET_KEY.
# Rotating the secret invalidates all existing tokens (users re-login).
SECRET_KEY = os.getenv("SECRET_KEY", "ayra-saloon-super-secret-key-2024")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24  # 24 hours

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))

def get_password_hash(password: str) -> str:
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password.encode("utf-8"), salt)
    return hashed.decode("utf-8")

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

async def get_current_user(token: str = Depends(oauth2_scheme)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    user = await models.User.find_one(models.User.email == email)
    if user is None:
        raise credentials_exception
    return user

def get_current_admin(current_user: models.User = Depends(get_current_user)):
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user


def get_current_stylist_user(current_user: models.User = Depends(get_current_admin)):
    """Staff account WITH a stylist link — time-off marking is self-service,
    so the owner (no stylist_id) has nothing to mark here."""
    if not current_user.stylist_id:
        raise HTTPException(status_code=403, detail="Stylist account required")
    return current_user


def get_current_owner(current_user: models.User = Depends(get_current_admin)):
    """Owner-only access — admin account WITHOUT a stylist link. Salon-wide
    money (expenses, budgets, exports, per-stylist stats) stays here; stylist
    staff get their own scoped views (/economy/me/*) instead."""
    if current_user.stylist_id:
        raise HTTPException(status_code=403, detail="Owner access required")
    return current_user


async def can_act_on_booking(user: models.User, booking: models.Booking) -> bool:
    """Owner admins act on every booking; stylist staff act ONLY on bookings
    that involve their own chair (primary stylist or any slot row)."""
    if not user.is_admin:
        return False
    if not user.stylist_id:
        return True
    if booking.stylist_id == user.stylist_id:
        return True
    slot = await models.BookingSlot.find_one(
        models.BookingSlot.booking_id == booking.id,
        models.BookingSlot.stylist_id == user.stylist_id,
    )
    return slot is not None
