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
    kid_gender: Optional[str] = None   # "boy" | "girl" | None — only set on for_kids=True services
    popularity: int = 50               # 0–100, how commonly booked (drives default "Recommended" sort)
    bookable: bool = True              # False = enquiry-only (e.g. bridal — partner artists, not self-bookable)

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
    """One service inside a booking, with its REAL back-to-back start time.
    Exists ONLY while the booking is active (pending / awaiting_reschedule /
    confirmed). Cancel, decline or reschedule deletes the rows — that deletion
    IS the 'freeing' of the time. Services in a visit run back-to-back, so a
    row's interval is [time_slot, time_slot + duration_mins) — e.g. a 45-min
    haircut in a 10:00 visit starts at "10:00", the next service at "10:45".
    Overlap conflicts are checked as minute intervals in the routes; the UNIQUE
    indexes below remain as a same-start-minute safety net:
    - (stylist_id, date, time_slot): a stylist can't start two services at once
    - (user_id, date, time_slot): a customer can't start two services at once"""

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
    source: str = "online"                      # "online" | "walk_in" — who entered it

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
    # pending | manual_sent | auto_sent | failed — see services/whatsapp.py
    delivery_status: str = "pending"
    created_at: datetime = Field(default_factory=_now)
    sent_at: Optional[datetime] = None  # stamped when sent (manual click or auto)

    class Settings:
        name = "notifications"
        indexes = ["booking_id", "user_id"]
