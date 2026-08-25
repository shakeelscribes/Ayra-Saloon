# Ayra Saloon — Scalable Multi-Slot Booking System

## Summary

Replace the current "one row per booking = one slot" model with a **multi-slot, state-machine booking system** that supports: gender-aware service selection, multiple services in a single booking with a contiguous slot reservation, exclusive stylist routing (e.g. tattoos only by Ajay), soft-hold during admin review, admin approval, customer-initiated rescheduling via admin proposal → customer accept/decline, and WhatsApp notification at every status change. Targeted at **single-shop, modest traffic** (hundreds of bookings/day, single MongoDB, stateless FastAPI).

## Locked decisions

| Decision | Choice | Reason |
|---|---|---|
| Audience model | `Service.audience ∈ {"men","women","unisex"}` + `Service.kids: bool` | Catalog is already gender-split by name; make it a field, drop the suffix from the name |
| Slot hold while admin reviews | **Soft hold** — pending bookings block availability | Two customers fighting for one slot is the worst UX; soft-hold is the only sane option |
| Reschedule unit | **Move the whole booking** (admin proposes one new `(date, time)`; the whole contiguous block shifts) | Matches how a chair works, matches customer's mental model, collapses the state machine |
| Exclusive categories | New `Stylist.exclusive_categories: List[str]` — if a service's category is in this list, only this stylist is offered | Tattoo is the real example; cleaner than per-service flags |
| WhatsApp delivery | Build a `Notification` log table with rendered message text + a `deep_link` to `wa.me/...`; admin clicks from a dashboard panel. No external API in this pass | Free, real, works in India, no third-party dependency to leak phone numbers |
| Scale target | Single shop, modest traffic. Single MongoDB, FastAPI stateless workers, Vite frontend | Per your answer |

## Data model changes

### `Service` (backend/models.py)

```python
class Service(Document):
    name: str                      # cleaned, no "— Men" suffix anymore
    description: Optional[str] = None
    duration_mins: int = 60
    price: float
    category: str                  # hair, colour, spa, grooming, facial, tattoo, bridal
    audience: str = "unisex"       # "men" | "women" | "unisex"
    for_kids: bool = False         # kids hair cuts, etc.
    is_exclusive: bool = False     # if True, only stylists whose exclusive_categories
                                   # contains `category` may take it (admin toggle, not seeded)
    class Settings:
        name = "services"
        indexes = ["category", "audience"]
```

### `Stylist` (backend/models.py)

```python
class Stylist(Document):
    name: str
    speciality: Optional[str] = None
    bio: Optional[str] = None
    experience_years: int = 1
    categories: List[str] = Field(default_factory=list)
    exclusive_categories: List[str] = Field(default_factory=list)  # e.g. Ajay → ["tattoo"]
    class Settings:
        name = "stylists"
```

### `User` (backend/models.py)

```python
class User(Document):
    name: str
    email: str
    hashed_password: str
    phone: Optional[str] = None        # E.164, e.g. +918270606750 — required for WhatsApp
    gender: Optional[str] = None        # "men" | "women" | None  — UI default, NOT a permission
    is_admin: bool = False
    class Settings:
        name = "users"
        indexes = ["email"]
```

### `Booking` (backend/models.py) — **major rewrite**

```python
class BookingStatus(str, enum.Enum):
    pending              = "pending"               # customer submitted, awaiting admin
    awaiting_reschedule  = "awaiting_reschedule"   # admin proposed new slots, awaiting customer
    confirmed            = "confirmed"             # admin approved OR customer accepted reschedule
    declined             = "declined"              # admin declined the original request
    cancelled            = "cancelled"             # customer cancelled (terminal)

class BookingSlot(Document):
    """One slot inside a booking. Multiple slots form one booking."""
    booking_id: PydanticObjectId
    service_id: PydanticObjectId        # which service this slot is for
    sequence: int                       # 0, 1, 2 ... in the order the customer picked
    date: str                           # "YYYY-MM-DD"
    time_slot: str                      # "HH:MM"
    duration_mins: int                  # snapshotted from Service.duration_mins at booking time
    class Settings:
        name = "booking_slots"
        indexes = [
            ("stylist_id", "date", "time_slot"),   # for availability queries
            "booking_id",
        ]
```

