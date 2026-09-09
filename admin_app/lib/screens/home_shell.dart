import 'dart:async';

import 'package:flutter/material.dart';

import '../api.dart';
import '../services/notification_service.dart';
import '../theme.dart';
import 'dashboard_screen.dart';
import 'economy_screen.dart';
import 'login_screen.dart';
import 'new_appointment_screen.dart';
import 'schedule_screen.dart';
import 'timeoff_screen.dart';
import 'whatsapp_screen.dart';

/// Bottom-nav shell: Dashboard · Schedule · New · Time Off · Economy ·
/// WhatsApp. Any screen can trigger a global refresh via [refreshAll] after
/// a mutation.
class HomeShell extends StatefulWidget {
  const HomeShell({super.key});

  @override
  State<HomeShell> createState() => HomeShellState();
}

class HomeShellState extends State<HomeShell> with WidgetsBindingObserver {
  int _tab = 0;
  int _lastTab = 0;
  final GlobalKey<DashboardScreenState> _dashboardKey = GlobalKey();
  final GlobalKey<WhatsAppScreenState> _whatsappKey = GlobalKey();
  final GlobalKey<TimeOffScreenState> _timeOffKey = GlobalKey();
  final GlobalKey<EconomyScreenState> _economyKey = GlobalKey();
  final GlobalKey<ScheduleScreenState> _scheduleKey = GlobalKey();
  /// Called by child screens after mutations so all tabs refetch.
  void refreshAll() {
    _dashboardKey.currentState?.refresh();
    _scheduleKey.currentState?.refresh();
    _whatsappKey.currentState?.refresh();
    _timeOffKey.currentState?.refresh();
    _economyKey.currentState?.refresh();
  }

