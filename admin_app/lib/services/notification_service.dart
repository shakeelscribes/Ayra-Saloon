/// Insistent new-booking alerts for stylist devices (Ayra Dashboard).
///
/// The backend sends DATA-ONLY FCM pushes; this app owns all presentation:
///
/// - Background/closed, work hours (08:00–22:00 IST): heads-up notification
///   (id 1001) posted with FLAG_INSISTENT — the OS loops the alarm chime
///   natively until the notification is replaced or cancelled. Works even
///   when the app process is dead; no timers, no re-fire chain.
/// - Background/closed, quiet hours (22:00–08:00 IST): the same notification
///   on the SILENT channel — heads-up banner, sits in the shade, no sound.
/// - Day-boundary transitions, armed natively at alert time (two alarms,
///   distinct ids):
///     · work-hours arrival: a silent same-id re-post at the next 22:00
///       replaces the ringing one (loop stops, reminder stays), plus an
///       insistent catch-up (id 3002) at the next 08:00 that auto-cancels
///       via timeoutAfter when quiet hours resume.
///     · quiet-hours arrival: an insistent same-id re-post at the next 08:00
///       replaces the silent one (ring starts, auto-cancels at 22:00), plus
///       a silent reminder (id 3003) at that 22:00.
///   An unacknowledged booking therefore silences at 22:00 and rings again
///   every 08:00 until acknowledged or the backend's 24h TTL auto-declines
///   it (the TTL bounds the chain to at most one catch-up).
/// - App open (any hour): always sounds — in-app banner + insistent 1001.
///   Pausing the app during quiet hours silences immediately
///   ([silenceIfQuietHours]); the 08:00 catch-up stays armed.
///
/// Stop conditions (any): `booking_resolved` push · queue opened (app
/// resumed / Dashboard tab) · notification tapped. All funnel through
/// [stopAlert], which cancels every id this service uses — visible
/// notification and pending boundary alarms alike.
///
/// Stylists only: owners never register a device token, so they never alert.
/// A 15s pending-count poll in HomeShell covers FCM outages while the app is
/// open. Everything here fails open — an alert failure must never break the
/// app.
library;

import 'dart:async';
import 'dart:ui' show DartPluginRegistrant;

import 'package:audioplayers/audioplayers.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:timezone/data/latest_10y.dart' as tzdata;
import 'package:timezone/timezone.dart' as tz;

import '../api.dart';

/// Top-level FCM background handler — runs in its own isolate when a push
/// arrives while the app is dead/backgrounded. Plugins and the timezone
/// database must be initialized per-isolate.
@pragma('vm:entry-point')
Future<void> fcmBackgroundHandler(RemoteMessage message) async {
  _nlog('bg: handler entry type=${message.data['type']}');
  DartPluginRegistrant.ensureInitialized();
  try {
    await Firebase.initializeApp();
  } catch (e) {
    _nlog('bg: Firebase.initializeApp failed: $e');
  }
  try {
    await NotificationService.instance
        .handleDataMessage(message.data, background: true);
  } catch (e) {
    // Never swallow silently in debug — this hid the bg-isolate bootstrap
    // failure during testing.
    _nlog('bg: handleDataMessage threw: $e');
  }
}

/// Debug trace for the alert pipeline. debugPrint works in background
/// isolates (lands in logcat); kDebugMode keeps release builds clean.
void _nlog(String msg) {
  if (kDebugMode) debugPrint('[notif] $msg');
}

class NotificationService {
  NotificationService._();
  static final NotificationService instance = NotificationService._();

  // ── Channels ───────────────────────────────────────────────────────────────
  static const _alarmChannelId = 'ayra_alerts';
  static const _silentChannelId = 'ayra_alerts_silent';

