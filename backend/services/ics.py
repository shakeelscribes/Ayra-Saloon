"""iCalendar (.ics) builder for Ayra Unisex Salon booking invites.

Generates RFC 5545 payloads for the three lifecycle moments:
  REQUEST, SEQUENCE 0   — booking confirmed → "add this to your calendar"
  REQUEST, SEQUENCE n   — reschedule accepted → same UID + higher SEQUENCE
                          makes the customer's calendar MOVE the event
  CANCEL                — booking cancelled → same UID makes it DELETE the event

Times: bookings are stored in IST ("YYYY-MM-DD" + "HH:MM"); ICS demands UTC
("YYYYMMDDTHHMMSSZ"). India has no DST, so a fixed +05:30 offset is exact.
"""
from datetime import datetime, timedelta, timezone

IST = timezone(timedelta(hours=5, minutes=30))

# Edit these two when the salon's address is finalised — they flow into every
# invite's LOCATION line and the email footer.
SALON_ADDRESS = "Ayra Unisex Salon"
SALON_PHONE = "+91 82706 06750"

UID_DOMAIN = "ayrasaloon.com"


def calendar_uid(booking_id) -> str:
    """Stable per-booking event ID. The SAME UID across confirm / reschedule /
    cancel is what lets the customer's calendar keep ONE event in sync."""
    return f"ayra-booking-{booking_id}@{UID_DOMAIN}"


def _ics_dt(date: str, time_slot: str) -> str:
    """'2026-09-04', '10:00' (IST) → '20260904T043000Z' (UTC)."""
    start = datetime.strptime(f"{date} {time_slot}", "%Y-%m-%d %H:%M").replace(tzinfo=IST)
    return start.astimezone(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def _escape(text: str) -> str:
    """RFC 5545 TEXT escaping: backslash, semicolon, comma, newlines."""
    return (text.replace("\\", "\\\\").replace(";", "\\;")
                .replace(",", "\\,").replace("\n", "\\n"))


def _fold(line: str) -> str:
    """Fold content lines longer than 75 octets (RFC 5545 §3.1) — continuation
    lines begin with a single space (which counts toward the 75)."""
    if len(line.encode("utf-8")) <= 75:
        return line
    parts, chunk, chunk_len, limit = [], [], 0, 75
    for ch in line:
        ch_len = len(ch.encode("utf-8"))
        if chunk_len + ch_len > limit:
            parts.append("".join(chunk))
            chunk, chunk_len, limit = [ch], ch_len, 74
        else:
            chunk.append(ch)
            chunk_len += ch_len
    parts.append("".join(chunk))
    return "\r\n ".join(parts)


def build_ics(*, uid: str, sequence: int, method: str, date: str, time_slot: str,
              duration_mins: int, services: list, stylist, customer_name: str = "") -> str:
    """Build the VCALENDAR string.

    method    — "REQUEST" (confirm / reschedule) or "CANCEL"
    services  — list of Service docs (missing docs are skipped, 60 min default)
    stylist   — Stylist doc or None
    """
    now_utc = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    dt_start = _ics_dt(date, time_slot)
    end = (datetime.strptime(f"{date} {time_slot}", "%Y-%m-%d %H:%M")
           .replace(tzinfo=IST) + timedelta(minutes=duration_mins or 60))
    dt_end = end.astimezone(timezone.utc).strftime("%Y%m%dT%H%M%SZ")

    service_names = " + ".join(s.name for s in services if s) or "Appointment"
    stylist_name = stylist.name if stylist else "our team"
    summary = f"Ayra Unisex Salon — {service_names} with {stylist_name}"

    desc = [f"Hi {customer_name}! Your appointment at Ayra Unisex Salon." if customer_name
            else "Your appointment at Ayra Unisex Salon.", "", "Services:"]
    for s in services:
        if s:
            desc.append(f"  - {s.name} ({s.duration_mins or 60} min)")
    desc += [f"Stylist: {stylist_name}", "", f"Questions? Call us at {SALON_PHONE}."]

    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Ayra Unisex Salon//Booking//EN",
        "CALSCALE:GREGORIAN",
        f"METHOD:{method}",
        "BEGIN:VEVENT",
        f"UID:{uid}",
        f"SEQUENCE:{sequence}",
        f"DTSTAMP:{now_utc}",
        f"DTSTART:{dt_start}",
        f"DTEND:{dt_end}",
        f"SUMMARY:{_escape(summary)}",
        f"DESCRIPTION:{_escape(chr(10).join(desc))}",
        f"LOCATION:{_escape(SALON_ADDRESS)}",
        "STATUS:" + ("CANCELLED" if method == "CANCEL" else "CONFIRMED"),
    ]
    if method != "CANCEL":
        lines += [
            "BEGIN:VALARM",
            "TRIGGER:-PT1H",
            "ACTION:DISPLAY",
            "DESCRIPTION:Ayra Unisex Salon appointment in 1 hour",
            "END:VALARM",
        ]
    lines += ["END:VEVENT", "END:VCALENDAR"]
    return "\r\n".join(_fold(line) for line in lines) + "\r\n"
