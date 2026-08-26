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
    # ── Haircuts & Styling ──
    {"name": "Hair Cut — Men", "description": "Precision cut finished with a style that suits you", "duration_mins": 45, "price": 250, "category": "hair"},
    {"name": "Kids Hair Cut — Boys", "description": "Patient, kid-friendly cuts for little gentlemen", "duration_mins": 30, "price": 200, "category": "hair"},
    {"name": "Kids Hair Cut — Girls", "description": "Gentle trims and styles for young girls", "duration_mins": 40, "price": 500, "category": "hair"},
    {"name": "Tonsure (Head Shave)", "description": "Clean traditional head shave", "duration_mins": 30, "price": 300, "category": "hair"},
    {"name": "Head Massage (Steam) — Men", "description": "Steam-assisted relaxation massage for scalp and neck", "duration_mins": 20, "price": 400, "category": "hair"},
    {"name": "Head Massage (Steam) — Women", "description": "Steam-assisted relaxation massage for scalp and neck", "duration_mins": 30, "price": 600, "category": "hair"},
    {"name": "Basic U-Cut & Straight — Women", "description": "Classic U-cut with straight finishing", "duration_mins": 45, "price": 500, "category": "hair"},
    {"name": "Layer Cut — Women", "description": "Soft layers shaped to your length and face", "duration_mins": 45, "price": 700, "category": "hair"},
    {"name": "Creative Layer Cut — Women", "description": "Dimensional layering for a fuller, styled look", "duration_mins": 45, "price": 800, "category": "hair"},
    # ── Hair Colour ──
    {"name": "Global Hair Color — Ammonia Free (Men)", "description": "Full-head ammonia-free colour", "duration_mins": 60, "price": 1000, "category": "colour"},
    {"name": "Gel Hair Color (Men)", "description": "Quick gel-based colour coverage", "duration_mins": 60, "price": 600, "category": "colour"},
    {"name": "Fashion Hair Color (Men)", "description": "Statement shades applied by our colourists", "duration_mins": 60, "price": 2000, "category": "colour"},
    {"name": "One Streak Highlights (Men)", "description": "Single-streak highlight accent", "duration_mins": 60, "price": 150, "category": "colour"},
    {"name": "Root Touch-Up (Women)", "description": "Fresh colour at the roots to match your base", "duration_mins": 60, "price": 1500, "category": "colour"},
    {"name": "Full Hair Color (Women)", "description": "Complete colour application with care finish", "duration_mins": 60, "price": 2500, "category": "colour"},
    {"name": "Fashion Hair Color (Women)", "description": "Creative shades tailored to your tone", "duration_mins": 60, "price": 3500, "category": "colour"},
    {"name": "One Streak Highlights (Women)", "description": "Single-streak highlight accent", "duration_mins": 60, "price": 250, "category": "colour"},
    # ── Hair Spa & Treatments ──
    {"name": "Repairing Hair Spa (Men)", "description": "Deep repair therapy for stressed hair", "duration_mins": 35, "price": 500, "category": "spa"},
    {"name": "Colour Recovery Spa (Men)", "description": "Post-colour nourishment and shine recovery", "duration_mins": 35, "price": 500, "category": "spa"},
    {"name": "Smoothening Hair Spa (Men)", "description": "Smoothing spa ritual for manageable hair", "duration_mins": 35, "price": 500, "category": "spa"},
    {"name": "Keratin Hair Spa (Men)", "description": "Keratin-infused spa for strength and gloss", "duration_mins": 40, "price": 600, "category": "spa"},
    {"name": "Repairing Hair Spa (Women)", "description": "Deep repair therapy for stressed hair", "duration_mins": 35, "price": 1000, "category": "spa"},
    {"name": "Colour Recovery Spa (Women)", "description": "Post-colour nourishment and shine recovery", "duration_mins": 35, "price": 1000, "category": "spa"},
    {"name": "Smoothening Hair Spa (Women)", "description": "Smoothing spa ritual for manageable hair", "duration_mins": 35, "price": 1000, "category": "spa"},
    {"name": "Keratin Hair Spa (Women)", "description": "Keratin-infused spa for strength and gloss", "duration_mins": 40, "price": 1200, "category": "spa"},
    {"name": "Anti-Dandruff Treatment (Men)", "description": "Targeted scalp treatment that clears flakes", "duration_mins": 30, "price": 1000, "category": "spa"},
    {"name": "Anti-Dandruff Treatment (Women)", "description": "Targeted scalp treatment that clears flakes", "duration_mins": 30, "price": 2000, "category": "spa"},
    {"name": "Anti-Hairfall Treatment (Men)", "description": "Strengthening treatment to reduce hair fall", "duration_mins": 30, "price": 1000, "category": "spa"},
    {"name": "Anti-Hairfall Treatment (Women)", "description": "Strengthening treatment to reduce hair fall", "duration_mins": 30, "price": 2000, "category": "spa"},
    {"name": "Hair Smoothening (Men)", "description": "Saloon smoothening for frizz-free hair", "duration_mins": 60, "price": 2500, "category": "spa"},
    {"name": "Hair Smoothening (Women)", "description": "Saloon smoothening for frizz-free hair", "duration_mins": 60, "price": 4500, "category": "spa"},
    {"name": "Botox Hair Treatment (Men)", "description": "Restorative botox therapy for dull, tired hair", "duration_mins": 60, "price": 2500, "category": "spa"},
    {"name": "Botox Hair Treatment (Women)", "description": "Restorative botox therapy for dull, tired hair", "duration_mins": 60, "price": 5500, "category": "spa"},
    {"name": "Keratin Hair Treatment (Men)", "description": "Long-lasting keratin smoothening treatment", "duration_mins": 60, "price": 3000, "category": "spa"},
    {"name": "Keratin Hair Treatment (Women)", "description": "Long-lasting keratin smoothening treatment", "duration_mins": 60, "price": 6000, "category": "spa"},
    {"name": "Nano Plastia Treatment (Men)", "description": "Advanced nano-plastia smoothing and repair", "duration_mins": 60, "price": 3000, "category": "spa"},
    {"name": "Nano Plastia Treatment (Women)", "description": "Advanced nano-plastia smoothing and repair", "duration_mins": 60, "price": 6500, "category": "spa"},
    {"name": "Perming Curly Hair (Men)", "description": "Professional perming for lasting curls", "duration_mins": 60, "price": 4000, "category": "spa"},
    {"name": "Perming Curly Hair (Women)", "description": "Professional perming for lasting curls", "duration_mins": 60, "price": 7000, "category": "spa"},
    # ── Shave · Beard · Massage ──
    {"name": "Royal Shave", "description": "Our signature premium shave experience", "duration_mins": 20, "price": 200, "category": "grooming"},
    {"name": "Shave", "description": "Clean, precise razor shave", "duration_mins": 15, "price": 100, "category": "grooming"},
    {"name": "Beard Trimming", "description": "Neat trim shaped to your face", "duration_mins": 20, "price": 150, "category": "grooming"},
    {"name": "Beard Styling", "description": "Full beard sculpt and styling session", "duration_mins": 30, "price": 200, "category": "grooming"},
    {"name": "Neck & Shoulder Massage", "description": "Tension-melting upper-body massage", "duration_mins": 30, "price": 600, "category": "grooming"},
    {"name": "Neck & Back Massage", "description": "Deep-relief massage for neck and back", "duration_mins": 30, "price": 1000, "category": "grooming"},
    {"name": "Hand Massage", "description": "Relaxing hand and palm massage", "duration_mins": 30, "price": 600, "category": "grooming"},
    {"name": "Leg Massage", "description": "Rejuvenating leg massage", "duration_mins": 30, "price": 700, "category": "grooming"},
    {"name": "Feet Massage", "description": "Soothing foot massage to finish your visit", "duration_mins": 30, "price": 800, "category": "grooming"},
    # ── Facials & Skin Care ──
    {"name": "Golden Glow Facial", "description": "Radiance-boosting golden facial", "duration_mins": 45, "price": 1500, "category": "facial"},
    {"name": "Basic Fairness Facial", "description": "Brightening facial for even skin tone", "duration_mins": 45, "price": 2000, "category": "facial"},
    {"name": "Booster Fairness Facial", "description": "Intensive brightening with booster serums", "duration_mins": 45, "price": 2500, "category": "facial"},
    {"name": "Clean-Up Facial", "description": "Quick deep-cleanse and freshen-up", "duration_mins": 30, "price": 1000, "category": "facial"},
    {"name": "Basic Tan Removal Treatment", "description": "Gentle de-tan treatment for clearer skin", "duration_mins": 45, "price": 3000, "category": "facial"},
    {"name": "Booster Tan Removal Treatment", "description": "Advanced de-tan with booster actives", "duration_mins": 45, "price": 3500, "category": "facial"},
    {"name": "Hydro Facial", "description": "Hydrating hydro-infused glow facial", "duration_mins": 60, "price": 4500, "category": "facial"},
    {"name": "Bridal Facial", "description": "Pre-wedding radiance facial package", "duration_mins": 60, "price": 5000, "category": "facial"},
    {"name": "Wart Removal", "description": "Safe, hygienic wart removal procedure", "duration_mins": 60, "price": 500, "category": "facial"},
    # ── Tattoos & Piercing ──
    {"name": "Name Tattoo (per inch)", "description": "Custom name lettering, priced per inch", "duration_mins": 60, "price": 500, "category": "tattoo"},
    {"name": "Portrait Tattoo 3D", "description": "Detailed 3D portrait work by our artist", "duration_mins": 60, "price": 3000, "category": "tattoo"},
    {"name": "Ear Piercing", "description": "Safe, sterile ear piercing", "duration_mins": 60, "price": 300, "category": "tattoo"},
    {"name": "Nose Piercing", "description": "Safe, sterile nose piercing", "duration_mins": 60, "price": 300, "category": "tattoo"},
    # ── Bridal & Party Makeup ──
    {"name": "Bridal Hair Set", "description": "Wedding-day hair setting and styling", "duration_mins": 60, "price": 2500, "category": "bridal"},
    {"name": "Party Makeup", "description": "Occasion-ready makeup look", "duration_mins": 60, "price": 5000, "category": "bridal"},
    {"name": "HD Makeup", "description": "High-definition makeup for photo-perfect finish", "duration_mins": 60, "price": 6000, "category": "bridal"},
    {"name": "Hair Brush Makeup", "description": "Full brush-applied professional makeup", "duration_mins": 60, "price": 9000, "category": "bridal"},
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
            print(f"Migrated: wiped {len(legacy_bookings)} legacy booking docs (backup 20260825_174120).")

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