  // ── Notification ids ───────────────────────────────────────────────────────
  // 1001 is THE new-booking notification in every variant (insistent, silent,
  // catch-up). Posting a scheduled notification with the same id replaces the
  // visible one — that replacement is what STOPS the insistent sound at
  // 22:00 / STARTS it at 08:00 — and _fln.cancel(id: 1001) then wipes both
  // the visible notification and the pending boundary alarm in one call.
  // 3002/3003 are the second alarm of each pair (they must coexist with the
  // pending 1001 alarm, so they need their own ids).
  static const _immediateId = 1001;
  static const _catchUpId = 3002; // 08:00 catch-up (work-hours arrivals)
  static const _quietReminderId = 3003; // 22:00 silent reminder (quiet arrivals)

  // ── Work hours (local/IST) ─────────────────────────────────────────────────
  // Overridable at build time so quiet-hours transitions can be tested live
  // without waiting for the real 22:00 / 08:00. An optional minute part
  // (e.g. AYRA_WORK_END=14:37) puts the boundary minutes from now; the
  // defaults 8 / 22 keep whole-hour boundaries. Format: "H" or "H:MM".
  //   flutter build apk --dart-define=AYRA_WORK_START=14:05 --dart-define=AYRA_WORK_END=15
  static const _workStartDef =
      String.fromEnvironment('AYRA_WORK_START', defaultValue: '8');
  static const _workEndDef =
      String.fromEnvironment('AYRA_WORK_END', defaultValue: '22');

  static int _h(String v) => int.tryParse(v.split(':').first) ?? 0;
  static int _m(String v) {
    final p = v.split(':');
    return p.length > 1 ? (int.tryParse(p[1]) ?? 0) : 0;
  }

  static int get _startHour => _h(_workStartDef);
  static int get _startMinute => _m(_workStartDef);
  static int get _endHour => _h(_workEndDef);
  static int get _endMinute => _m(_workEndDef);
  static int get _startMinOfDay => _startHour * 60 + _startMinute;
  static int get _endMinOfDay => _endHour * 60 + _endMinute;

  /// The 08:00 catch-up notification auto-cancels when quiet hours resume —
  /// Android cancels the notification (and its insistent loop) when
  /// [Notification.timeoutAfter] elapses.
  static int get _catchUpTimeoutMs {
    final ms = (_endMinOfDay - _startMinOfDay) * 60000;
    return ms > 0 ? ms : 60000;
  }

  /// Android Notification.flags bit: FLAG_INSISTENT — the system repeats the
  /// notification sound until the notification is cancelled or opened.
  /// https://developer.android.com/reference/android/app/Notification#FLAG_INSISTENT
  static const _flagInsistent = 4;

  final FlutterLocalNotificationsPlugin _fln =
      FlutterLocalNotificationsPlugin();
  final AudioPlayer _player = AudioPlayer();

  bool _initialized = false;
  bool _flnReady = false;
  bool _alerting = false;
  bool _registering = false;
  String? _lastAlertedBookingId; // dedupe — survives acknowledge
  String? _fcmToken;
  Map<String, String>? _lastPayload; // for the pause-time silent re-post

  /// True while the pending queue is visible (Dashboard tab + resumed).
  /// A new booking then only dings once instead of looping.
  bool queueOpen = false;

  /// HomeShell sets this — called when a notification is tapped so the app
  /// lands on the pending queue (Dashboard tab).
  void Function()? onOpenQueue;

  /// HomeShell sets this — called when a booking arrives while the queue is
  /// already open (single-ding path) so the new row appears immediately
  /// instead of waiting for pull-to-refresh.
  void Function()? onQueueBookingArrived;

  /// Fires with the alert payload when an alert starts, null when it stops.
  /// HomeShell shows/hides the in-app banner from this.
  final ValueNotifier<Map<String, String>?> alertEvent =
      ValueNotifier<Map<String, String>?>(null);

