"""WhatsApp delivery abstraction.

Today (manual mode): the backend renders the message text and a wa.me deep
link; the admin clicks it from the staff panel and sends from the salon's
WhatsApp. `send()` reports "pending" — a human completes the delivery.

Later (auto mode): swap `send()` for the WhatsApp Business Cloud API (or a
BSP such as Wati/Interakt) and messages leave automatically from the Ayra
Salon business number. Only this file changes — routes, models and both
admin clients stay untouched.

delivery_status values stored on Notification:
  pending      — waiting to be sent (manual mode default)
  manual_sent  — admin clicked the deep link and confirmed sending
  auto_sent    — provider accepted the message (future)
  failed       — provider rejected it (future)
"""
from urllib.parse import quote


def normalize_digits(phone: str) -> str:
    """Strip everything but digits — stored phones may be '98765 43210' or '+91…'."""
    return "".join(ch for ch in (phone or "") if ch.isdigit())


def build_deep_link(phone: str, text: str) -> str:
    """wa.me deep link for manual sending. quote() — service names like
    'Hair Wash & Blowout' contain characters that would break the query
    string if only spaces were encoded."""
    digits = normalize_digits(phone)
    if not digits:
        return ""
    return f"https://wa.me/{digits}?text={quote(text)}"


async def send(phone: str, text: str) -> dict:
    """Attempt delivery. Manual mode never sends — it hands back the deep
    link and reports pending so the staff panel shows the click-to-send row.

    Returns: {"status": "pending" | "auto_sent" | "failed", "error": str?}
    """
    deep_link = build_deep_link(phone, text)
    if not deep_link:
        return {"status": "failed", "error": "no phone number on file"}
    return {"status": "pending", "deep_link": deep_link}
