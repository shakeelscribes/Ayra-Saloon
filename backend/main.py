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

async def seed_data():
    try:
        # Seed services
        if await models.Service.count() < 8:
            await models.Service.find_all().delete()
            services = [
                models.Service(name="Signature Fade & Cut", description="Precision fade and cut styled to perfection", duration_mins=45, price=599, category="hair"),
                models.Service(name="Classic Scissor Cut", description="Traditional scissor cut for a timeless look", duration_mins=30, price=399, category="hair"),
                models.Service(name="Royal Shave", description="Hot towel shave with premium grooming products", duration_mins=30, price=349, category="grooming"),
                models.Service(name="Bridal Elegance Package", description="Complete bridal hair & makeup experience", duration_mins=180, price=4999, category="bridal"),
                models.Service(name="The Royal Groom Experience", description="Premium grooming and styling for the groom", duration_mins=120, price=2999, category="grooming"),
                models.Service(name="Hair Color", description="Full color treatment with premium tints", duration_mins=120, price=1499, category="hair"),
                models.Service(name="Custom Ink Design", description="Bespoke tattoo design and application", duration_mins=120, price=2999, category="tattoo"),
                models.Service(name="Minimalist Tattoos", description="Fine-line and minimalist tattoo art", duration_mins=60, price=1499, category="tattoo"),
            ]
            await models.Service.insert_many(services)

        # Seed stylists
        if await models.Stylist.count() == 0:
            stylists = [
                models.Stylist(name="Priya Sharma", speciality="Bridal & Color", bio="10+ years in luxury bridal styling", experience_years=10),
                models.Stylist(name="Arjun Mehta", speciality="Haircut & Beard", bio="Expert in modern & classic cuts", experience_years=7),
                models.Stylist(name="Neha Kapoor", speciality="Hair Treatment", bio="Certified trichologist & color specialist", experience_years=8),
            ]
            await models.Stylist.insert_many(stylists)

        # Seed admin user
        if await models.User.find(models.User.is_admin == True).count() == 0:
            admin = models.User(
                name="Admin",
                email="admin@ayrasaloon.com",
                hashed_password=get_password_hash("admin123"),
                is_admin=True,
            )
            await admin.insert()
    except Exception as e:
        print(f"Error seeding data: {e}")

@app.get("/")
def root():
    return {"message": "Welcome to Ayra Saloon API", "docs": "/docs"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
