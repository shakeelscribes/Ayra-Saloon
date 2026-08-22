from beanie import Document, PydanticObjectId
from pydantic import Field
import enum
from typing import Optional

class BookingStatus(str, enum.Enum):
    pending = "pending"
    confirmed = "confirmed"
    cancelled = "cancelled"

class User(Document):
    name: str
    email: str
    hashed_password: str
    phone: Optional[str] = None
    is_admin: bool = False

    class Settings:
        name = "users"
        indexes = [
            "email"
        ]

class Service(Document):
    name: str
    description: Optional[str] = None
    duration_mins: int = 60
    price: float
    category: str = "general"

    class Settings:
        name = "services"

class Stylist(Document):
    name: str
    speciality: Optional[str] = None
    bio: Optional[str] = None
    experience_years: int = 1

    class Settings:
        name = "stylists"

class Booking(Document):
    user_id: PydanticObjectId
    service_id: PydanticObjectId
    stylist_id: PydanticObjectId
    date: str   # stored as "YYYY-MM-DD"
    time_slot: str  # stored as "HH:MM"
    notes: Optional[str] = None
    status: BookingStatus = BookingStatus.confirmed

    class Settings:
        name = "bookings"
        indexes = [
            "user_id",
            "service_id",
            "stylist_id",
            "date"
        ]