  // ── New-booking alerting (stylists only) ───────────────────────────────────
  Timer? _pollTimer;
  bool _polling = false;
  bool _isStylist = false;
  bool _alertBannerShown = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _isStylist = Api.instance.user?.isStylist ?? false;
    if (_isStylist) {
      final svc = NotificationService.instance;
      svc.onOpenQueue = _openQueue;
      svc.onQueueBookingArrived = () => _dashboardKey.currentState?.refresh();
      // The app always mounts on the Dashboard tab — the pending queue is
      // visible from the first frame, so a booking arriving before any tab
      // switch or lifecycle event must single-ding, not loop.
      svc.queueOpen = true;
      unawaited(svc.syncDeviceToken());
      // FCM outage safety net: poll the pending count every 15s while open.
      _pollTimer = Timer.periodic(const Duration(seconds: 15), (_) => _poll());
      _poll();
      svc.alertEvent.addListener(_onAlertEvent);
      // Restore session mid-alert (e.g. app killed and relaunched): the
      // queue is visible on the Dashboard, so acknowledge immediately.
      if (svc.isAlerting) {
        _queueOpened();
      }
    }
  }

  Future<void> _poll() async {
    if (_polling || !mounted) return;
    _polling = true;
    try {
      final data = await Api.instance.pendingCount();
      final count = (data['count'] as num?)?.toInt() ?? 0;
      final latestId = data['latest_id']?.toString();
      final svc = NotificationService.instance;
      if (count > 0) {
        if (!svc.isAlerting) {
          // Poll-discovered booking — alert with synthetic payload fields so
          // the notification/banner shows something useful.
          await svc.handleDataMessage({
            'type': 'new_booking',
            'booking_id': latestId ?? 'poll',
          }, background: false);
        }
      } else {
        svc.clearSeenBooking();
        await svc.stopAlert();
      }
    } on ApiException {
      // 403 (owner) / offline — silence is correct here.
    } catch (_) {
      // Offline etc. — retry on the next tick.
    } finally {
      _polling = false;
    }
  }

  void _onAlertEvent() {
    final active = NotificationService.instance.alertEvent.value != null;
    if (!mounted) return;
    if (active == _alertBannerShown) return;
    setState(() => _alertBannerShown = active);
  }

  /// Queue is now visible → acknowledge: stop the insistent alarm, drop the
  /// banner, and refresh so the new booking is actually on screen.
  void _queueOpened() {
    NotificationService.instance.queueOpen = true;
    unawaited(NotificationService.instance.stopAlert());
    _dashboardKey.currentState?.refresh();
  }

  /// Notification tap → land on the Dashboard (pending queue) and refresh.
  void _openQueue() {
    if (!mounted) return;
    setState(() {
      _lastTab = _tab;
      _tab = 0;
    });
    _queueOpened();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (!_isStylist) return;
    if (state == AppLifecycleState.resumed) {
      // Coming back to the app with the Dashboard visible = queue open.
      if (_tab == 0) _queueOpened();
      // Restart the poll (cancelled on pause) and catch up immediately.
      _pollTimer ??= Timer.periodic(const Duration(seconds: 15), (_) => _poll());
      unawaited(_poll());
    } else if (state == AppLifecycleState.inactive ||
        state == AppLifecycleState.paused) {
      // Left the app (Home / recents / screen off): the queue is no longer
      // on screen, and the poll must stand down — the FCM background
      // isolate owns alerting now. Two reasons: queueOpen stuck true would
      // make a poll-discovered booking bare-ding with NO notification (the
      // "heard it but nothing in the shade" symptom), and the poll's
      // per-isolate dedupe can't see the background isolate's alert, so it
      // would cancel the 1001 heads-up 15s later and downgrade it.
      NotificationService.instance.queueOpen = false;
      // Foreground alerting ends when the app does. During quiet hours the
      // insistent sound must stop the moment the stylist leaves the app —
      // this swaps 1001 for its silent twin; the 08:00 catch-up stays armed.
      unawaited(NotificationService.instance.silenceIfQuietHours());
      _pollTimer?.cancel();
      _pollTimer = null;
    }
  }

  Future<void> handleAuthError() async {
    await NotificationService.instance.onSignedOut();
    await Api.instance.logout();
    if (!mounted) return;
    Navigator.of(context, rootNavigator: true).pushAndRemoveUntil(
      MaterialPageRoute(builder: (_) => const LoginScreen()),
      (_) => false,
    );
  }

  @override
  void dispose() {
    if (_isStylist) {
      NotificationService.instance.alertEvent.removeListener(_onAlertEvent);
      NotificationService.instance.onOpenQueue = null;
      NotificationService.instance.onQueueBookingArrived = null;
      NotificationService.instance.queueOpen = false;
    }
    _pollTimer?.cancel();
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    // Economy is owner-only on the backend (salon-wide money). Stylists get
    // their own earnings on the Dashboard instead — the tab simply doesn't
    // exist for them, so no economy call can 403.
    final screens = [
      DashboardScreen(key: _dashboardKey, shell: this),
      ScheduleScreen(key: _scheduleKey, shell: this),
      NewAppointmentScreen(shell: this),
      TimeOffScreen(key: _timeOffKey, shell: this),
      if (!_isStylist) EconomyScreen(key: _economyKey, shell: this),
      WhatsAppScreen(key: _whatsappKey, shell: this),
    ];
    return Scaffold(
      body: Column(
        children: [
          if (_alertBannerShown) _AlertBanner(onOpen: _openQueue),
          Expanded(
            child: IndexedStack(
              index: _tab,
              children: [
                for (var i = 0; i < screens.length; i++)
                  _TabTransition(
                    active: i == _tab,
                    direction: i > _lastTab ? 1 : -1,
                    child: screens[i],
                  ),
              ],
            ),
          ),
        ],
      ),
      bottomNavigationBar: NavigationBar(
        backgroundColor: emerald900,
        indicatorColor: emerald700,
        selectedIndex: _tab,
        onDestinationSelected: (i) {
          if (i == _tab) return;
          setState(() {
            _lastTab = _tab;
            _tab = i;
          });
          if (_isStylist) {
            // Dashboard = the pending queue. Arriving there acknowledges the
            // alarm; leaving it re-arms insistent alerting.
            if (i == 0) {
              _queueOpened();
            } else {
              NotificationService.instance.queueOpen = false;
            }
          }
        },
        destinations: [
          const NavigationDestination(
            icon: Icon(Icons.calendar_month_outlined),
            selectedIcon: Icon(Icons.calendar_month),
            label: 'Dashboard',
          ),
          const NavigationDestination(
            icon: Icon(Icons.view_timeline_outlined),
            selectedIcon: Icon(Icons.view_timeline),
            label: 'Schedule',
          ),
          const NavigationDestination(
            icon: Icon(Icons.add_circle_outline),
            selectedIcon: Icon(Icons.add_circle),
            label: 'New',
          ),
          const NavigationDestination(
            icon: Icon(Icons.event_busy_outlined),
            selectedIcon: Icon(Icons.event_busy),
            label: 'Time Off',
          ),
          if (!_isStylist)
            const NavigationDestination(
              icon: Icon(Icons.currency_rupee_outlined),
              selectedIcon: Icon(Icons.currency_rupee),
              label: 'Economy',
            ),
          const NavigationDestination(
            icon: Icon(Icons.chat_bubble_outline),
            selectedIcon: Icon(Icons.chat_bubble),
            label: 'WhatsApp',
          ),
        ],
      ),
    );
  }
}