**Important:** Today the slot's `stylist_id` lives implicitly on `Booking`. We need to denormalize it onto `BookingSlot` too so the availability query stays a single indexed lookup. See "Availability logic" below.

### `Booking` document (final)

```python
class Booking(Document):
    user_id: PydanticObjectId
    stylist_id: PydanticObjectId                # the assigned stylist for the whole booking
    audience: str                               # "men" | "women" | "unisex" — snapshotted from the chosen services
    services: List[PydanticObjectId]            # ordered list of services (slot count = len(services))
    proposed_date: Optional[str] = None         # set when admin proposes a reschedule
    proposed_time_slot: Optional[str] = None    # set when admin proposes a reschedule
    proposed_at: Optional[datetime] = None
    notes: Optional[str] = None
    status: BookingStatus = BookingStatus.pending
    history: List[dict] = Field(default_factory=list)
    # history entries: {ts, actor: "customer"|"admin"|"system", action, from_status, to_status, payload}
    created_at: datetime
    updated_at: datetime
    class Settings:
        name = "bookings"
        indexes = ["user_id", "stylist_id", "date", "status", ("stylist_id","date")]
```

### `Notification` (new) — for the WhatsApp log

```python
class Notification(Document):
    booking_id: PydanticObjectId
    user_id: PydanticObjectId
    phone: str                          # E.164
    kind: str                           # "booking_pending" | "booking_confirmed" | "reschedule_proposed" | "reschedule_confirmed" | "booking_declined"
    rendered_text: str                  # the exact message body
    deep_link: str                      # "https://wa.me/918270606750?text=..."
    created_at: datetime
    sent_at: Optional[datetime] = None  # admin clicked "send"; not auto-sent
    class Settings:
        name = "notifications"
        indexes = [("booking_id", "created_at"), "user_id"]
```

## Behavior changes (end-to-end)

### Booking flow — 5 steps, customer side

1. **Gender / for-whom**
   - If logged in with `user.gender` set, step collapses to a single "Continue" pill.
   - Otherwise: "For me" (pre-fills if known) or "For someone else" (asks gender).
   - `audience` is locked for the rest of the flow. Picked services are filtered to `audience == "men" | "women" | "unisex"` plus `for_kids` if the user said "kids".

2. **Services** (multi-select, was single)
   - Customer can pick **one or more** services. Each shows its duration and price.
   - A "running total" badge shows `N services · ~N hours · ₹X`.
   - If a service has `is_exclusive=True` (e.g. tattoo) it can be the only one in the booking — UI prevents combining it with others and shows why.

3. **Stylist**
   - Only stylists whose `categories` cover **every** selected service's category are shown.
   - If any selected service's category is in some stylist's `exclusive_categories`, that stylist is auto-selected and the step is skipped with a "Required stylist: Ajay" pill.
   - "Any available chair" is offered only if at least 2 stylists qualify.

4. **Slots** (this is the catch)
   - The customer picks **one date** and **one starting time slot** for service 1. The system auto-fills consecutive slots for services 2..N, but each one must also be free.
   - **Hard rule:** if any of the N consecutive slots is already booked/pending, the customer cannot submit. The UI shows which slot is the blocker and offers to either change the start time or pick a different date.
   - Slots are 1-hour, salon hours 10:00–20:00 (last start at 20:00 occupies 20:00–21:00). This is unchanged from today.

5. **Confirm + notes**
   - Shows: services list, stylist, date + N consecutive slots, total, notes field.
   - "Confirm booking" → `POST /bookings/`. Status = `pending`. Soft-hold begins.

### Soft-hold rule

A slot is **unavailable** for new customer submissions if there exists any `BookingSlot` whose `status ∈ {pending, awaiting_reschedule, confirmed}`. Cancelled, declined, or rescheduled-out slots free up.

