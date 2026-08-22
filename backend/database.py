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
client = AsyncIOMotorClient(SAFE_DATABASE_URL)
# Extract db name from connection string (or use default)
db_name = DATABASE_URL.split("/")[-1].split("?")[0] or "ayra_saloon"
database = client[db_name]

async def init_db():
    import sys
    import models
    from pymongo.errors import ServerSelectionTimeoutError
    
    try:
        await init_beanie(
            database=database,
            document_models=[
                models.User,
                models.Service,
                models.Stylist,
                models.Booking,
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
