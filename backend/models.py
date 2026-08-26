from beanie import Document, PydanticObjectId
from pydantic import Field
from pymongo import IndexModel
import enum
from typing import Optional, List
from datetime import datetime, timezone


def _now() -> datetime:
    return datetime.now(timezone.utc)


class BookingStatus(str, enum.Enum):
    pending = "pending"                       # customer submitted, awaiting admin approval
    awaiting_reschedule = "awaiting_reschedule"  # admin proposed new time, awaiting customer
    confirmed = "confirmed"                   # admin approved OR customer accepted reschedule
    declined = "declined"                     # admin declined / reschedule declined
    cancelled = "cancelled"                   # customer or admin cancelled (terminal)


class User(Document):
    name: str
    email: str
    hashed_password: str
    phone: Optional[str] = None        # E.164 — used for WhatsApp notifications
    gender: Optional[str] = None       # "men" | "women" | None — booking UI default only
    is_admin: bool = False

    class Settings:
        name = "users"
        indexes = ["email"]


class Service(Document):
    name: str                          # clean name, no gender suffix (audience field carries it)
    description: Optional[str] = None
    duration_mins: int = 60
    price: float
    category: str = "general"          # hair, colour, spa, grooming, facial, tattoo, bridal
    audience: str = "unisex"           # "men" | "women" | "unisex"
    for_kids: bool = False

    class Settings:
        name = "services"
        indexes = ["category", "audience"]


class Stylist(Document):
    name: str
    speciality: Optional[str] = None
    bio: Optional[str] = None
    experience_years: int = 1
    categories: List[str] = Field(default_factory=list)  # service categories this stylist handles

    class Settings:
        name = "stylists"


class BookingSlot(Document):
    """One 1-hour slot inside a booking. Exists ONLY while the booking is active
    (pending / awaiting_reschedule / confirmed). Cancel, decline or reschedule
    deletes the rows — that deletion IS the 'freeing' of the slot. Two UNIQUE
    indexes make double-booking impossible at the DB level:
    - (stylist_id, date, time_slot): a stylist can't be in two chairs
    - (user_id, date, time_slot): a customer can't be in two chairs"""

    booking_id: PydanticObjectId
    user_id: PydanticObjectId
    service_id: PydanticObjectId
    stylist_id: PydanticObjectId
    sequence: int = 0                  # 0, 1, 2 ... order within the booking
    date: str                          # "YYYY-MM-DD"
    time_slot: str                     # "HH:MM"
    duration_mins: int = 60            # snapshotted from Service at booking time

    class Settings:
        name = "booking_slots"
        indexes = [
            "booking_id",
            "user_id",
            IndexModel(
                [("stylist_id", 1), ("date", 1), ("time_slot", 1)],
                unique=True,
                name="unique_stylist_slot",
            ),
            IndexModel(
                [("user_id", 1), ("date", 1), ("time_slot", 1)],
                unique=True,
                name="unique_customer_slot",
            ),
        ]


class Booking(Document):
    user_id: PydanticObjectId
    stylist_id: PydanticObjectId                # primary stylist (first service's)
    audience: str = "unisex"                    # "men" | "women" | "unisex" — from step 1
    services: List[PydanticObjectId] = Field(default_factory=list)  # ordered; slot count = len
    date: str = ""                              # start date "YYYY-MM-DD"
    time_slot: Optional[str] = None             # snapshot of the (first) slot time — survives
                                                # slot-row deletion so cancelled/declined
                                                # bookings still render in history views
    notes: Optional[str] = None
    status: BookingStatus = BookingStatus.pending

    # Admin reschedule proposal (awaiting_reschedule state)
    proposed_date: Optional[str] = None
    proposed_time_slot: Optional[str] = None
    proposed_at: Optional[datetime] = None

    history: List[dict] = Field(default_factory=list)
    # entries: {ts, actor: "customer"|"admin"|"system", action, from_status, to_status, payload}

    created_at: datetime = Field(default_factory=_now)
    updated_at: datetime = Field(default_factory=_now)

    class Settings:
        name = "bookings"
        indexes = ["user_id", "stylist_id", "date", "status", ("stylist_id", "date")]


class Notification(Document):
    """WhatsApp message log — admin clicks the deep link from the dashboard to send."""
    booking_id: PydanticObjectId
    user_id: PydanticObjectId
    phone: str = ""                     # E.164; "" = not deliverable (dashboard shows warning)
    kind: str                           # booking_pending | booking_confirmed | reschedule_proposed |
                                        # reschedule_confirmed | booking_declined | booking_cancelled
    rendered_text: str = ""
    deep_link: str = ""                 # https://wa.me/<phone>?text=<encoded>
    created_at: datetime = Field(default_factory=_now)
    sent_at: Optional[datetime] = None  # stamped when admin clicks send

    class Settings:
        name = "notifications"
        indexes = ["booking_id", "user_id"]
