# Ayra Unisex Salon

A complete booking platform for a working salon — customer website, staff panel, and a native Android app for the stylists' chairs. Built for a real client, in production use on the salon floor.

**Stack:** FastAPI · MongoDB · React 18 (Vite + Tailwind) · Flutter

**Developer:** [Mohamed Shakeel](https://github.com/shakeelscribes) — designed and built the entire platform (backend, web, mobile). PRs reviewed by [Sri Thandapani](https://github.com/srithandapani).

## Screenshots

| Customer site | Booking flow |
| --- | --- |
| ![Customer home](docs/screenshots/customer-home.png) | ![Booking flow](docs/screenshots/customer-booking.png) |

| Staff panel — dashboard | Staff panel — schedule |
| --- | --- |
| ![Staff dashboard](docs/screenshots/admin-dashboard.png) | ![Staff schedule](docs/screenshots/admin-schedule.png) |

## What it does

The salon takes bookings through the website. Every new booking lands on the assigned stylist's phone as an insistent, impossible-to-miss alert. The stylist approves or declines it from the chair; schedule, earnings and time-off live in the same app. Customers get email confirmations with calendar invites.

### Customer site (`frontend/`)

- Multi-step booking wizard: service catalogue (categorised, priced, with durations) → stylist → date & time
- Live slot availability computed server-side by the scheduling engine — no double-booking, no stale slots
- Customer accounts (JWT) with booking history
- Email confirmation with an `.ics` calendar invite (Resend)

### Staff panel (`frontend-admin/`)

- Chair-scoped dashboard: pending booking approvals, daily and monthly earnings
- Day-grouped schedule — each stylist sees only their own chair
- Walk-in / phone booking entry ("New Appointment")
- WhatsApp message log

### Stylist app (`admin_app/`, Flutter)

- Insistent new-booking alerts: full-screen notification, looping chime, exact-alarm re-fire until acknowledged
- Approve / decline bookings from the floor
- Schedule, earnings, time-off requests, new appointments
- Portrait-locked UI, custom alert chime, FCM device registration

### API (`backend/`)

- FastAPI + MongoDB (Motor / Beanie ODM)
- Modules: auth, users, stylists, services, availability, bookings, economy, devices, notifications
- JWT + bcrypt auth, slowapi rate limiting, CORS allow-list
- Firebase Cloud Messaging push with per-device registration
- Resend email + `.ics` calendar invites, WhatsApp log, stylist time-off

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

## Repo layout

```
├── backend/           FastAPI API server
│   ├── routes/        auth, users, stylists, services, availability,
│   │                  bookings, economy, devices, notifications
│   ├── services/      emailer (Resend), ics, whatsapp, timeoff
│   └── push.py        Firebase Cloud Messaging
├── frontend/          Customer booking site (React + Vite + Tailwind)
├── frontend-admin/    Staff panel (React + Vite)
├── admin_app/         Stylist Android app (Flutter)
└── docs/screenshots/  README imagery
```

## Status

- ✅ In production use at the salon (customer site, staff panel, Flutter app on stylists' devices)
- 🚧 VPS deployment of the backend in progress
- 📋 `PLAN.md` and `RETREAT.md` document the build process and decisions

## Credits

- **[Mohamed Shakeel](https://github.com/shakeelscribes)** — lead developer. Built the entire infrastructure: FastAPI backend, customer site, staff panel, and the Flutter admin app.
- **[Sri Thandapani](https://github.com/srithandapani)** — contributor and PR reviewer.
