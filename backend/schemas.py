from pydantic import BaseModel, EmailStr
from typing import Optional, List
from beanie import PydanticObjectId

# ── Auth ──────────────────────────────────────────────────────────────────────
class UserRegister(BaseModel):
    name: str
    email: EmailStr
    password: str
    phone: Optional[str] = None

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserOut(BaseModel):
    id: PydanticObjectId
    name: str
    email: str
    phone: Optional[str]
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
class BookingCreate(BaseModel):
    service_id: PydanticObjectId
    stylist_id: PydanticObjectId
    date: str          # "YYYY-MM-DD"
    time_slot: str     # "HH:MM"
    notes: Optional[str] = None

class BookingOut(BaseModel):
    id: PydanticObjectId
    date: str
    time_slot: str
    notes: Optional[str]
    status: str
    service: ServiceOut
    stylist: StylistOut
    model_config = {"from_attributes": True}

# ── Availability ──────────────────────────────────────────────────────────────
class AvailabilityResponse(BaseModel):
    stylist_id: PydanticObjectId
    date: str
    available_slots: List[str]
    booked_slots: List[str]