  bool get isAlerting => _alerting;

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  /// Call once from main() after Firebase.initializeApp().
  Future<void> init() async {
    if (_initialized) return;
    _initialized = true;
    _initTimezone();
    await _ensureFln();
    await _createChannels();
    // A notification may have launched the app — that counts as opening the
    // queue: stop the alarm and let HomeShell take over via onOpenQueue.
    try {
      final launch = await _fln.getNotificationAppLaunchDetails();
      if (launch?.didNotificationLaunchApp == true) _handleOpened();
    } catch (_) {}

    FirebaseMessaging.onMessage.listen(
        (m) => handleDataMessage(m.data, background: false));
    FirebaseMessaging.onMessageOpenedApp.listen((_) => _handleOpened());
    unawaited(FirebaseMessaging.instance.getInitialMessage().then((m) {
      if (m != null) _handleOpened();
    }));
    FirebaseMessaging.instance.onTokenRefresh.listen((token) {
      _fcmToken = token;
      unawaited(syncDeviceToken());
    });
  }

  void _initTimezone() {
    try {
      tzdata.initializeTimeZones();
      // The salon operates on IST; all hour boundaries are computed locally.
      tz.setLocalLocation(tz.getLocation('Asia/Kolkata'));
      _nlog('tz init ok: ${tz.local.name}');
    } catch (e) {
      _nlog('tz init threw: $e');
    }
  }

  Future<void> _ensureFln() async {
    if (_flnReady) return;
    await _fln.initialize(
      settings: const InitializationSettings(
        android: AndroidInitializationSettings('ic_notification'),
      ),
      onDidReceiveNotificationResponse: (_) => _handleOpened(),
    );
    _flnReady = true;
  }

  Future<void> _createChannels() async {
    try {
      final android = _fln.resolvePlatformSpecificImplementation<
          AndroidFlutterLocalNotificationsPlugin>();
      await android?.createNotificationChannel(const AndroidNotificationChannel(
        _alarmChannelId,
        'New booking alerts',
        description: 'Insistent alert when a customer books your chair',
        importance: Importance.max,
        playSound: true,
        sound: RawResourceAndroidNotificationSound('alert_chime'),
        enableVibration: true,
        audioAttributesUsage: AudioAttributesUsage.alarm,
      ));
      await android?.createNotificationChannel(const AndroidNotificationChannel(
        _silentChannelId,
        'In-app alerts',
        description: 'Silent alert outside salon hours',
        importance: Importance.max,
        playSound: false,
        enableVibration: false,
      ));
    } catch (_) {}
  }

  // ── Push handling ──────────────────────────────────────────────────────────

  /// Entry point for both FCM data messages and the polling fallback.
  Future<void> handleDataMessage(
    Map<String, dynamic> data, {
    required bool background,
  }) async {
    final sw = Stopwatch()..start();
    try {
      _initTimezone();
    } catch (e) {
      _nlog('tz init failed: $e');
    }
    try {
      await _ensureFln();
    } catch (e) {
      _nlog('fln init failed: $e');
    }
    _nlog('handleDataMessage: bootstrap '
        '${sw.elapsedMilliseconds}ms tz=${tz.local.name} '
        'bg=$background type=${data['type']}');
    final payload = <String, String>{
      for (final e in data.entries) e.key: e.value?.toString() ?? '',
    };
    final type = payload['type'];
    if (type == 'new_booking') {
      _nlog('dispatch: new_booking -> _startAlert');
      await _startAlert(payload, background: background);
    } else if (type == 'booking_resolved') {
      _nlog('dispatch: booking_resolved -> stopAlert');
      await stopAlert();
    }
  }

