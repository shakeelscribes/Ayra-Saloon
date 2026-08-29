/// Backend connection settings.
///
/// Dev: the FastAPI server runs on the salon PC at localhost:8000.
/// Routes are mounted at the root (e.g. /auth/login, /bookings) — no /api
/// prefix. The web admin only gets away with /api because the Vite dev
/// server proxies and strips it; this app talks to FastAPI directly.
///  - Android emulator reaches the host PC via 10.0.2.2
///  - iOS simulator can use localhost directly
///  - A real phone on the same Wi-Fi needs the PC's LAN IP (e.g. 192.168.1.20)
///
/// Production: point this at the hosted API (e.g. https://api.ayrasaloon.com).
library;

import 'dart:io' show Platform;

const String _prodBaseUrl = 'https://api.ayrasaloon.com';

/// Optional compile-time override, e.g. run on a real phone over USB with
/// `adb reverse tcp:8000 tcp:8000` and
/// `flutter run --dart-define=AYRA_HOST=localhost`.
const String _hostOverride = String.fromEnvironment('AYRA_HOST');

String get apiBaseUrl {
  // Flip to true once the hosted backend is live.
  const useProd = bool.fromEnvironment('AYRA_PROD', defaultValue: false);
  if (useProd) return _prodBaseUrl;
  final host = _hostOverride.isNotEmpty
      ? _hostOverride
      : (Platform.isAndroid ? '10.0.2.2' : 'localhost');
  return 'http://$host:8000';
}
