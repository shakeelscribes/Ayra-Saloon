from pydantic import BaseModel, EmailStr
from typing import Optional, List
from beanie import PydanticObjectId
from datetime import datetime

# ── Auth ──────────────────────────────────────────────────────────────────────
class UserRegister(BaseModel):
    name: str
    email: EmailStr
    password: str
    phone: Optional[str] = None

class UserLogin(BaseModel):
    email: str
    password: str

class UserOut(BaseModel):
    id: PydanticObjectId
    name: str
    email: str
    phone: Optional[str]
    gender: Optional[str] = None
    is_admin: bool
    model_config = {"from_attributes": True}

class TokenResponse(BaseModel):
    access_token: str
    token_type: str
    user: UserOut

# ── Services ──────────────────────────────────────────────────────────────────
class ServiceOut(BaseModel):
    id: PydanticObjectId
    name: str
    description: Optional[str]
    duration_mins: int
    price: float
    category: str
    audience: str = "unisex"
    for_kids: bool = False
    model_config = {"from_attributes": True}

# ── Stylists ──────────────────────────────────────────────────────────────────
class StylistOut(BaseModel):
    id: PydanticObjectId
    name: str
    speciality: Optional[str]
    bio: Optional[str]
    experience_years: int
    categories: List[str] = []
    model_config = {"from_attributes": True}

# ── Bookings ──────────────────────────────────────────────────────────────────
class BookingItem(BaseModel):
    """One service inside a multi-service booking, with its own stylist."""
    service_id: PydanticObjectId
    stylist_id: PydanticObjectId

# PR-1 compat body (single service) + PR-2 multi-service body share this schema:
# legacy senders fill service_id/stylist_id; the new flow fills items[].
class BookingCreate(BaseModel):
    service_id: Optional[PydanticObjectId] = None
    stylist_id: Optional[PydanticObjectId] = None
    items: Optional[List[BookingItem]] = None
    date: str          # "YYYY-MM-DD"
    time_slot: str     # "HH:MM" — start slot
    notes: Optional[str] = None

class BookingSlotOut(BaseModel):
    id: PydanticObjectId
    service_id: PydanticObjectId
    stylist_id: PydanticObjectId
    sequence: int
    date: str
    time_slot: str
    duration_mins: int
    model_config = {"from_attributes": True}

class BookingOut(BaseModel):
    id: PydanticObjectId
    date: str
    # ── Compat fields (derived from first slot) — current frontend depends on them
    time_slot: Optional[str] = None
    service: Optional[ServiceOut] = None
    stylist: Optional[StylistOut] = None
    customer_name: Optional[str] = None
    # ── New multi-slot shape
    services: List[PydanticObjectId] = []
    slots: List[BookingSlotOut] = []
    audience: str = "unisex"
    status: str
    proposed_date: Optional[str] = None
    proposed_time_slot: Optional[str] = None
    history: List[dict] = []
    notes: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

# ── Availability ──────────────────────────────────────────────────────────────
class AvailabilityResponse(BaseModel):
    stylist_id: PydanticObjectId
    date: str
    available_slots: List[str]
    booked_slots: List[str]
    consecutive_starts: List[str] = []   # starts where `slot_count` consecutive hours are free

class RescheduleProposal(BaseModel):
    date: str              # "YYYY-MM-DD"
    time_slot: str         # "HH:MM"
    reason: Optional[str] = None

class UserUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    gender: Optional[str] = None         # "men" | "women" | None

# ── Notifications ─────────────────────────────────────────────────────────────
class NotificationOut(BaseModel):
    id: PydanticObjectId
    booking_id: PydanticObjectId
    phone: str
    kind: str
    rendered_text: str
    deep_link: str
    sent_at: Optional[datetime] = None
    created_at: datetime
    model_config = {"from_attributes": True}
