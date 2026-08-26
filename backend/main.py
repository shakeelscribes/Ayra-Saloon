from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from database import init_db
import models

# ── Lifespan event for DB connection and seeding ──────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    await seed_data()
    yield

app = FastAPI(
    title="Ayra Saloon API",
    description="Backend for Ayra Saloon booking system",
    version="1.0.0",
    lifespan=lifespan,
)

# ── CORS ──────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ───────────────────────────────────────────────────────────────────
from routes.auth import router as auth_router
from routes.services import router as services_router
from routes.stylists import router as stylists_router
from routes.availability import router as availability_router
from routes.bookings import router as bookings_router

app.include_router(auth_router)
app.include_router(services_router)
app.include_router(stylists_router)
app.include_router(availability_router)
app.include_router(bookings_router)

# ── Seed database with initial data ───────────────────────────────────────────
from auth import get_password_hash

# ── Canonical catalog — single source of truth for seeding ───────────────────
# Transcribed from the salon's official price sheet ("Ayra Salon.xlsx").
# Durations marked flat-60 are estimates where the sheet had no time —
# correct specific ones here and restart the backend once to propagate.
SERVICE_CATALOG = [
    {"name": "Ear Piercing", "description": "Custom ink under clinical hygiene standards", "duration_mins": 60, "price": 300, "category": "tattoo", "audience": "unisex", "for_kids": False},
    {"name": "Nose Piercing", "description": "Custom ink under clinical hygiene standards", "duration_mins": 60, "price": 300, "category": "tattoo", "audience": "unisex", "for_kids": False},
    {"name": "Wart Removal", "description": "Skin care that leaves you glowing", "duration_mins": 60, "price": 500, "category": "facial", "audience": "unisex", "for_kids": False},
    {"name": "Name Tattoo (per inch)", "description": "Custom ink under clinical hygiene standards", "duration_mins": 60, "price": 500, "category": "tattoo", "audience": "unisex", "for_kids": False},
    {"name": "Portrait Tattoo 3D", "description": "Custom ink under clinical hygiene standards", "duration_mins": 60, "price": 3000, "category": "tattoo", "audience": "unisex", "for_kids": False},
    {"name": "Hair Wash & Blowout", "description": "Professional cutting and styling, tailored to you", "duration_mins": 60, "price": 350, "category": "hair", "audience": "men", "for_kids": False},
    {"name": "Hair Wash & Blowout", "description": "Professional cutting and styling, tailored to you", "duration_mins": 60, "price": 500, "category": "hair", "audience": "women", "for_kids": False},
    {"name": "Hair Cut", "description": "Professional cutting and styling, tailored to you", "duration_mins": 45, "price": 250, "category": "hair", "audience": "men", "for_kids": False},
    {"name": "Shave", "description": "Sharp, clean work at an honest price", "duration_mins": 15, "price": 100, "category": "grooming", "audience": "men", "for_kids": False},
    {"name": "Royal Shave", "description": "Sharp, clean work at an honest price", "duration_mins": 20, "price": 200, "category": "grooming", "audience": "men", "for_kids": False},
    {"name": "Beard Trimming", "description": "Sharp, clean work at an honest price", "duration_mins": 20, "price": 150, "category": "grooming", "audience": "men", "for_kids": False},
    {"name": "Beard Styling", "description": "Sharp, clean work at an honest price", "duration_mins": 30, "price": 200, "category": "grooming", "audience": "men", "for_kids": False},
    {"name": "Kids Hair Cut", "description": "Professional cutting and styling, tailored to you", "duration_mins": 30, "price": 200, "category": "hair", "audience": "men", "for_kids": True},
    {"name": "Tonsure (Head Shave)", "description": "Professional cutting and styling, tailored to you", "duration_mins": 30, "price": 300, "category": "hair", "audience": "men", "for_kids": False},
    {"name": "Head Massage (Steam)", "description": "Sharp, clean work at an honest price", "duration_mins": 20, "price": 400, "category": "grooming", "audience": "men", "for_kids": False},
    {"name": "Basic U-Cut & Straight", "description": "Professional cutting and styling, tailored to you", "duration_mins": 45, "price": 500, "category": "hair", "audience": "women", "for_kids": False},
    {"name": "Layer Cut", "description": "Professional cutting and styling, tailored to you", "duration_mins": 45, "price": 700, "category": "hair", "audience": "women", "for_kids": False},
    {"name": "Creative Layer Cut", "description": "Professional cutting and styling, tailored to you", "duration_mins": 45, "price": 800, "category": "hair", "audience": "women", "for_kids": False},
    {"name": "Head Massage (Steam)", "description": "Sharp, clean work at an honest price", "duration_mins": 30, "price": 600, "category": "grooming", "audience": "women", "for_kids": False},
    {"name": "Kids Hair Cut", "description": "Professional cutting and styling, tailored to you", "duration_mins": 40, "price": 500, "category": "hair", "audience": "women", "for_kids": True},
    {"name": "Global Hair Color (Ammonia Free)", "description": "Salon-grade colour, applied with care", "duration_mins": 60, "price": 1000, "category": "colour", "audience": "men", "for_kids": False},
    {"name": "Gel Hair Color", "description": "Salon-grade colour, applied with care", "duration_mins": 60, "price": 600, "category": "colour", "audience": "men", "for_kids": False},
    {"name": "Fashion Hair Color", "description": "Salon-grade colour, applied with care", "duration_mins": 60, "price": 2000, "category": "colour", "audience": "men", "for_kids": False},
    {"name": "One Streak Hair Color", "description": "Salon-grade colour, applied with care", "duration_mins": 60, "price": 150, "category": "colour", "audience": "men", "for_kids": False},
    {"name": "Root Touchup", "description": "Salon-grade colour, applied with care", "duration_mins": 60, "price": 1500, "category": "colour", "audience": "women", "for_kids": False},
    {"name": "Full Hair Color", "description": "Salon-grade colour, applied with care", "duration_mins": 60, "price": 2500, "category": "colour", "audience": "women", "for_kids": False},
    {"name": "Fashion Hair Color", "description": "Salon-grade colour, applied with care", "duration_mins": 60, "price": 3500, "category": "colour", "audience": "women", "for_kids": False},
    {"name": "One Streak Hair Color", "description": "Salon-grade colour, applied with care", "duration_mins": 60, "price": 250, "category": "colour", "audience": "women", "for_kids": False},
    {"name": "Golden Glow Facial", "description": "Skin care that leaves you glowing", "duration_mins": 45, "price": 1500, "category": "facial", "audience": "unisex", "for_kids": False},
    {"name": "Basic Fairness Facial", "description": "Skin care that leaves you glowing", "duration_mins": 45, "price": 2000, "category": "facial", "audience": "unisex", "for_kids": False},
    {"name": "Booster Fairness Facial", "description": "Skin care that leaves you glowing", "duration_mins": 45, "price": 2500, "category": "facial", "audience": "unisex", "for_kids": False},
    {"name": "Clean Up", "description": "Skin care that leaves you glowing", "duration_mins": 30, "price": 1000, "category": "facial", "audience": "unisex", "for_kids": False},
    {"name": "Basic Tan Removal Treatment", "description": "Skin care that leaves you glowing", "duration_mins": 45, "price": 3000, "category": "facial", "audience": "unisex", "for_kids": False},
    {"name": "Booster Tan Removal Treatment", "description": "Skin care that leaves you glowing", "duration_mins": 45, "price": 3500, "category": "facial", "audience": "unisex", "for_kids": False},
    {"name": "Hydro Facial", "description": "Skin care that leaves you glowing", "duration_mins": 60, "price": 4500, "category": "facial", "audience": "unisex", "for_kids": False},
    {"name": "Bridal Facial", "description": "Skin care that leaves you glowing", "duration_mins": 60, "price": 5000, "category": "facial", "audience": "unisex", "for_kids": False},
    {"name": "Hair Set", "description": "Look your best on the biggest days", "duration_mins": 60, "price": 2500, "category": "bridal", "audience": "unisex", "for_kids": False},
    {"name": "Party Makeup", "description": "Look your best on the biggest days", "duration_mins": 60, "price": 5000, "category": "bridal", "audience": "unisex", "for_kids": False},
    {"name": "HD Makeup", "description": "Look your best on the biggest days", "duration_mins": 60, "price": 6000, "category": "bridal", "audience": "unisex", "for_kids": False},
    {"name": "Hair Brush Makeup", "description": "Look your best on the biggest days", "duration_mins": 60, "price": 9000, "category": "bridal", "audience": "unisex", "for_kids": False},
    {"name": "Neck & Shoulder Massage", "description": "Sharp, clean work at an honest price", "duration_mins": 30, "price": 600, "category": "grooming", "audience": "unisex", "for_kids": False},
    {"name": "Neck & Back Massage", "description": "Sharp, clean work at an honest price", "duration_mins": 30, "price": 1000, "category": "grooming", "audience": "unisex", "for_kids": False},
    {"name": "Hand Massage", "description": "Sharp, clean work at an honest price", "duration_mins": 30, "price": 600, "category": "grooming", "audience": "unisex", "for_kids": False},
    {"name": "Leg Massage", "description": "Sharp, clean work at an honest price", "duration_mins": 30, "price": 700, "category": "grooming", "audience": "unisex", "for_kids": False},
    {"name": "Feet Massage", "description": "Sharp, clean work at an honest price", "duration_mins": 30, "price": 800, "category": "grooming", "audience": "unisex", "for_kids": False},
    {"name": "Repairing Hair Spa", "description": "Deep-care ritual for healthier hair", "duration_mins": 35, "price": 500, "category": "spa", "audience": "men", "for_kids": False},
    {"name": "Hair Color Recovery Spa", "description": "Deep-care ritual for healthier hair", "duration_mins": 35, "price": 500, "category": "spa", "audience": "men", "for_kids": False},
    {"name": "Hair Smoothening Spa", "description": "Deep-care ritual for healthier hair", "duration_mins": 35, "price": 500, "category": "spa", "audience": "men", "for_kids": False},
    {"name": "Keratin Hair Spa", "description": "Deep-care ritual for healthier hair", "duration_mins": 40, "price": 600, "category": "spa", "audience": "men", "for_kids": False},
    {"name": "Repairing Hair Spa", "description": "Deep-care ritual for healthier hair", "duration_mins": 35, "price": 1000, "category": "spa", "audience": "women", "for_kids": False},
    {"name": "Hair Color Recovery Spa", "description": "Deep-care ritual for healthier hair", "duration_mins": 35, "price": 1000, "category": "spa", "audience": "women", "for_kids": False},
    {"name": "Hair Smoothening Spa", "description": "Deep-care ritual for healthier hair", "duration_mins": 35, "price": 1000, "category": "spa", "audience": "women", "for_kids": False},
    {"name": "Keratin Hair Spa", "description": "Deep-care ritual for healthier hair", "duration_mins": 40, "price": 1200, "category": "spa", "audience": "women", "for_kids": False},
    {"name": "Anti Dandruff Treatment", "description": "Deep-care ritual for healthier hair", "duration_mins": 30, "price": 1000, "category": "spa", "audience": "men", "for_kids": False},
    {"name": "Anti Hairfall Treatment", "description": "Deep-care ritual for healthier hair", "duration_mins": 30, "price": 1000, "category": "spa", "audience": "men", "for_kids": False},
    {"name": "Hair Smoothening Treatment", "description": "Deep-care ritual for healthier hair", "duration_mins": 60, "price": 2500, "category": "spa", "audience": "men", "for_kids": False},
    {"name": "Botox Hair Treatment", "description": "Deep-care ritual for healthier hair", "duration_mins": 60, "price": 2500, "category": "spa", "audience": "men", "for_kids": False},
    {"name": "Keratin Hair Treatment", "description": "Deep-care ritual for healthier hair", "duration_mins": 60, "price": 3000, "category": "spa", "audience": "men", "for_kids": False},
    {"name": "Nano Plastia Hair Treatment", "description": "Deep-care ritual for healthier hair", "duration_mins": 60, "price": 3000, "category": "spa", "audience": "men", "for_kids": False},
    {"name": "Perming Curly Hair Treatment", "description": "Deep-care ritual for healthier hair", "duration_mins": 60, "price": 4000, "category": "spa", "audience": "men", "for_kids": False},
    {"name": "Anti Dandruff Treatment", "description": "Deep-care ritual for healthier hair", "duration_mins": 30, "price": 2000, "category": "spa", "audience": "women", "for_kids": False},
    {"name": "Anti Hairfall Treatment", "description": "Deep-care ritual for healthier hair", "duration_mins": 30, "price": 2000, "category": "spa", "audience": "women", "for_kids": False},
    {"name": "Hair Smoothening Treatment", "description": "Deep-care ritual for healthier hair", "duration_mins": 60, "price": 4500, "category": "spa", "audience": "women", "for_kids": False},
    {"name": "Botox Hair Treatment", "description": "Deep-care ritual for healthier hair", "duration_mins": 60, "price": 5500, "category": "spa", "audience": "women", "for_kids": False},
    {"name": "Keratin Hair Treatment", "description": "Deep-care ritual for healthier hair", "duration_mins": 60, "price": 6000, "category": "spa", "audience": "women", "for_kids": False},
    {"name": "Nano Plastia Hair Treatment", "description": "Deep-care ritual for healthier hair", "duration_mins": 60, "price": 6500, "category": "spa", "audience": "women", "for_kids": False},
    {"name": "Perming Curly Hair Treatment", "description": "Deep-care ritual for healthier hair", "duration_mins": 60, "price": 7000, "category": "spa", "audience": "women", "for_kids": False},
]