Soft-hold ends if:
- Admin approves → status becomes `confirmed`, slot stays locked.
- Admin declines → `Booking.status = declined`, slots freed, customer notified.
- Admin proposes a reschedule → `Booking.status = awaiting_reschedule`, the *old* slots are freed and the *proposed* slots are tentatively held. If customer declines the proposal, the booking ends as `declined`.
- Customer cancels → `Booking.status = cancelled`, all slots freed.

### Admin dashboard

The existing `Admin/Dashboard.jsx` (179 lines) becomes the operations panel. Three queues:

- **Pending queue** — `status = pending`. Cards show: customer, services, slots. Buttons: **Approve**, **Decline**, **Propose reschedule**. Approve flips to `confirmed` and writes a "booking_confirmed" Notification. Decline flips to `declined`, frees slots, writes "booking_declined" Notification. Propose opens a small date+time picker.
- **Awaiting reschedule queue** — `status = awaiting_reschedule`. The customer's original slots are shown struck-through, the proposed new slots in a gold pill. The admin is just waiting; no action needed.
- **Confirmed today / upcoming** — `status = confirmed`, sorted by date. The admin can also propose a reschedule from here (for the "I have a personal issue" case). This is a new affordance, not a new flow.

Every "Approve", "Decline", "Propose" action writes a `history` entry on the Booking.

### Customer accept/decline of reschedule

`MyAppointments` shows the `awaiting_reschedule` state with two buttons: **Accept new time**, **Decline**. The "Accept" path moves `proposed_date / proposed_time_slot` into the actual slots (creating new `BookingSlot` rows, freeing the old ones), flips status to `confirmed`, writes a Notification. The "Decline" path flips the booking to `declined`, writes a Notification, frees everything.

### WhatsApp delivery

- Every status change writes a `Notification` row with the rendered text and a `https://wa.me/<phone>?text=<encoded>` deep link.
- The admin dashboard surfaces a "Send to WhatsApp" button on each notification. Clicking opens WhatsApp Web in a new tab with the pre-filled message. `sent_at` is stamped when the admin clicks.
- The customer's `MyAppointments` page also shows a copyable deep link so the customer can self-send if the admin is slow.

## Public API changes (backend)

### New endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET`  | `/services/?audience=men` (or `women`, or omit for all) | Filter services by audience; also filter kids via `?for_kids=true` |
| `POST` | `/bookings/` — request body changed | Accepts `service_ids: List[PydanticObjectId]` + `date` + `time_slot`. Validates all N consecutive slots are free. Creates 1 Booking + N BookingSlot rows. Status = `pending`. |
| `GET`  | `/bookings/me` — response extended | Each booking now includes `services: List[ServiceOut]`, `slots: List[{date, time_slot, sequence, service_id, duration_mins}]`, `proposed_date`, `proposed_time_slot`, `history` |
| `POST` | `/bookings/{id}/approve` (admin) | pending → confirmed, writes Notification |
| `POST` | `/bookings/{id}/decline` (admin) | pending → declined, frees slots, writes Notification |
| `POST` | `/bookings/{id}/propose-reschedule` (admin) | body: `{date, time_slot, reason?}`; pending → awaiting_reschedule, frees old slots, tentatively holds new, writes Notification |
| `POST` | `/bookings/{id}/accept-reschedule` (customer) | awaiting_reschedule → confirmed, slots move, writes Notification |
| `POST` | `/bookings/{id}/decline-reschedule` (customer) | awaiting_reschedule → declined, slots freed, writes Notification |
| `POST` | `/bookings/{id}/cancel` (customer or admin) | any non-terminal → cancelled, frees slots, writes Notification |
| `GET`  | `/notifications/me` (customer) | List Notifications for the logged-in user |
| `POST` | `/notifications/{id}/mark-sent` (admin) | Stamps `sent_at`, returns updated notification |
| `GET`  | `/availability/?stylist_id=...&date=...&slot_count=N` | New `slot_count` query param. Returns both `available_slots` (1-hour starts where slot_count consecutive hours are all free) and a `consecutive_starts: List[str>` for the UI's smart suggestions. |

### Removed

