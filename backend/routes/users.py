from fastapi import APIRouter, Depends
import models, schemas
from auth import get_current_user


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


@router.put("/me", response_model=schemas.UserOut)
async def update_me(
    update: schemas.UserUpdate,
    current_user: models.User = Depends(get_current_user),
):
    if update.name is not None and update.name.strip():
        current_user.name = update.name.strip()
    if update.phone is not None:
        current_user.phone = normalize_phone(update.phone) or None
    if update.gender is not None:
        current_user.gender = update.gender if update.gender in ("men", "women") else None
    await current_user.save()
    return current_user