STYLIST_TEAM = [
    {"name": "Raja", "speciality": "Hair Stylist", "bio": "Precision fades, classic cuts and honest advice — eight years of making every chair time count.", "experience_years": 8, "categories": ["hair", "colour", "spa", "grooming"]},
    {"name": "Ajay", "speciality": "Hair Stylist & Tattoo Artist", "bio": "Cuts and beard work by day, custom ink by appointment — six years of clean lines across both crafts.", "experience_years": 6, "categories": ["hair", "colour", "spa", "grooming", "tattoo"]},
]

# Old names whose presence means the collection predates a catalog refresh.
# ("Royal Shave" is NOT here — it's a legitimate item on the salon's real menu.)
_LEGACY_SERVICE_MARKERS = ("Bridal Elegance Package", "The Royal Groom Experience", "Minimalist Tattoos")
_LEGACY_STYLIST_NAMES = ("Priya Sharma", "Arjun Mehta", "Neha Kapoor")


def _strip_audience(name: str):
    """Strip gender/kids suffixes (both sheet styles) and infer audience.
    Returns (clean_name, audience, for_kids)."""
    for pat, aud, kids in [
        (" — Boys", "men", True),
        (" — Girls", "women", True),
        ("(Boys)", "men", True),
        ("(Girls)", "women", True),
        (" — Men", "men", False),
        (" — Women", "women", False),
        ("(Men)", "men", False),
        ("(Women)", "women", False),
    ]:
        if pat in name:
            return name.replace(pat, "").strip(), aud, kids
    # Heuristic for unsuffixed services that are inherently men's
    if any(k in name.lower() for k in ("beard", "shave", "tonsure")):
        return name.strip(), "men", False
    return name.strip(), "unisex", False