- Old `POST /bookings/` with single `service_id` (replaced by `service_ids: List`). A 6-line compat shim is fine if you have other clients; otherwise drop it.

### Unchanged

- `GET /services/`, `GET /services/{id}`, `GET /stylists/`, `GET /stylists/{id}`, all auth routes, `GET /bookings/admin/all`, `GET /bookings/admin/all?date=...` (now returns the new richer BookingOut shape).

## Data migration (one-time, on first boot)

The existing `seed_data` already has the legacy-marker pattern. Extend it:

1. **Services** — detect any service whose name contains " — Men", " — Women", " — Boys", " — Girls". Drop the suffix, set `audience` and `for_kids` based on which suffix was stripped. Add `is_exclusive` flag based on category (`tattoo` → True for now; admin can toggle per-stylist later).
2. **Stylists** — set `exclusive_categories = ["tattoo"]` on Ajay by detection (his `categories` already contains `"tattoo"` and the only other stylist Raja does not).
3. **Bookings** — no live data to migrate, but if any exist, expand each into a parent `Booking` + N `BookingSlot` children using their `duration_mins` snapshotted from the service. This is a 30-line script; if the prod DB is empty, skip it.
4. **Admin user** — set `phone = None`; UI will prompt on first login to add it for WhatsApp.

## Frontend changes (high-level)

### `components/BookingComponent.jsx` — full rewrite

The 622-line file splits into 5 subcomponents (`GenderStep`, `ServicesStep`, `StylistStep`, `SlotsStep`, `ConfirmStep`) and a `BookingFlow` orchestrator that holds shared state. Key changes:

- `ServicesStep` becomes multi-select with checkboxes and a "running total" pill.
- `SlotsStep` is rewritten. After the user picks a start time, the UI auto-fills the next N-1 slots in a contiguous "your booking" panel. If any auto-filled slot is blocked, the picker shows the conflict and offers the next valid start.
- New `useBookingGuard` hook: if the user navigates away mid-flow, persist the in-progress draft in `sessionStorage` so a refresh doesn't lose their work.
- All API calls get a `useAxiosWithAbort` wrapper so a fast step-navigation cancels the in-flight request.

### `components/MyAppointments.jsx` — extended

- Render the new status with a colored pill (`pending` = amber, `awaiting_reschedule` = violet, `confirmed` = emerald, `declined` = rose, `cancelled` = slate).
- For `awaiting_reschedule`, show the old slots struck-through and the proposed slots in a gold panel with **Accept new time** / **Decline** buttons.
- Show the WhatsApp deep link for each notification below the booking card.

### `components/Admin/Dashboard.jsx` — three queues

Replace the single list with three tabs: **Pending**, **Awaiting reschedule**, **Confirmed**. Each card has the actions described above. Add a "Propose reschedule" modal that lets the admin pick a new date and time (with a "show available slots" helper that calls `/availability/`).

### `components/Navbar.jsx` + `AuthContext`

- `AuthContext.login` should populate `user.gender` and `user.phone` so the booking flow can pre-fill.
- The `Login` and `Signup` forms add a "Phone (for WhatsApp confirmations)" field and a "Gender" select (optional). The booking flow's gender step reads from `useAuth().user.gender` and skips if present.

### `pages/StylistsPage.jsx` + `pages/ServicesPage.jsx`

- `ServicesPage` adds an audience filter chip row (`All | Men | Women | Kids`) that hits `GET /services/?audience=...&for_kids=...`. No other changes.
- `StylistsPage` is unchanged.

## Scalability & protection (per the brief)

Even at "single shop, modest traffic", the following are non-negotiable for the new system to be safe at all:

| Concern | Mitigation |
|---|---|
| Slot race condition (two customers submit the same slot at the same time) | MongoDB unique compound index on `BookingSlot(stylist_id, date, time_slot)` **where status is in lock-set**. The cleanest implementation is a partial index on `status ∈ {pending, awaiting_reschedule, confirmed}`. The booking insert is wrapped in a transaction; on unique-violation, return 409 to the loser. |
| Slot lock during review | The unique index above covers `pending` and `awaiting_reschedule` — slots are soft-held automatically. |
| Stale `pending` bookings | Add a 24h TTL cron (Motor `asyncio` background task started in `lifespan`): any `pending` booking older than 24h is auto-declined, slots freed, Notification written. |
| Auth token theft | Move `SECRET_KEY` to env (one-line change). Add a `jti` to JWT and a Redis denylist on logout if scale ever demands it — but skip for now. |
| Rate limiting | Add `slowapi` middleware: 30 req/min on auth, 5 req/min on booking submit, 60 req/min on availability. Cheap insurance against bots scraping the slot grid. |
| CORS | Tighten `allow_origins` to the production domain before launch. Today it's `localhost:5173` only. |
| PII leakage in WhatsApp links | Phone numbers stay server-side. The frontend only ever sees the rendered `deep_link`. |
| Frontend bundle size | The four unused `Services*` variants on disk (`ServicesCarousel.jsx`, `ServicesClickSlide.jsx`, `ServicesScrollLinked.jsx`, `ServicesZigZag.jsx`) — delete as part of this pass. No imports break; only `Services.jsx` is used on the landing page. |

## Edge cases & failure modes (explicitly handled)

1. **Customer picks the last valid consecutive start, then it becomes invalid before they hit confirm.** The submit endpoint re-checks all N slots under the unique index; if any is taken, return 409 with the offending slot index, the UI highlights it.
2. **Customer picks a service whose stylist changes availability mid-flow.** The `SlotsStep` re-fetches availability when stylist changes. If the previously picked start is no longer valid, it is highlighted and must be re-picked.
3. **Admin proposes a reschedule to a slot that's also taken by another customer.** The propose endpoint does the same unique-index check; on conflict, return 409 with the suggested next free slot.
4. **Customer is offline when admin proposes a reschedule.** The status is still set on the server. When the customer next loads `MyAppointments`, they see the proposal and can act on it.
5. **Admin proposes a reschedule, customer never responds.** TTL cron auto-declines after 24h, slots freed.
6. **Two services with different durations in one booking.** Treated as N consecutive 1-hour slots, not as `sum(durations)`. Your brief says "average 60 minutes per service" so the simpler model matches. If a real 90-min service appears later, we round up to 2 slots and price it once. Document this in the catalog.
7. **Customer wants to cancel an `awaiting_reschedule` booking.** Allowed. Old slots are already freed, so cancel just clears the proposed hold and writes Notification.
8. **Tattoo service combined with another.** `is_exclusive=True` services can only be booked alone. UI blocks at the services step with a clear explanation.
9. **Audience mismatch at submit time.** Customer can't normally hit this (services are filtered by audience in step 2), but if a race happens, the submit endpoint re-validates each service's audience against the booking's `audience` field.
10. **Customer has no phone number.** Submit is allowed; the WhatsApp Notification is still written but with `phone = ""` and the dashboard shows a yellow "Phone missing — message not deliverable" pill.

## Out of scope (this pass)

- Real-time push (WebSocket) for admin notifications — the dashboard polls every 15s, which is enough for a single-shop.
- Payment / deposit collection.
- Stylist leave days / time-off.
- Multi-shop / multi-tenant.
- Email notifications (only WhatsApp deep links in this pass).
- SMS fallback if WhatsApp is unreachable.

## Test cases & verification scenarios

These should all be runnable end-to-end via the running dev stack (MongoDB + FastAPI + Vite):

