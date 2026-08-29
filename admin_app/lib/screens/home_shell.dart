import 'package:flutter/material.dart';

import '../api.dart';
import '../theme.dart';
import 'dashboard_screen.dart';
import 'login_screen.dart';
import 'new_appointment_screen.dart';
import 'whatsapp_screen.dart';

/// Bottom-nav shell: Dashboard · New · WhatsApp. Any screen can trigger a
/// global refresh via [refreshAll] after a mutation.
class HomeShell extends StatefulWidget {
  const HomeShell({super.key});

  @override
  State<HomeShell> createState() => HomeShellState();
}

class HomeShellState extends State<HomeShell> {
  int _tab = 0;
  int _lastTab = 0;
  final GlobalKey<DashboardScreenState> _dashboardKey = GlobalKey();
  final GlobalKey<WhatsAppScreenState> _whatsappKey = GlobalKey();

  /// Called by child screens after mutations so all tabs refetch.
  void refreshAll() {
    _dashboardKey.currentState?.refresh();
    _whatsappKey.currentState?.refresh();
  }

  Future<void> handleAuthError() async {
    await Api.instance.logout();
    if (!mounted) return;
    Navigator.of(context, rootNavigator: true).pushAndRemoveUntil(
      MaterialPageRoute(builder: (_) => const LoginScreen()),
      (_) => false,
    );
  }

  @override
  Widget build(BuildContext context) {
    final screens = [
      DashboardScreen(key: _dashboardKey, shell: this),
      NewAppointmentScreen(shell: this),
      WhatsAppScreen(key: _whatsappKey, shell: this),
    ];
    return Scaffold(
      body: IndexedStack(
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
        },
        destinations: const [
          NavigationDestination(
            icon: Icon(Icons.calendar_month_outlined),
            selectedIcon: Icon(Icons.calendar_month),
            label: 'Dashboard',
          ),
          NavigationDestination(
            icon: Icon(Icons.add_circle_outline),
            selectedIcon: Icon(Icons.add_circle),
            label: 'New',
          ),
          NavigationDestination(
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