async def seed_data():
    try:
        services = await models.Service.find_all().to_list()
        service_names = {s.name for s in services}
        if not services or any(marker in service_names for marker in _LEGACY_SERVICE_MARKERS):
            await models.Service.find_all().delete()
            await models.Service.insert_many([models.Service(**item) for item in SERVICE_CATALOG])
            services = await models.Service.find_all().to_list()

        # Catalog sync: delete docs that don't match the canonical catalog
        # (name + audience pair), then insert any canonical entry that's missing.
        # Handles additions AND cleanup without wiping customer-linked data.
        valid_keys = {
            (item["name"], item.get("audience", "unisex")) for item in SERVICE_CATALOG
        }
        stale = [
            s for s in services
            if (s.name, getattr(s, "audience", "unisex")) not in valid_keys
        ]
        if stale:
            for s in stale:
                await s.delete()
            print(f"Removed {len(stale)} stale service doc(s).", flush=True)

        existing_keys = {
            (s.name, getattr(s, "audience", "unisex")) for s in services if s not in stale
        }
        missing_items = [
            item for item in SERVICE_CATALOG
            if (item["name"], item.get("audience", "unisex")) not in existing_keys
        ]
        if missing_items:
            await models.Service.insert_many([models.Service(**item) for item in missing_items])
            print(f"Inserted {len(missing_items)} catalog service(s).", flush=True)

        # ── Audience migration v2 — in-place, idempotent ─────────────────────
        # Strips " — Men"/"(Women)"-style suffixes, sets audience + for_kids.
        # NOTE: detect via RAW collection — Pydantic fills the default on load,
        # so model attributes can't tell us whether the field exists in Mongo.
        raw_services = models.Service.get_motor_collection()
        missing_audience = await raw_services.count_documents({"audience": {"$exists": False}})
        if missing_audience > 0:
            print(f"Audience migration: updating {missing_audience} services...", flush=True)
            for s in services:
                clean, aud, kids = _strip_audience(s.name)
                s.name = clean
                s.audience = aud
                s.for_kids = kids
                await s.save()
            services = await models.Service.find_all().to_list()
            print("Audience migration complete.", flush=True)

        stylists = await models.Stylist.find_all().to_list()
        stylist_names = {s.name for s in stylists}
        # Reseed when empty, when legacy names linger, or when the categories
        # field is missing (pre-dates role-based booking).
        needs_stylist_reseed = (
            not stylists
            or any(name in stylist_names for name in _LEGACY_STYLIST_NAMES)
            or any(not getattr(s, "categories", None) for s in stylists)
        )
        if needs_stylist_reseed:
            await models.Stylist.find_all().delete()
            await models.Stylist.insert_many([models.Stylist(**item) for item in STYLIST_TEAM])

        # ── Bookings: wipe legacy single-slot docs (approved; backup exists) ─
        # Old shape carried service_id/time_slot directly on the booking.
        legacy_bookings = await models.Booking.find(
            {"service_id": {"$ne": None}}
        ).to_list()
        if legacy_bookings:
            await models.Booking.find_all().delete()
            await models.BookingSlot.find_all().delete()
            print(f"Migrated: wiped {len(legacy_bookings)} legacy booking docs (backup 20260825_174120).", flush=True)

        # ── time_slot snapshot backfill — for bookings predating the field ──
        missing_ts = await models.Booking.find({"time_slot": {"$exists": False}}).to_list()
        for b in missing_ts:
            slot = await models.BookingSlot.find_one(models.BookingSlot.booking_id == b.id)
            b.time_slot = slot.time_slot if slot else None
            await b.save()
        if missing_ts:
            print(f"Backfilled time_slot snapshot on {len(missing_ts)} booking(s).", flush=True)

        # Seed admin user
        if await models.User.find(models.User.is_admin == True).count() == 0:
            admin = models.User(
                name="Admin",                email="admin@ayrasaloon.com",
                hashed_password=get_password_hash("admin123"),
                is_admin=True,
            )
            await admin.insert()
    except Exception as e:
        print(f"Error seeding data: {e}", flush=True)

@app.get("/")
def root():
    return {"message": "Welcome to Ayra Saloon API", "docs": "/docs"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
