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
# PR-1 compat shape: the current frontend still submits a single service +
# single slot. PR-2 replaces this with the multi-slot body (service_ids list).
class BookingCreate(BaseModel):
    service_id: PydanticObjectId
    stylist_id: PydanticObjectId
    date: str          # "YYYY-MM-DD"
    time_slot: str     # "HH:MM"
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
