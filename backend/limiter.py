"""Shared rate limiter (slowapi), keyed by client IP.

Limits are applied per-route with @limiter.limit(...):
  - /auth/register, /auth/login   30/minute  (credential endpoints)
  - POST /bookings/                5/minute  (booking creation)
  - GET /availability/            60/minute  (polled by the booking flow)

main.py registers the limiter on app.state and installs the 429 handler.
"""
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)
