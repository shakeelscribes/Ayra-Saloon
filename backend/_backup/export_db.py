"""
Export every Ayra Saloon collection to timestamped JSON files.
Run from anywhere:  python _backup/export_db.py
Output: _backup/dump/<collection>_<stamp>.json  (+ a LATEST marker)
"""
import json
import os
from datetime import datetime, timezone

from bson import ObjectId
from dotenv import load_dotenv
from pymongo import MongoClient

BACKUP_DIR = os.path.join(os.path.dirname(__file__), "dump")
COLLECTIONS = ["users", "services", "stylists", "bookings", "booking_slots", "notifications"]


def encode(doc):
    if isinstance(doc, ObjectId):
        return {"$oid": str(doc)}
    if isinstance(doc, dict):
        return {k: encode(v) for k, v in doc.items()}
    if isinstance(doc, list):
        return [encode(v) for v in doc]
    if isinstance(doc, datetime):
        return {"$date": doc.isoformat()}
    return doc


def main():
    load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))
    url = os.getenv("MONGODB_URL")
    if not url:
        print("MONGODB_URL missing — cannot export.")
        sys.exit(1)

    client = MongoClient(url, serverSelectionTimeoutMS=15000)
    client.admin.command("ping")  # fail fast if unreachable
    db = client["ayra_saloon"]

    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    os.makedirs(BACKUP_DIR, exist_ok=True)

    for name in COLLECTIONS:
        docs = [encode(d) for d in db[name].find({})]
        path = os.path.join(BACKUP_DIR, f"{name}_{stamp}.json")
        with open(path, "w", encoding="utf-8") as f:
            json.dump(docs, f, indent=2, ensure_ascii=False, default=str)
        print(f"{name}: {len(docs)} docs -> {os.path.basename(path)}")

    with open(os.path.join(BACKUP_DIR, "LATEST"), "w") as f:
        f.write(stamp)
    print(f"Backup complete. Stamp: {stamp}")


if __name__ == "__main__":
    main()