  Future<void> _startAlert(
    Map<String, String> data, {
    required bool background,
  }) async {
    final bookingId = data['booking_id'] ?? '';
    // Dedupe on the marker alone (not `isAlerting`): the marker survives
    // stopAlert, so the 15s poll never re-alarms a booking the stylist was
    // already alarmed about. clearSeenBooking() resets it when the pending
    // queue empties.
    if (bookingId.isNotEmpty && bookingId == _lastAlertedBookingId) return;
    await stopAlert(); // one alarm at a time — reset for the new booking
    _alerting = true;
    _lastAlertedBookingId = bookingId;

    // The stylist is looking at the pending queue — one chime is enough;
    // HomeShell refreshes the dashboard so the booking appears. No
    // notification, no boundary alarms.
    if (!background && queueOpen) {
      await _ding();
      onQueueBookingArrived?.call();
      return;
    }

    // App open (any hour) sounds — using the dashboard counts as reachable.
    // Background follows the work-hours window.
    final insistent = background ? _isWorkHours() : true;
    _nlog('startAlert: bg=$background queueOpen=$queueOpen '
        'insistent=$insistent now=${tz.TZDateTime.now(tz.local)} '
        'window=$_startHour:${_startMinute.toString().padLeft(2, '0')}'
        '-$_endHour:${_endMinute.toString().padLeft(2, '0')}');
    _lastPayload = data;
    await _show(
      _immediateId,
      'New booking awaiting approval',
      _alertBody(data),
      insistent
          ? _alarmDetails(timeoutAfterMs: _msUntilBoundary())
          : _silentDetails,
    );
    await _scheduleDayTransitions(
      _alertBody(data),
      insistentNow: insistent,
    );

    if (!background) alertEvent.value = data;
  }

  /// Called by HomeShell when the app is paused during quiet hours: replaces
  /// the insistent notification with its silent twin so the sound stops the
  /// moment the stylist leaves the app. The pending 08:00 catch-up alarm
  /// (same id) stays armed. During work hours this is a no-op — the alert
  /// keeps sounding in the background, as designed.
  Future<void> silenceIfQuietHours() async {
    if (!_alerting || _isWorkHours()) return;
    await _show(
      _immediateId,
      'New booking awaiting approval',
      _alertBody(_lastPayload ?? const {}),
      _silentDetails,
    );
  }

  /// Stops everything. Idempotent. Deliberately does NOT clear
  /// [_lastAlertedBookingId] — the poll must not re-alert for a booking the
  /// stylist has already been alarmed about; [clearSeenBooking] does that.
  Future<void> stopAlert() async {
    _alerting = false;
    _lastPayload = null;
    try {
      await _player.stop();
    } catch (_) {}
    try {
      // Cancels the visible notification AND any pending day-boundary alarm
      // sharing these ids.
      await _fln.cancel(id: _immediateId);
      await _fln.cancel(id: _catchUpId);
      await _fln.cancel(id: _quietReminderId);
    } catch (_) {}
    if (alertEvent.value != null) alertEvent.value = null;
  }

  /// Clears the dedupe marker — call when the pending count reaches 0 so a
  /// future booking from the same flow alerts again.
  void clearSeenBooking() => _lastAlertedBookingId = null;

  void _handleOpened() {
    unawaited(stopAlert());
    onOpenQueue?.call();
  }

  // ── Presentation ───────────────────────────────────────────────────────────

  /// Insistent heads-up: alarm channel, raw chime, bypasses DND; the OS
  /// repeats the sound until the notification is replaced or cancelled.
  /// [timeoutAfterMs] is a belt-and-braces stop: even if a same-id
  /// replacement were missed, Android cancels the notification (and its
  /// loop) when the timeout elapses.
  NotificationDetails _alarmDetails({int? timeoutAfterMs}) =>
      NotificationDetails(
        android: AndroidNotificationDetails(
          _alarmChannelId,
          'New booking alerts',
          channelDescription:
              'Insistent alert when a customer books your chair',
          importance: Importance.max,
          priority: Priority.max,
          category: AndroidNotificationCategory.alarm,
          playSound: true,
          sound: RawResourceAndroidNotificationSound('alert_chime'),
          audioAttributesUsage: AudioAttributesUsage.alarm,
          enableVibration: true,
          fullScreenIntent: true,
          autoCancel: true,
          additionalFlags: Int32List.fromList([_flagInsistent]),
          timeoutAfter: timeoutAfterMs,
        ),
      );

