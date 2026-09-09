"""FCM push sending for the Ayra Dashboard app (stylist new-booking alerts).

Data-only payloads — the app owns presentation + the insistent alarm sound.
firebase-admin is initialized lazily so the backend still boots when the
service-account JSON is missing (alerts degrade to the polling fallback).
"""
import os

from bson import ObjectId

_CREDENTIAL_PATH = os.path.join(os.path.dirname(__file__), "firebase-service-account.json")

_app = None
_disabled = False  # set when credentials are missing/init fails — logged once


def _get_app():
    """Lazy firebase_admin.App init; None when unavailable."""
    global _app, _disabled
    if _app is not None or _disabled:
        return _app
    if not os.path.exists(_CREDENTIAL_PATH):
        print(f"push: {_CREDENTIAL_PATH} not found — FCM alerts disabled "
              f"(polling fallback still works).", flush=True)
        _disabled = True
        return None
    try:
        import firebase_admin
        from firebase_admin import credentials
        cred = credentials.Certificate(_CREDENTIAL_PATH)
        _app = firebase_admin.initialize_app(cred)
        print("push: firebase-admin initialized.", flush=True)
    except Exception as e:
        print(f"push: firebase-admin init failed ({e}) — FCM alerts disabled.", flush=True)
        _disabled = True
    return _app


def _strip_unregistered(tokens):
    """Remove device-token docs FCM reports as invalid/uninstalled."""
    from models import DeviceToken
    for t in tokens:
        try:
            # fire-and-forget prune; token has a unique index
            DeviceToken.find(DeviceToken.token == t).delete()
        except Exception:
            pass


async def send_to_stylist(stylist_id: ObjectId, data: dict) -> int:
    """Fan out a data-only push to every device registered to the stylist
    staff user. Returns delivered count (for logging only — booking creation
    must not fail when FCM is down)."""
    from models import DeviceToken, User
    app = _get_app()
    if app is None:
        return 0
    try:
        staff = await User.find_one(User.stylist_id == stylist_id)
        if not staff:
            return 0
        docs = await DeviceToken.find(DeviceToken.user_id == staff.id).to_list()
        if not docs:
            return 0
        from firebase_admin import messaging
        tokens = [d.token for d in docs]
        # stringify every value — FCM data payloads accept strings only
        payload = {k: str(v) if v is not None else "" for k, v in data.items()}
        message = messaging.MulticastMessage(
            data=payload,
            tokens=tokens,
            # data-only defaults to NORMAL priority — too weak to wake a
            # frozen/killed app. These are alarms; they must get through.
            android=messaging.AndroidConfig(priority="high"),
        )
        response = messaging.send_each_for_multicast(message, app=app)
        # SendResponse exposes success/exception/message_id only — pair each
        # response with its token via enumerate (r.index doesn't exist and
        # only blows up when at least one token is stale).
        dead = [token for token, r in zip(tokens, response.responses)
                if not r.success
                and isinstance(r.exception, messaging.UnregisteredError)]
        if dead:
            _strip_unregistered(dead)
        delivered = sum(1 for r in response.responses if r.success)
        kind = payload.get("type") or "push"
        print(f"push: {kind} -> {delivered}/{len(tokens)} device(s) "
              f"for stylist {stylist_id}", flush=True)
        return delivered
    except Exception as e:
        print(f"push: send failed ({e})", flush=True)
        return 0


async def send_resolved(stylist_id: ObjectId, booking_id: ObjectId) -> int:
    """Silent 'this pending booking is gone' signal so devices cancel the alarm."""
    return await send_to_stylist(stylist_id, {
        "type": "booking_resolved",
        "booking_id": str(booking_id),
    })
