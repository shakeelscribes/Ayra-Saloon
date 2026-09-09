from fastapi import APIRouter, Depends
import models, schemas
from auth import get_current_admin, get_current_user


router = APIRouter(prefix="/users", tags=["Users"])


def normalize_phone(raw: str) -> str:
    """Light normalization: keep digits/+; bare 10-digit Indian numbers get +91."""
    digits = "".join(ch for ch in raw if ch.isdigit() or ch == "+")
    core = digits.lstrip("+")
    if len(core) == 10 and core.startswith(("6", "7", "8", "9")):
        return "+91" + core
    if core.startswith("91") and len(core) == 12:
        return "+" + core
    return ("+" + core) if digits.startswith("+") else ("+" + core if core else "")


@router.get("/lookup", response_model=schemas.CustomerLookupOut)
async def lookup_customer(phone: str, _admin: models.User = Depends(get_current_admin)):
    """Find a customer by phone for the walk-in form's autofill. Read-only —
    the form fills from the snapshot; the account itself is never touched
    (matching admin_create_booking's rule for matched customers).

    Matching mirrors admin_create_booking exactly: digits only, then the
    trailing 10 — stored formats vary ("98765 43210", "+91…"). Staff accounts
    (is_admin) are never surfaced, so a stylist's own number can't pre-fill
    the customer card."""
    import re
    digits = "".join(ch for ch in (phone or "") if ch.isdigit())
    if len(digits) < 10:
        return schemas.CustomerLookupOut(found=False)
    tail = digits[-10:]
    user = await models.User.find_one({
        "phone": {"$regex": re.escape(tail) + "$"},
        "is_admin": {"$ne": True},
    })
    if not user:
        return schemas.CustomerLookupOut(found=False)
    return schemas.CustomerLookupOut(
        found=True, id=user.id, name=user.name, email=user.email, phone=user.phone,
    )


@router.put("/me", response_model=schemas.UserOut)
async def update_me(
    update: schemas.UserUpdate,
    current_user: models.User = Depends(get_current_user),
):
    if update.name is not None and update.name.strip():
        current_user.name = update.name.strip()
    if update.phone is not None:
        current_user.phone = normalize_phone(update.phone) or None
    # Always run the gender assignment so the frontend can CLEAR the field by
    # sending null (e.g. "Prefer not to say"). Without this, sending null is
    # indistinguishable from "not provided" and the previous value sticks.
    current_user.gender = update.gender if update.gender in ("men", "women") else None
    await current_user.save()
    return current_user
