# Ayra Salon — Multi-Slot Booking System v2 (LOCKED)

> Status: **Approved plan.** All decisions below are locked with the owner.
> Delivery: staged PRs on `feature/shakeel`, each tested by the owner before merge.
> Safety: `safe-base` tag + `RETREAT.md` + DB backups (`backend/_backup/`).

## Summary

Multi-slot, state-machine booking system: gender-aware catalog, **multiple services
in one booking as consecutive 1-hour slots**, **per-service stylist assignment with
cascade slot suggestions**, admin approval on every booking (soft-hold), admin
reschedule proposals with customer accept/decline, WhatsApp deep-link notification
log. Single shop, single MongoDB, stateless FastAPI, Vite frontend.

## Locked decisions

| # | Decision | Choice |
|---|---|---|
| 1 | Admin approval | **Admin approves ALL** — every booking starts `pending` |
| 2 | Tattoos | **Combinable** with other services (no solo rule, no `is_exclusive`) |
| 3 | Exclusive routing | Via `Stylist.categories` only (tattoo → Ajay; Raja's list excludes it) |
| 4 | Beard/shave/tonsure audience | **men** (heuristic in migration) |
| 5 | Gender-suffixed names | Stripped; clean name + `audience` field + UI chips |
| 6 | Slot model | **Delete-on-free** — BookingSlot rows exist only while active; unique index `(stylist_id, date, time_slot)` |
| 7 | Dev bookings | **Wiped** on migration (backup `20260825_174120` exists) |
| 8 | Delivery | **Staged PRs**, each owner-tested before merge |
| 9 | Gender step | Chips (Men / Women / Kids) + "For someone else"; skipped when `user.gender` known |
| 10 | Multi-stylist visits | **Per-service stylists, sequential** (Model B): each service gets its own stylist + own slot; cascade suggests the next hour; back-navigation to fix earlier picks |
| 11 | Contiguity | Strict — no gaps inside one booking; the only remedy for conflicts is back-navigation |
| 12 | Duplicates | A service can appear only once per booking |
| 13 | No-preference resolution | At slot-pick time — the free compatible stylist is assigned and stored on the slot |
| 14 | Hours / slots | Open all week 10:00–21:00; hourly starts 10:00–20:00 (11 slots) |
| 15 | WhatsApp | Admin-clicked `wa.me` deep links from a Notification log (no gateway this pass) |

## Data model

### Service
```python
name: str                          # clean, no gender suffix
description: Optional[str]
duration_mins: int = 60
price: float
category: str                      # hair, colour, spa, grooming, facial, tattoo, bridal
audience: str = "unisex"           # men | women | unisex
for_kids: bool = False
```

### Stylist
```python
name, speciality, bio, experience_years
categories: List[str]              # hair, colour, spa, grooming (+tattoo for Ajay)
```

### User (additions)
```python
phone: Optional[str]               # E.164 — WhatsApp
gender: Optional[str]              # booking UI default, not a permission
```

### Booking (rewrite)
```python
user_id, stylist_id (primary = first service's), audience
services: List[PydanticObjectId]   # ordered; slot count = len(services)
date: str                          # start date
status: pending | awaiting_reschedule | confirmed | declined | cancelled
proposed_date / proposed_time_slot / proposed_at      # admin reschedule proposal
history: List[dict]                # {ts, actor, action, from_status, to_status, payload}
created_at / updated_at
```

### BookingSlot (new — delete-on-free)
```python
booking_id, service_id, stylist_id, sequence, date, time_slot, duration_mins
unique index: (stylist_id, date, time_slot)      # race protection
```
Rows are **deleted** when a booking is cancelled / declined / rescheduled-out.
That deletion is the freeing of the slot. History lives on `Booking.history`.

### Notification (new)
```python
booking_id, user_id, phone, kind, rendered_text, deep_link, created_at, sent_at
kinds: booking_pending, booking_confirmed, reschedule_proposed,
       reschedule_confirmed, booking_declined, booking_cancelled
```

## Customer flow (6 steps)

1. **For whom** — chips Men / Women / Kids + "For someone else"; skipped when
   `user.gender` is known; sets `audience` + kids filter for the rest of the flow.
2. **Services** — multi-select (no duplicates), filtered by audience; running
   total pill (`N services · ~N hrs · ₹X`).
3. **Stylists (per-service)** — each service gets its own picker, filtered by
   `categories` compatibility. "No preference" allowed per service. If a service
   has exactly one compatible stylist, it's auto-locked with a "Required: Ajay" pill.
4. **Slots (cascade)** — pick date once. For service ① pick a start slot from its
   stylist's availability. Service ②'s picker opens **suggesting the next hour**;
   if that stylist is busy there, their other free hours are shown. If nothing
   acceptable → **"← Back to ①'s slot"** re-opens the earlier picker. Boundary:
   `start_index + N ≤ 11` (slots 10:00–20:00). Strict contiguity — no gaps.
5. **Confirm** — timeline (service · stylist · time), total, notes.
   Submit → `pending` (soft-hold via slot rows).
6. **Done** — "Request sent — awaiting salon approval" + WhatsApp note.

## Soft-hold rule

A slot is unavailable when a BookingSlot row exists for it (unique index enforces).
Rows are deleted — freeing the slot — when a booking is cancelled, declined, or
rescheduled-out. Approval keeps rows forever (the booking is real).

## Admin dashboard (3 queues)

- **Pending** — cards: customer, services, slots, phone. Actions: Approve /
  Decline / Propose reschedule. Every action writes history + a Notification.
- **Awaiting reschedule** — old slots struck through, proposed slots in gold.
  Read-only wait.
- **Confirmed** — sorted by date; can also propose a reschedule from here.

## Reschedule (all-or-nothing, whole booking)

Admin proposes `(date, time)` → old slot rows deleted, new rows inserted
(409 if the new block conflicts) → status `awaiting_reschedule`.
Customer accepts → `confirmed`. Declines → `declined`. 24h TTL cron
auto-declines stale proposals (background task in lifespan).

## API (delta)

| Method | Path | Purpose |
|---|---|---|
| POST | `/bookings/` | PR-1: single-service compat body. PR-2: `service_ids[]` + start slot; validates all N consecutive slots |
| GET | `/bookings/me`, `/bookings/admin/all` | Extended BookingOut (slots, services, history, proposed fields) |
| POST | `/bookings/{id}/approve` · `/decline` | Admin transitions (PR-2) |
| POST | `/bookings/{id}/propose-reschedule` | Admin proposal (PR-2) |
| POST | `/bookings/{id}/accept-reschedule` · `/decline-reschedule` | Customer decision (PR-2) |
| GET | `/notifications/me` · POST `/notifications/{id}/mark-sent` | WhatsApp log (PR-2) |
| GET | `/availability/?stylist_id&date&slot_count=N` | Consecutive-free starts (PR-2) |

## Migration v2 (idempotent, in `seed_data`)

1. **Services missing `audience`** → strip both suffix styles (` — Men`, `(Women)`,
   ` — Boys`, `(Girls)`…), set `audience`/`for_kids`; heuristic: beard/shave/tonsure
   → men. Names become clean.
2. **Bookings with legacy `service_id`** → wiped (backup `20260825_174120`).
3. Stylists/users: unchanged (guards already in place).

## Hardening (final PR of the sequence)

`SECRET_KEY` → env · `slowapi` rate limits (auth 30/min, booking 5/min,
availability 60/min) · CORS tightened to production origin before launch ·
delete unused `Services*.jsx` variants.

## Out of scope (this pass)

WebSocket push (dashboard polls 15s) · payments · stylist leave days ·
multi-shop · email/SMS · automated WhatsApp gateway (seam exists via
Notification log).

## Test scenarios (20 — run per PR)

1. Single-service happy path (pending → approve → confirmed)
2. Multi-service happy path (N consecutive slots, cascade suggestion accepted)
3. Multi-slot blocker → 409 → back-nav to fix start
4. Audience filter (men's customer can't see Women's services)
5. Tattoo routing (Ajay auto-locked, "No preference" resolves to Ajay)
6. Admin decline → slots freed
7. Admin reschedule → old slots freed, new soft-held
8. Customer accepts reschedule → confirmed, history complete
9. Customer declines reschedule → declined, proposed slots freed
10. Soft-hold race (two tabs) → one 201, one 409
11. Cancel pending → slots freed + notification
12. Cancel during reschedule → proposed hold cleared
13. TTL auto-decline after 24h
14. WhatsApp deep link opens pre-filled chat
15. Audit trail renders (5 history entries after 2 reschedules)
16. Missing phone → yellow "not deliverable" pill
17. Auth: 401 without token, 403 without admin role
18. Contiguity back-nav (② busy at next hour → back to ① → shift → ② suggests new next)
19. Boundary rejection (2 services starting at 20:00 → blocked with message)
20. Duplicate service block (same service twice in one booking → prevented)

## Implementation order

| PR | Scope |
|---|---|
| PR-1 | Models (Booking rewrite, BookingSlot, Notification, Service.audience/for_kids) + migration v2 + schemas + booking-route compat (pending flow, delete-on-free cancel) + this document |
| PR-2 | Multi-slot availability + bookings routes + approve/decline/propose/accept/decline/cancel + notifications + TTL cron |
| PR-3 | Booking flow rewrite (6 steps, cascade slots, draft persistence, aborts) |
| PR-4 | My Appointments states + reschedule decision UI + Admin 3 queues + propose modal + WhatsApp panel |
| PR-5 | Services audience chips + auth phone/gender + delete unused variants + hardening |