  /// Same urgency (heads-up banner) but no sound, no vibration — used
  /// during quiet hours.
  NotificationDetails get _silentDetails => const NotificationDetails(
        android: AndroidNotificationDetails(
          _silentChannelId,
          'In-app alerts',
          channelDescription: 'Silent alert outside salon hours',
          importance: Importance.max,
          priority: Priority.max,
          playSound: false,
          enableVibration: false,
          autoCancel: true,
        ),
      );

  Future<void> _show(int id, String title, String body,
      NotificationDetails details) async {
    try {
      await _fln.show(
        id: id,
        title: title,
        body: body,
        notificationDetails: details,
        payload: 'new_booking',
      );
      _nlog('show id=$id ok');
    } catch (e) {
      _nlog('show id=$id failed: $e');
    }
  }

  /// Arms the next two day-boundary re-posts for the current alert. All
  /// re-posts carry the same title/body so any variant reads identically.
  ///
  /// - Ringing now (work-hours arrival): silence it at the next 22:00 with a
  ///   same-id silent re-post (replacement stops the loop, reminder stays),
  ///   and arm the 08:00 catch-up on its own id (auto-cancels at 22:00).
  /// - Silent now (quiet-hours arrival): ring at the next 08:00 with a
  ///   same-id insistent re-post (replacement starts the loop, timeout
  ///   stops it at 22:00), and keep a silent reminder past that boundary.
  Future<void> _scheduleDayTransitions(
    String body, {
    required bool insistentNow,
  }) async {
    const title = 'New booking awaiting approval';
    if (insistentNow) {
      await _scheduleAtBoundary(
        _immediateId,
        _silentDetails,
        _nextBoundary(_endHour, _endMinute),
        title,
        body,
      );
      await _scheduleAtBoundary(
        _catchUpId,
        _alarmDetails(timeoutAfterMs: _catchUpTimeoutMs),
        _nextBoundary(_startHour, _startMinute),
        title,
        body,
      );
    } else {
      await _scheduleAtBoundary(
        _immediateId,
        _alarmDetails(timeoutAfterMs: _catchUpTimeoutMs),
        _nextBoundary(_startHour, _startMinute),
        title,
        body,
      );
      await _scheduleAtBoundary(
        _quietReminderId,
        _silentDetails,
        _nextBoundary(_endHour, _endMinute),
        title,
        body,
      );
    }
  }

  /// Next occurrence of [hour]:[minute] local time, always at least a minute
  /// in the future so the alarm is never scheduled in the past.
  tz.TZDateTime _nextBoundary(int hour, [int minute = 0]) {
    final now = tz.TZDateTime.now(tz.local);
    var when =
        tz.TZDateTime(tz.local, now.year, now.month, now.day, hour, minute);
    if (!when.isAfter(now.add(const Duration(minutes: 1)))) {
      when = when.add(const Duration(days: 1));
    }
    return when;
  }

  /// Grace margin added to timeoutAfter so the OS cancel never races the
  /// same-instant boundary re-post. On some OEM builds (MIUI 13 / Android 12)
  /// the timeout cancel wins and swallows the silent replacement, leaving no
  /// record at all. With the margin the alarm's silent re-post always lands
  /// first; the timeout only matters if the boundary alarm is lost entirely.
  static const _timeoutGraceMs = 30000;

  int _msUntilBoundary() {
    final diff = _nextBoundary(_endHour, _endMinute)
        .difference(tz.TZDateTime.now(tz.local));
    return diff.inMilliseconds + _timeoutGraceMs;
  }

