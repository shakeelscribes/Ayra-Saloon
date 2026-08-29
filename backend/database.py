import os
import urllib.parse
from motor.motor_asyncio import AsyncIOMotorClient
from beanie import init_beanie
from dotenv import load_dotenv

# Automatically load .env file so MONGODB_URL is always available
load_dotenv()

DATABASE_URL = os.getenv("MONGODB_URL", "mongodb://localhost:27017/ayra_saloon")

def get_safe_mongodb_url(url: str) -> str:
    if not url.startswith("mongodb://") and not url.startswith("mongodb+srv://"):
        return url
    try:
        prefix, rest = url.split("://", 1)
        if "@" in rest:
            parts = rest.rsplit("@", 1)
            creds, host = parts[0], parts[1]
            if ":" in creds:
                username, password = creds.split(":", 1)
                safe_username = urllib.parse.quote_plus(urllib.parse.unquote(username))
                safe_password = urllib.parse.quote_plus(urllib.parse.unquote(password))
                return f"{prefix}://{safe_username}:{safe_password}@{host}"
    except Exception:
        pass
    return url

SAFE_DATABASE_URL = get_safe_mongodb_url(DATABASE_URL)
# tz_aware=True: pymongo returns UTC-aware datetimes so pydantic serializes
# them WITH a timezone suffix. Without it the API emits naive UTC strings,
# which every client misinterprets as local time (notifications showed raw UTC).
client = AsyncIOMotorClient(SAFE_DATABASE_URL, tz_aware=True)
# Extract db name from connection string (or use default)
db_name = DATABASE_URL.split("/")[-1].split("?")[0] or "ayra_saloon"
database = client[db_name]

async def init_db():
    import sys
    import models
    from pymongo.errors import ServerSelectionTimeoutError

    # ── Pre-index maintenance: backfill user_id + resolve legacy duplicates ──
    # Must run BEFORE init_beanie creates the unique (user_id, date, time_slot)
    # index, otherwise pre-existing slot docs without user_id (or customer
    # double-bookings created before the constraint) would break index creation.
    try:
        col_slots = database.get_collection("booking_slots")
        col_bookings = database.get_collection("bookings")

        missing = await col_slots.count_documents({"user_id": {"$exists": False}})
        if missing:
            print(f"Backfilling user_id on {missing} slot row(s)...", flush=True)
            async for slot in col_slots.find({"user_id": {"$exists": False}}):
                b = await col_bookings.find_one({"_id": slot["booking_id"]})
                if b:
                    await col_slots.update_one({"_id": slot["_id"]}, {"$set": {"user_id": b["user_id"]}})

        # Legacy index name cleanup: same keys as the new unique_stylist_slot
        # index but a different name — MongoDB forbids that coexistence.
        try:
            await col_slots.drop_index("unique_active_slot")
            print("Dropped legacy index unique_active_slot", flush=True)
        except Exception:
            pass  # didn't exist — fine

        # Customer double-bookings that pre-date the unique constraint:
        # keep the earliest slot, drop the later ones (plus their bookings).
        pipeline = [
            {"$group": {"_id": {"u": "$user_id", "d": "$date", "t": "$time_slot"},
                        "ids": {"$push": "$_id"}, "n": {"$sum": 1}}},
            {"$match": {"n": {"$gt": 1}}},
        ]
        async for dup in col_slots.aggregate(pipeline):
            for sid in dup["ids"][1:]:
                slot = await col_slots.find_one({"_id": sid})
                if slot:
                    await col_slots.delete_one({"_id": sid})
                    await col_bookings.delete_one({"_id": slot["booking_id"]})
                    print("Removed pre-constraint duplicate booking.", flush=True)
    except Exception as e:
        print(f"Pre-index maintenance warning: {e}", flush=True)

    try:
        await init_beanie(
            database=database,
            document_models=[
                models.User,
                models.Service,
                models.Stylist,
                models.Booking,
                models.BookingSlot,
                models.Notification,
            ]
        )
    except ServerSelectionTimeoutError as e:
        print("\n" + "!" * 80)
        print(" DATABASE CONNECTION ERROR:")
        print(" Could not connect to your MongoDB Atlas cluster.")
        print(" Reason: SSL handshake failed (ServerSelectionTimeoutError).")
        print("\n HOW TO FIX THIS:")
        print(" 1. Go to MongoDB Atlas: https://cloud.mongodb.com")
        print(" 2. In the left sidebar, click 'Network Access' under Security.")
        print(" 3. Click 'Add IP Address'.")
        print(" 4. Click 'Allow Access from Anywhere' (0.0.0.0/0) or add your current IP.")
        print(" 5. Save changes and wait 1 minute for it to apply, then restart the server.")
        print("!" * 80 + "\n")
        sys.exit(1)
