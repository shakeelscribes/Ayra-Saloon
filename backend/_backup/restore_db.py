"""
Restore Ayra Saloon collections from the latest JSON dump in _backup/dump/.
⚠️  DESTRUCTIVE: replaces the content of each restored collection.

Run:  python _backup/restore_db.py            (uses latest dump via LATEST marker)
      python _backup/restore_db.py 20260825_183000   (specific stamp)
"""
import json
import os
import sys

from bson import ObjectId
from datetime import datetime
from dotenv import load_dotenv
from pymongo import MongoClient

BACKUP_DIR = os.path.join(os.path.dirname(__file__), "dump")
COLLECTIONS = ["users", "services", "stylists", "bookings", "booking_slots", "notifications"]


def decode(doc):
    if isinstance(doc, dict):
        if "$oid" in doc:
            return ObjectId(doc["$oid"])
        if "$date" in doc:
            return datetime.fromisoformat(doc["$date"])
        return {k: decode(v) for k, v in doc.items()}
    if isinstance(doc, list):
        return [decode(v) for v in doc]
    return doc


def main():
    stamp = sys.argv[1] if len(sys.argv) > 1 else None
    if not stamp:
        marker = os.path.join(BACKUP_DIR, "LATEST")
        if not os.path.exists(marker):
            print("No dumps found. Run export_db.py first.")
            sys.exit(1)
        stamp = open(marker).read().strip()

    load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))
    client = MongoClient(os.getenv("MONGODB_URL"), serverSelectionTimeoutMS=15000)
    client.admin.command("ping")
    db = client["ayra_saloon"]

    print(f"⚠️  This will REPLACE these collections with the {stamp} dump:")
    for name in COLLECTIONS:
        path = os.path.join(BACKUP_DIR, f"{name}_{stamp}.json")
        print(f"   {name}: {'FOUND' if os.path.exists(path) else 'missing (skipped)'}")
    answer = input("Type RESTORE to continue: ").strip()
    if answer != "RESTORE":
        print("Aborted.")
        sys.exit(0)

    for name in COLLECTIONS:
        path = os.path.join(BACKUP_DIR, f"{name}_{stamp}.json")
        if not os.path.exists(path):
            continue
        with open(path, encoding="utf-8") as f:
            docs = decode(json.load(f))
        db[name].delete_many({})
        if docs:
            db[name].insert_many(docs)
        print(f"{name}: restored {len(docs)} docs")

    print("Restore complete.")


if __name__ == "__main__":
    main()