/// Tab entrance — the newly selected tab slides in from the direction of
/// travel with a quick fade. IndexedStack keeps every tab's state alive;
/// only the entrance is animated. Initial state is fully visible (no flash
/// on app start), and the system reduced-motion setting disables the slide.
class _TabTransition extends StatefulWidget {
  final bool active;
  final int direction; // +1 enters from the right, -1 from the left
  final Widget child;
  const _TabTransition({
    required this.active,
    required this.direction,
    required this.child,
  });

  @override
  State<_TabTransition> createState() => _TabTransitionState();
}

class _TabTransitionState extends State<_TabTransition>
    with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 240),
    value: 1,
  );
  late final Animation<double> _a = CurvedAnimation(
    parent: _c,
    curve: Curves.easeOutCubic,
  );
  bool _reduced = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _reduced = MediaQuery.maybeDisableAnimationsOf(context) ?? false;
  }

  @override
  void didUpdateWidget(_TabTransition old) {
    super.didUpdateWidget(old);
    if (widget.active && !old.active) {
      if (_reduced) {
        _c.value = 1;
      } else {
        _c.forward(from: 0);
      }
    } else if (!widget.active && old.active) {
      _c.value = 1; // hidden anyway; reset so the next entrance is clean
    }
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return FadeTransition(
      opacity: _a,
      child: SlideTransition(
        position: Tween<Offset>(
          begin: Offset(widget.direction * 0.06, 0),
          end: Offset.zero,
        ).animate(_a),
        child: widget.child,
      ),
    );
  }
}

/// In-app alert banner shown while the insistent alarm is active and the
/// stylist is elsewhere in the app (queue not open). Tapping it opens the
/// queue and stops the alarm.
class _AlertBanner extends StatelessWidget {
  final VoidCallback onOpen;
  const _AlertBanner({required this.onOpen});

  @override
  Widget build(BuildContext context) {
    final data = NotificationService.instance.alertEvent.value;
    return Material(
      color: emerald950,
      child: SafeArea(
        bottom: false,
        child: InkWell(
          onTap: onOpen,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            child: Row(
              children: [
                const Icon(Icons.notifications_active,
                    color: amber400, size: 22),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Text(
                        'New booking awaiting approval',
                        style: TextStyle(
                          color: cream,
                          fontWeight: FontWeight.w600,
                          fontSize: 14,
                        ),
                      ),
                      if (data != null &&
                          (data['customer_name'] ?? '').isNotEmpty)
                        Text(
                          data['customer_name']!,
                          style: const TextStyle(
                              color: emerald300, fontSize: 12),
                        ),
                    ],
                  ),
                ),
                const Icon(Icons.chevron_right, color: emerald300),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
