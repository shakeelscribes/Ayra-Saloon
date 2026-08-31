"""Email delivery abstraction (calendar invites + transactional mail).

Today (Resend): send_email() posts to Resend's REST API using RESEND_API_KEY
from .env. Without a key (or without a real recipient) it reports "skipped"
and nothing breaks — booking routes never depend on email succeeding.

Fallback (smtp): set EMAIL_PROVIDER=smtp plus SMTP_HOST/SMTP_PORT/SMTP_USER/
SMTP_PASS to relay through any SMTP server (the client's own mail host,
Gmail with an app password, ...) without touching any route.

Return contract (mirrors services/whatsapp.py — callers log, never crash):
  {"status": "auto_sent" | "skipped" | "failed", "id"?: str, "error"?: str}
"""
import base64
import os
from email.message import EmailMessage
from typing import Optional, Tuple

import httpx

_RESEND_ENDPOINT = "https://api.resend.com/emails"

# Brand palette (matches the web clients: emerald + gold on cream)
_GOLD = "#c9a84c"
_EMERALD_DARK = "#064e3b"
_CREAM = "#f6f4ee"


def _from_address() -> str:
    return os.getenv("EMAIL_FROM") or "Ayra Unisex Salon <onboarding@resend.dev>"


async def send_email(to: str, subject: str, html: str,
                     ics: Optional[str] = None,
                     ics_filename: str = "ayra-appointment.ics",
                     ics_method: str = "REQUEST") -> dict:
    """Send one email. Never raises — returns a status dict instead."""
    to = (to or "").strip()
    if not to or "@" not in to:
        return {"status": "skipped", "error": "no recipient email"}
    provider = (os.getenv("EMAIL_PROVIDER") or "resend").strip().lower()
    try:
        if provider == "smtp":
            return await _smtp_send(to, subject, html, ics, ics_filename, ics_method)
        return await _resend_send(to, subject, html, ics, ics_filename)
    except Exception as e:  # network hiccup, DNS, timeout — log and move on
        return {"status": "failed", "error": str(e)}


async def _resend_send(to: str, subject: str, html: str,
                       ics: Optional[str], ics_filename: str) -> dict:
    api_key = (os.getenv("RESEND_API_KEY") or "").strip()
    if not api_key:
        return {"status": "skipped", "error": "RESEND_API_KEY not set"}
    payload = {"from": _from_address(), "to": [to], "subject": subject, "html": html}
    if ics:
        payload["attachments"] = [{
            "filename": ics_filename,
            "content": base64.b64encode(ics.encode("utf-8")).decode("ascii"),
        }]
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(
            _RESEND_ENDPOINT,
            json=payload,
            headers={"Authorization": f"Bearer {api_key}"},
        )
    if resp.status_code in (200, 201):
        return {"status": "auto_sent", "id": (resp.json() or {}).get("id", "")}
    try:
        detail = (resp.json() or {}).get("message", "")
    except Exception:
        detail = resp.text[:200]
    return {"status": "failed", "error": f"Resend {resp.status_code}: {detail}"}


async def _smtp_send(to: str, subject: str, html: str, ics: Optional[str],
                     ics_filename: str, ics_method: str) -> dict:
    import asyncio
    import smtplib

    host = os.getenv("SMTP_HOST")
    if not host:
        return {"status": "skipped", "error": "SMTP_HOST not set"}
    port = int(os.getenv("SMTP_PORT", "587"))
    user = os.getenv("SMTP_USER") or None
    password = os.getenv("SMTP_PASS") or None
    use_ssl = (os.getenv("SMTP_SSL", "false").strip().lower() == "true")

    msg = EmailMessage()
    msg["From"] = _from_address()
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content("Please view this email in an HTML-capable mail client.")
    msg.add_alternative(html, subtype="html")
    if ics:
        # text/calendar + method param lets mail clients treat it as an iTIP invite
        msg.add_attachment(ics.encode("utf-8"), maintype="text",
                           subtype="calendar", filename=ics_filename,
                           params={"method": ics_method})

    def _send_blocking():
        if use_ssl:
            with smtplib.SMTP_SSL(host, port, timeout=15) as server:
                if user:
                    server.login(user, password)
                server.send_message(msg)
        else:
            with smtplib.SMTP(host, port, timeout=15) as server:
                server.starttls()
                if user:
                    server.login(user, password)
                server.send_message(msg)

    await asyncio.to_thread(_send_blocking)
    return {"status": "auto_sent"}


def booking_invite_email(*, kind: str, customer_name: str, service_names: str,
                         stylist_name: str, date: str, time_slot: str) -> Tuple[str, str]:
    """(subject, html) for the booking lifecycle emails.

    kind — "confirmed" | "rescheduled" | "cancelled" (drives copy + subject;
           the .ics METHOD is derived separately: cancelled → CANCEL, else REQUEST).
    Inline styles only — Gmail/Outlook strip <style> blocks.
    """
    if kind == "cancelled":
        subject = f"Cancelled: your Ayra Unisex Salon appointment on {date}"
        headline = "Appointment cancelled"
        note = ("This appointment has been cancelled. The calendar event will be "
                "removed automatically — no action needed.")
    elif kind == "rescheduled":
        subject = f"Moved: your Ayra Unisex Salon appointment is now {date} at {time_slot}"
        headline = "Appointment rescheduled"
        note = ("Your appointment has moved. The invite below updates the existing "
                "calendar event to the new time — no action needed.")
    else:
        subject = f"Confirmed: your Ayra Unisex Salon appointment on {date} at {time_slot}"
        headline = "Appointment confirmed"
        note = ("Your appointment is confirmed. Open the attached invite and tap "
                "“Add” to put it straight into your calendar.")

    rows = f"""
      <tr><td style="padding:6px 0;color:#6b7280;font-size:13px;">When</td>
          <td style="padding:6px 0;color:#111827;font-size:14px;font-weight:bold;">{date} at {time_slot}</td></tr>
      <tr><td style="padding:6px 0;color:#6b7280;font-size:13px;">Services</td>
          <td style="padding:6px 0;color:#111827;font-size:14px;font-weight:bold;">{service_names}</td></tr>
      <tr><td style="padding:6px 0;color:#6b7280;font-size:13px;">Stylist</td>
          <td style="padding:6px 0;color:#111827;font-size:14px;font-weight:bold;">{stylist_name}</td></tr>
    """
    html = f"""<!doctype html>
<html><body style="margin:0;padding:24px 12px;background:{_CREAM};font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e7e2d6;border-radius:12px;overflow:hidden;">
    <tr><td style="background:{_EMERALD_DARK};padding:22px 28px;">
      <span style="color:{_GOLD};font-size:20px;letter-spacing:3px;font-weight:bold;">AYRA</span>
      <span style="color:#ffffff;font-size:20px;letter-spacing:3px;font-weight:bold;"> SALON</span>
    </td></tr>
    <tr><td style="padding:28px;">
      <h1 style="margin:0 0 10px;font-size:20px;color:#111827;">{headline}</h1>
      <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#4b5563;">Hi {customer_name}, {note}</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:{_CREAM};border-radius:8px;padding:14px 18px;">
        {rows}
      </table>
      <p style="margin:22px 0 0;font-size:13px;line-height:1.6;color:#6b7280;">
        See you at Ayra Unisex Salon! Questions? Just reply to this email or call us.
      </p>
    </td></tr>
    <tr><td style="padding:16px 28px;background:{_CREAM};color:#9ca3af;font-size:12px;">
      Ayra Unisex Salon · This is an automated message about your booking.
    </td></tr>
  </table>
</body></html>"""
    return subject, html
