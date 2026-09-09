# Ayra Unisex Salon

A complete booking platform for a working salon — customer website, staff panel, and a native Android app for the stylists' chairs. Built for a real client, in production use on the salon floor.

**Stack:** FastAPI · MongoDB · React 18 (Vite + Tailwind) · Flutter

## Screenshots

| Customer site | Booking flow |
| --- | --- |
| ![Customer home](docs/screenshots/customer-home.png) | ![Booking flow](docs/screenshots/customer-booking.png) |

| Staff panel — dashboard | Staff panel — schedule |
| --- | --- |
| ![Staff dashboard](docs/screenshots/admin-dashboard.png) | ![Staff schedule](docs/screenshots/admin-schedule.png) |

## Architecture

```
┌──────────────────┐     ┌──────────────────┐
│  Customer site   │     │   Staff panel    │
│  React (Vite)    │     │   React (Vite)   │
│  :5173           │     │   :5174          │
└────────┬─────────┘     └────────┬─────────┘
         │        REST / JWT      │
         └───────────┬────────────┘
                     ▼
          ┌─────────────────────┐        ┌──────────────────┐
          │   FastAPI backend   │──────▶ │  Firebase (FCM)  │
          │   MongoDB (Motor/   │        └────────┬─────────┘
          │   Beanie), bcrypt,  │                 │ data push
          │   slowapi limiter   │                 ▼
          └─────────┬───────────┘     ┌──────────────────────┐
                    │                 │  Flutter admin app   │
          ┌─────────▼───────────┐     │  full-screen alert + │
          │  Resend email +     │     │  looping chime +     │
          │  .ics calendar      │     │  exact alarm         │
          │  invites            │     └──────────────────────┘
          └─────────────────────┘
```

Four codebases, one API:

- **`backend/`** — FastAPI + MongoDB (Motor/Beanie). JWT auth with bcrypt, rate limiting (slowapi), FCM push (`push.py`), device registration (`routes/devices.py`), email + calendar invites via Resend (`services/emailer.py`, `services/ics.py`), WhatsApp message log (`services/whatsapp.py`).
- **`frontend/`** — customer-facing booking site. Multi-step booking wizard with live slot availability, service catalogue, stylist selection.
- **`frontend-admin/`** — staff panel. Chair-scoped dashboard (pending approvals, daily/monthly earnings), day-grouped schedule, walk-in appointment entry.
- **`admin_app/`** — Flutter app for stylists. Receives insistent new-booking alerts, manages the chair from the floor: approve/decline, schedule, economy, time-off.

## Engineering highlights

### 1. Insistent new-booking alerts (the "phone must ring" problem)

A missed booking is lost revenue, so a silent notification was not acceptable. The alert pipeline:

1. Backend publishes an FCM **data message** on every new booking.
2. The Flutter app turns it into a **full-screen intent** notification with a looping chime (`audioplayers` + bundled `alert_chime.wav`) that repeats until the stylist acknowledges.
3. An **exact alarm** (`timezone` + Android `SCHEDULE_EXACT_ALARM`) re-fires the alert if it is dismissed unacknowledged.

The hard part was MIUI: Android's `timeoutAfter` on notifications races with the chime loop, killing the alert mid-ring on Xiaomi devices. Fixed by giving the notification a 30-second grace window past the loop duration (`notification_service.dart`), verified on a physical Redmi device.

### 2. Duration-aware scheduling engine

Salon services have durations, not fixed slots — a 45-minute haircut at 19:30 must not collide with a 60-minute colour at 20:00. The engine (`backend/routes/availability.py`):

- All arithmetic in **IST (UTC+5:30)** regardless of server timezone.
- Two-sided **interval-overlap conflict checks** against existing bookings and stylist time-off.
- **Grace absorption** (`GRACE_MINS = 30`): a booking may run past its slot into the next one's grace buffer without blocking it.
- **Booking cutoff** (`BOOKING_CUTOFF_MINS = 10`): no same-minute bookings; last slot of the day closes at 20:15.
- Slot rows are **deleted when freed**, so availability queries stay O(1) per stylist.

### 3. Security posture

- JWT with **no hardcoded fallback secret**: if `SECRET_KEY` is unset the server generates an ephemeral random key and fails loudly — tokens survive nothing, but nothing is silently forgeable (`backend/auth.py`).
- bcrypt password hashing, slowapi rate limiting, CORS allow-list via env.
- Secrets (`.env`, Firebase service account) are gitignored; only public client config is committed.

## Run it locally

**Backend** (Python 3.12+):

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate          # Windows
pip install -r requirements.txt
copy .env.example .env          # then fill in MONGODB_URL + SECRET_KEY
uvicorn main:app --reload --port 8000
```

**Customer site:**

```bash
cd frontend
npm install
npm run dev                     # http://localhost:5173
```

**Staff panel:**

```bash
cd frontend-admin
npm install
npm run dev                     # http://localhost:5174
```

**Flutter admin app** (points at your machine's LAN IP so a physical phone can reach it):

```bash
cd admin_app
flutter pub get
flutter run --dart-define=AYRA_HOST=<your-lan-ip>
```

## Status

- ✅ In production use at the salon (customer site, staff panel, Flutter app on stylists' devices)
- 🚧 VPS deployment of the backend in progress
- 📋 `PLAN.md` and `RETREAT.md` document the build process and decisions