1. **Single-service happy path** — male customer, hair cut, Raja, 11:00 today. Booking goes `pending`; admin approves; slot stays locked; customer sees `confirmed` in MyAppointments.
2. **Multi-service happy path** — female customer, Layer Cut + Hair Spa, Raja, 14:00. Two consecutive slots created. `pending` → admin approves → both locked. Customer sees both slots.
3. **Multi-slot blocker** — Same as #2 but 15:00 is taken. Submit returns 409, UI shows "15:00 is no longer available, please pick a new start time."
4. **Audience filter** — Male customer. Layer Cut (Women) is not visible. /services?audience=men returns only men's services.
5. **Exclusive stylist routing** — Customer picks "Portrait Tattoo 3D". Stylist step is skipped with "Ajay" pre-selected. "Any available chair" is not offered.
6. **Admin decline** — Submit a booking, admin declines it. Status = `declined`, slots freed, another customer can now book them.
7. **Admin reschedule** — Customer booked 11:00. Admin proposes 14:00. Customer sees old struck-through, new in gold. Slots 11:00/12:00 are now free for other customers; 14:00/15:00 are soft-held.
8. **Customer accepts reschedule** — Accepts 14:00. Status → `confirmed`. History has 3 entries (created, proposed, accepted).
9. **Customer declines reschedule** — Status → `declined`. Soft-held proposed slots freed.
10. **Soft-hold race** — Two browser tabs both submit 11:00 with the same stylist. One returns 201, the other returns 409 with a friendly toast.
11. **Cancel mid-flow** — Customer cancels a `pending` booking. Slots freed immediately. Notification written.
12. **Cancel during reschedule** — Customer cancels `awaiting_reschedule`. Status → `cancelled`. Soft-held proposed slots freed.
13. **TTL auto-decline** — Create a `pending` booking, set its `created_at` to 25h ago via a test script, run the cron. Status flips to `declined`, slots freed, Notification written.
14. **WhatsApp deep link** — Approved booking, customer phone +918270606750. Notification row has `deep_link = https://wa.me/918270606750?text=...`. Clicking it opens WhatsApp Web with the pre-filled message.
15. **Admin audit trail** — Booking with 2 reschedules has 5 history entries (created, proposed, declined, proposed, accepted). Dashboard renders the timeline.
16. **Missing phone** — Customer with no phone. Booking succeeds, Notification has `phone=""`, dashboard shows the yellow warning.
17. **Auth required** — `POST /bookings/` without a token returns 401. `POST /bookings/{id}/approve` without admin role returns 403.

## Implementation order (recommended PR sequence)

1. **Backend data model + migration** — update `models.py`, extend `seed_data` for the suffix-stripping, add the new `Booking` + `BookingSlot` + `Notification` documents. Verify with the existing test bookings.
2. **Backend availability + booking routes** — rewrite `bookings.py` and `availability.py` for multi-slot. Add the unique compound index. Manual curl tests for each test case above.
3. **Backend admin + reschedule + notification routes** — add the new endpoints. Manual curl tests for the reschedule flow.
4. **Backend cleanup** — delete the four unused `Services*` frontend files (or note that as a separate task; safer to do it in this PR since the build is the one that would notice).
5. **Frontend auth + booking rewrite** — `AuthContext` carries `gender`/`phone`, `BookingComponent` becomes 5 steps, `SlotsStep` handles the multi-slot logic.
6. **Frontend MyAppointments + Admin dashboard** — render the new states, add the reschedule modal, surface the WhatsApp deep link.
7. **Frontend ServicesPage audience filter** — small, isolated, last.
8. **Rate limiting + secret key + CORS hardening** — ship together, do not bundle into feature PRs.

## Assumptions recorded

- **WhatsApp delivery** uses admin-clicked deep links to `wa.me/...` rather than an automated gateway. If you want Twilio/Gupshup later, the `Notification` model already has the seam — just add a worker that consumes pending Notifications and calls the gateway.
- **Slot granularity** is 1 hour; services are rounded up to whole hours. If a 90-min service is added later, it occupies 2 slots at the catalog level.
- **Reschedule** is all-or-nothing per the locked decision. Partial reschedules were considered and rejected.
- **"Kids"** is a flag on the service (`for_kids`), not a separate audience value, because the gender question (men/women/unisex) is still the primary axis. The UI will offer "For my kid" as a fourth option on the gender step and pre-set `for_kids=true` filters.
- **Admin phone** for WhatsApp is collected on first login, not seeded.
- **Soft-hold is the only hold mode** — there is no hard-hold-only-after-confirm option. This was the locked answer.
- **Single-shop scale** is the target. The model is shaped so a `shop_id` discriminator could be added later without a full rewrite, but no multi-tenant code ships in this pass.