  Future<void> _scheduleAtBoundary(
    int id,
    NotificationDetails details,
    tz.TZDateTime when,
    String title,
    String body,
  ) async {
    try {
      await _fln.zonedSchedule(
        id: id,
        title: title,
        body: body,
        scheduledDate: when,
        notificationDetails: details,
        androidScheduleMode: AndroidScheduleMode.exactAllowWhileIdle,
        payload: 'new_booking',
      );
      _nlog('scheduled id=$id @ $when (exact)');
    } on PlatformException catch (e) {
      // Android 14+ may deny SCHEDULE_EXACT_ALARM; inexact still fires
      // within a minute or so via setAndAllowWhileIdle.
      _nlog('exact schedule id=$id failed: ${e.code} — retry inexact');
      try {
        await _fln.zonedSchedule(
          id: id,
          title: title,
          body: body,
          scheduledDate: when,
          notificationDetails: details,
          androidScheduleMode: AndroidScheduleMode.inexactAllowWhileIdle,
          payload: 'new_booking',
        );
        _nlog('scheduled id=$id @ $when (inexact)');
      } catch (e2) {
        _nlog('inexact schedule id=$id also failed: $e2');
      }
    } catch (e) {
      _nlog('schedule id=$id threw: $e');
    }
  }

  bool _isWorkHours() {
    final now = tz.TZDateTime.now(tz.local);
    final nowMinOfDay = now.hour * 60 + now.minute;
    return nowMinOfDay >= _startMinOfDay && nowMinOfDay < _endMinOfDay;
  }

  Future<void> _configureAlarmStream({required bool stayAwake}) async {
    await _player.setAudioContext(AudioContext(
      android: AudioContextAndroid(
        isSpeakerphoneOn: false,
        stayAwake: stayAwake,
        contentType: AndroidContentType.sonification,
        usageType: AndroidUsageType.alarm,
        audioFocus: AndroidAudioFocus.gainTransient,
      ),
    ));
  }

  /// Single chime for the queue-open case.
  Future<void> _ding() async {
    try {
      await _player.stop();
      await _player.setReleaseMode(ReleaseMode.release);
      await _configureAlarmStream(stayAwake: false);
      await _player.play(AssetSource('sounds/alert_chime.wav'));
    } catch (_) {}
  }

  String _alertBody(Map<String, String> data) {
    final when = [
      data['date'] ?? '',
      data['time_slot'] ?? '',
    ].where((s) => s.isNotEmpty).join(' ');
    final parts = <String>[
      if ((data['customer_name'] ?? '').isNotEmpty) data['customer_name']!,
      if ((data['services'] ?? '').isNotEmpty) data['services']!,
      if (when.isNotEmpty) when,
    ];
    return parts.isEmpty ? 'Open the dashboard to approve.' : parts.join(' · ');
  }

  // ── Device token (stylist only) ────────────────────────────────────────────

  /// Registers the FCM token with the backend for the signed-in stylist.
  /// Owners are skipped — no device, no alerts. Fail-open: the 15s
  /// pending-count polling still alerts if this fails.
  Future<void> syncDeviceToken() async {
    if (_registering) return;
    final user = Api.instance.user;
    if (user == null || !user.isStylist) return;
    _registering = true;
    try {
      await _requestPermissions();
      _fcmToken ??= await FirebaseMessaging.instance.getToken();
      final token = _fcmToken;
      if (token == null || token.isEmpty) return;
      await Api.instance.registerDeviceToken(token, platform: 'android');
    } on ApiException {
      // Server unreachable / 403 — polling covers alerts.
    } catch (_) {
    } finally {
      _registering = false;
    }
  }

  Future<void> _requestPermissions() async {
    try {
      final android = _fln.resolvePlatformSpecificImplementation<
          AndroidFlutterLocalNotificationsPlugin>();
      await android?.requestNotificationsPermission();
    } catch (_) {}
  }

  /// Call BEFORE Api.logout() (the DELETE needs the still-valid JWT).
  /// Best-effort unregister so the salon's next stylist on this device
  /// doesn't inherit alerts.
  Future<void> onSignedOut() async {
    await stopAlert();
    final token = _fcmToken;
    _fcmToken = null;
    if (token != null && token.isNotEmpty) {
      try {
        await Api.instance.unregisterDeviceToken(token);
      } catch (_) {}
    }
  }
}
