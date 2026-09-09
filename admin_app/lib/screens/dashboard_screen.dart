import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../api.dart';
import '../models.dart' as m;
import '../services/notification_service.dart';
import '../slots.dart';
import '../theme.dart';
import 'home_shell.dart';

class DashboardScreen extends StatefulWidget {
  final HomeShellState shell;
  const DashboardScreen({super.key, required this.shell});

  @override
  State<DashboardScreen> createState() => DashboardScreenState();
}

class DashboardScreenState extends State<DashboardScreen> {
  List<m.BookingModel> _bookings = [];
  List<m.BookingModel> _pending = [];
  List<m.BookingModel> _awaiting = [];
  bool _loading = true;
  String? _error;
  String? _selectedDate; // IST yyyy-MM-dd — defaults to today; null = all dates
  String? _actingId; // booking currently being mutated (spinner on its buttons)
  m.StylistsAvailable? _roster; // off-day roster for the banner date
  // Upcoming approved time-off ranges — all staff (GET /stylists/time-off/
  // upcoming returns every range from today on) — Bug 1 parity with web.
  List<m.TimeOffModel> _upcomingOff = [];
  Map<String, String> _stylistNames = {};
  // The stylist's OWN earnings (owner stays null — they see salon stats).
  m.StylistMeSummaryModel? _meSummary;

  @override
  void initState() {
    super.initState();
    // The dashboard opens on TODAY — the owner/stylist cares about the
    // current day first; the full datewise list lives on the Schedule tab.
    _selectedDate = istToday();
    refresh();
  }

  /// Stylists act only on their own chair — a booking is theirs when one of
  /// its slot rows (or the legacy single-stylist field) names them. The
  /// backend already scopes adminBookings; this is a defensive client filter.
  bool _ownChair(m.BookingModel b) {
    final me = Api.instance.user;
    if (me == null || !me.isStylist || me.stylistId == null) return true;
    final sid = me.stylistId!;
    final ids = b.slots
        .map((sl) => sl.stylist?.id ?? '')
        .where((s) => s.isNotEmpty)
        .toSet();
    if (ids.isNotEmpty) return ids.contains(sid);
    return b.stylist?.id == sid;
  }

  Future<void> refresh() async {
    setState(() {
      _loading = _bookings.isEmpty;
      _error = null;
    });
    _loadRoster();
    _loadMeSummary();
    _loadUpcomingOff();
    try {
      final results = await Future.wait([
        Api.instance.adminBookings(date: _selectedDate),
        Api.instance.adminBookings(),
      ]);
      final all = results[1]
          .map((e) => m.BookingModel.fromJson(e))
          .where(_ownChair)
          .toList();
      if (!mounted) return;
      setState(() {
        _bookings = results[0]
            .map((e) => m.BookingModel.fromJson(e))
            .where(_ownChair)
            .toList();
        _pending = all.where((b) => b.status == 'pending').toList();
        _awaiting = all
            .where((b) => b.status == 'awaiting_reschedule')
            .toList();
        _loading = false;
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      if (e.isAuthError) return widget.shell.handleAuthError();
      setState(() {
        _error = e.message;
        _loading = false;
      });
    }
  }

  /// Off-day banner data — /stylists/available for the visible day (the
  /// selected filter date, else IST today). Fail-open: on error the banner
  /// just hides; the dashboard must not depend on it.
  Future<void> _loadRoster() async {
    try {
      final roster =
          await Api.instance.stylistsAvailable(_selectedDate ?? istToday());
      if (!mounted) return;
      setState(() => _roster = roster);
    } on ApiException {
      if (!mounted) return;
      setState(() => _roster = null);
    }
  }

  /// The stylist's own earnings strip (GET /economy/me/summary). Only called
  /// for stylists; the owner never sees the strip. Fail-open: on error the
  /// strip stays on its last values or hides.
  Future<void> _loadMeSummary() async {
    final me = Api.instance.user;
    if (me == null || !me.isStylist) return;
    try {
      final s = await Api.instance.meSummary();
      if (!mounted) return;
      setState(() => _meSummary = s);
    } on ApiException {
      if (!mounted) return;
      // Leave whatever we had; a transient failure shouldn't blank the strip.
    }
  }

  /// Upcoming approved time-off ranges — Bug 1 parity with the web panel.
  /// Names resolved via the public /stylists list (the time-off rows carry
  /// only stylist_id). Fail-open like the roster.
  Future<void> _loadUpcomingOff() async {
    try {
      final rows = await Api.instance.upcomingTimeOff();
      final stylists = await Api.instance.stylists();
      if (!mounted) return;
      setState(() {
        _upcomingOff = rows;
        _stylistNames = {
          for (final s in stylists)
            s['id'].toString(): (s['name'] as String?) ?? 'Stylist',
        };
      });
    } on ApiException {
      if (!mounted) return;
      setState(() {
        _upcomingOff = [];
        _stylistNames = {};
      });
    }
  }

  Future<void> _act(
    String id,
    Future<void> Function() fn,
    String successMsg,
  ) async {
    setState(() => _actingId = id);
    try {
      await fn();
      if (!mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(successMsg)));
      await refresh();
      widget.shell.refreshAll();
    } on ApiException catch (e) {
      if (!mounted) return;
      if (e.isAuthError) return widget.shell.handleAuthError();
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(e.message)));
    } finally {
      if (mounted) setState(() => _actingId = null);
    }
  }

  Future<void> _pickDate() async {
    final initial = _selectedDate != null
        ? DateTime.tryParse(_selectedDate!)
        : DateTime.now();
    final picked = await pickAyraDate(
      context,
      initialDate: initial ?? DateTime.now(),
      firstDate: DateTime(2024),
      lastDate: DateTime.now().add(const Duration(days: 365)),
      helpText: 'Filter bookings by date',
    );
    if (picked == null) return;
    setState(() => _selectedDate = isoDate(picked));
    refresh();
  }

  void _openReschedule(m.BookingModel b) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: emerald900,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => _RescheduleSheet(
        booking: b,
        onDone: () {
          Navigator.of(context).pop();
          refresh();
          widget.shell.refreshAll();
        },
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final confirmed = _bookings.where((b) => b.status == 'confirmed').toList()
      ..sort((a, b) => a.firstSlotTime.compareTo(b.firstSlotTime));
    final cancelled = _bookings.where((b) => b.status == 'cancelled').toList();
    final revenue = confirmed.fold<num>(0, (s, b) => s + b.totalPrice);

    // The dashboard has no AppBar of its own, so it must clear the status
    // bar itself (the other tabs own a Scaffold+AppBar and already do).
    final list = RefreshIndicator(
      color: gold500,
      backgroundColor: emerald900,
      onRefresh: refresh,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
        children: [
          // ── Header ──────────────────────────────────────────────────────────
          Reveal(
            child: Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Eyebrow(
                        Api.instance.user?.isStylist == true
                            ? 'Your Chair · ${Api.instance.user?.name ?? ''}'
                            : 'Admin Panel',
                        color: Api.instance.user?.isStylist == true
                            ? emerald300
                            : null,
                      ),
                      const SizedBox(height: 6),
                      Text(
                        Api.instance.user?.isStylist == true
                            ? 'My Dashboard'
                            : 'Daily Dashboard',
                        style: const TextStyle(
                          fontSize: 28,
                          fontWeight: FontWeight.w600,
                          color: cream,
                        ),
                      ),
                      const GoldRule(),
                      if (Api.instance.user?.isStylist == true) ...[
                        const SizedBox(height: 8),
                        Text(
                          'Everything here is your own schedule and your own earnings.',
                          style: const TextStyle(
                              color: emerald300, fontSize: 12),
                        ),
                      ],
                    ],
                  ),
                ),
                IconButton(
                  tooltip: 'Sign out',
                  onPressed: () async {
                    // Unregister the device token while the JWT still works,
                    // and kill any active alarm before tearing down state.
                    await NotificationService.instance.onSignedOut();
                    await Api.instance.logout();
                    if (!context.mounted) return;
                    widget.shell.handleAuthError();
                  },
                  icon: const Icon(Icons.logout, color: emerald300),
                ),
              ],
            ),
          ),
          const SizedBox(height: 20),

          // ── Off-day banner (who is marked off for the visible day) ─────────
          if ((_roster != null && _roster!.off.isNotEmpty) ||
              _upcomingOff.isNotEmpty) ...[
            Reveal(
              delay: const Duration(milliseconds: 20),
              child: GlassCard(
                border: amber400.withValues(alpha: 0.45),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if (_roster != null && _roster!.off.isNotEmpty)
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Icon(Icons.event_busy,
                              size: 18, color: amber400),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Text(
                              'Off ${fmtDateStrIndian(_roster!.date)}: '
                              '${_roster!.off.map((s) => s.stylist.name).join(', ')}'
                              ' — their exclusive services are hidden from online booking.',
                              style: const TextStyle(
                                  color: amber400, fontSize: 12.5),
                            ),
                          ),
                        ],
                      ),
                    // Bug 1: upcoming approved time-off, all staff (owner) or
                    // self (stylist) — mirrors the web dashboard banner.
                    if (_upcomingOff.isNotEmpty) ...[
                      if (_roster != null && _roster!.off.isNotEmpty)
                        const SizedBox(height: 8),
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Icon(Icons.upcoming,
                              size: 18, color: amber400),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Text(
                              'Upcoming off: '
                              '${_upcomingOff.map((r) => '${_stylistNames[r.stylistId] ?? "Stylist"} (${fmtDateStrIndian(r.start)} → ${fmtDateStrIndian(r.end)})').join(', ')}',
                              style: const TextStyle(
                                  color: amber400, fontSize: 12.5),
                            ),
                          ),
                        ],
                      ),
                    ],
                  ],
                ),
              ),
            ),
            const SizedBox(height: 16),
          ],

          // ── Stats ───────────────────────────────────────────────────────────
          // Stylists: their own earnings (never salon-wide money). Owner: the
          // salon-wide booking funnel.
          if (Api.instance.user?.isStylist == true) ...[
            Reveal(
              delay: const Duration(milliseconds: 40),
              child: GridView.count(
                crossAxisCount: 2,
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                mainAxisSpacing: 10,
                crossAxisSpacing: 10,
                childAspectRatio: 1.9,
                children: [
                  _StatCard(
                    icon: Icons.currency_rupee,
                    label: 'Earned today',
                    value: _meSummary == null
                        ? '…'
                        : inr(_meSummary!.todayRevenue),
                    color: gold600,
                  ),
                  _StatCard(
                    icon: Icons.event_available,
                    label: 'Bookings today',
                    value: _meSummary == null
                        ? '…'
                        : '${_meSummary!.todayBookings}',
                    color: emerald700,
                  ),
                  _StatCard(
                    icon: Icons.calendar_month,
                    label: 'Earned this month',
                    value: _meSummary == null
                        ? '…'
                        : inr(_meSummary!.monthRevenue),
                    color: gold600,
                  ),
                  _StatCard(
                    icon: Icons.event_note,
                    label: 'Bookings this month',
                    value: _meSummary == null
                        ? '…'
                        : '${_meSummary!.monthBookings}',
                    color: emerald700,
                  ),
                ],
              ),
            ),
            // Next-up hint — the stylist's earliest upcoming confirmed booking.
            if (_meSummary?.nextAppointment != null)
              Reveal(
                delay: const Duration(milliseconds: 60),
                child: Padding(
                  padding: const EdgeInsets.only(top: 10),
                  child: GlassCard(
                    border: emerald300.withValues(alpha: 0.35),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Icon(Icons.upcoming,
                            size: 18, color: emerald300),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                'Next up · '
                                '${_meSummary!.nextAppointment!.date}'
                                '${_meSummary!.nextAppointment!.timeSlot != null ? ' ${fmtTime(_meSummary!.nextAppointment!.timeSlot)}' : ''}'
                                ' · ${_meSummary!.nextAppointment!.customerName ?? 'Customer'}',
                                style: const TextStyle(
                                    color: cream, fontSize: 12.5),
                              ),
                              if (_meSummary!
                                  .nextAppointment!.services.isNotEmpty)
                                const SizedBox(height: 2),
                              if (_meSummary!
                                  .nextAppointment!.services.isNotEmpty)
                                Text(
                                  _meSummary!.nextAppointment!.services
                                      .join(' · '),
                                  style: const TextStyle(
                                      color: emerald300, fontSize: 11.5),
                                ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
          ] else
            Reveal(
              delay: const Duration(milliseconds: 40),
              child: GridView.count(
                crossAxisCount: 3,
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                mainAxisSpacing: 10,
                crossAxisSpacing: 10,
                childAspectRatio: 1.15,
                children: [
                  _StatCard(
                    icon: Icons.trending_up,
                    label: 'Total',
                    value: '${_bookings.length + _pending.length}',
                    color: emerald800,
                  ),
                  _StatCard(
                    icon: Icons.error_outline,
                    label: 'Pending',
                    value: '${_pending.length}',
                    color: const Color(0xFFb45309),
                  ),
                  _StatCard(
                    icon: Icons.schedule,
                    label: 'Reschedule',
                    value: '${_awaiting.length}',
                    color: const Color(0xFF4c1d95),
                  ),
                  _StatCard(
                    icon: Icons.check_circle_outline,
                    label: 'Confirmed',
                    value: '${confirmed.length}',
                    color: emerald700,
                  ),
                  _StatCard(
                    icon: Icons.cancel_outlined,
                    label: 'Cancelled',
                    value: '${cancelled.length}',
                    color: const Color(0xFF7f1d1d),
                  ),
                  _StatCard(
                    icon: Icons.currency_rupee,
                    label: 'Revenue',
                    value: inr(revenue),
                    color: gold600,
                  ),
                ],
              ),
            ),
          const SizedBox(height: 20),

          // ── Date filter ─────────────────────────────────────────────────────
          Reveal(
            delay: const Duration(milliseconds: 80),
            child: GlassCard(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
              child: Row(
                children: [
                  const Icon(Icons.calendar_today, size: 16, color: gold400),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      _selectedDate == null
                          ? 'All dates'
                          : fmtDateStrIndian(_selectedDate),
                      style: const TextStyle(color: cream, fontSize: 13),
                    ),
                  ),
                  TextButton(
                    onPressed: _pickDate,
                    child: const Text(
                      'Filter',
                      style: TextStyle(color: gold400, fontSize: 13),
                    ),
                  ),
                  if (_selectedDate != null)
                    TextButton(
                      onPressed: () {
                        setState(() => _selectedDate = null);
                        refresh();
                      },
                      child: const Text(
                        'View All',
                        style: TextStyle(color: emerald300, fontSize: 13),
                      ),
                    ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 24),

          if (_error != null)
            GlassCard(
              child: Center(
                child: Text(_error!, style: const TextStyle(color: red400)),
              ),
            )
          else ...[
            // ── Pending queue ─────────────────────────────────────────────────
            if (_pending.isNotEmpty) ...[
              SectionTitle(
                'Pending Approval',
                icon: Icons.error_outline,
                iconColor: amber400,
                trailing: _Badge(
                  '${_pending.length} awaiting action',
                  amber400,
                ),
              ),
              ..._pending.indexed.map((rec) {
                final (i, b) = rec;
                return Reveal(
                  delay: Duration(milliseconds: math.min(i * 40, 320)),
                  child: _PendingCard(
                    booking: b,
                    busy: _actingId == b.id,
                    onApprove: () => _act(
                      b.id,
                      () => Api.instance.approve(b.id),
                      'Booking approved',
                    ),
                    onDecline: () => _confirmThen(
                      'Decline this booking request?',
                      () => _act(
                        b.id,
                        () => Api.instance.decline(b.id),
                        'Booking declined',
                      ),
                    ),
                    onReschedule: () => _openReschedule(b),
                  ),
                );
              }),
              const SizedBox(height: 24),
            ],

            // ── Awaiting reschedule queue ─────────────────────────────────────
            if (_awaiting.isNotEmpty) ...[
              SectionTitle(
                'Awaiting Reschedule',
                icon: Icons.schedule,
                iconColor: violet400,
                trailing: _Badge(
                  "${_awaiting.length} waiting on customer",
                  violet400,
                ),
              ),
              ..._awaiting.indexed.map((rec) {
                final (i, b) = rec;
                return Reveal(
                  delay: Duration(milliseconds: math.min(i * 40, 320)),
                  child: _AwaitingCard(booking: b),
                );
              }),
              const SizedBox(height: 24),
            ],

            // ── Schedule + stylist load ───────────────────────────────────────
            SectionTitle('Schedule', icon: Icons.access_time),
            if (_loading)
              ...List.generate(
                3,
                (_) => const Padding(
                  padding: EdgeInsets.only(bottom: 10),
                  child: GlassCard(child: SizedBox(height: 60)),
                ),
              )
            else if (confirmed.isEmpty)
              GlassCard(
                child: Center(
                  child: Column(
                    children: [
                      const Icon(
                        Icons.content_cut,
                        size: 28,
                        color: emerald400,
                      ),
                      const SizedBox(height: 8),
                      Text(
                        _selectedDate == null
                            ? 'No confirmed bookings.'
                            : 'No confirmed bookings for this day.',
                        style: const TextStyle(color: emerald300),
                      ),
                    ],
                  ),
                ),
              )
            else
              ...confirmed.indexed.map((rec) {
                final (i, b) = rec;
                return Reveal(
                  delay: Duration(milliseconds: math.min(i * 40, 320)),
                  child: _ScheduleCard(
                    booking: b,
                    busy: _actingId == b.id,
                    onReschedule: () => _openReschedule(b),
                    onCancel: () => _confirmThen(
                      'Cancel this booking?',
                      () => _act(
                        b.id,
                        () => Api.instance.cancel(b.id),
                        'Booking cancelled',
                      ),
                    ),
                  ),
                );
              }),
            const SizedBox(height: 24),

            // ── Stylist load ──────────────────────────────────────────────────
            SectionTitle('Stylist Load', icon: Icons.content_cut),
            ..._stylistLoad(confirmed).entries
                .map((e) => _LoadBar(name: e.key, mins: e.value)),
            if (confirmed.isEmpty)
              GlassCard(
                child: Center(
                  child: Text(
                    'No data for this day.',
                    style: const TextStyle(color: emerald300, fontSize: 13),
                  ),
                ),
              ),
          ],
        ],
      ),
    );
    return SafeArea(top: true, bottom: false, child: list);
  }

  Future<void> _confirmThen(String message, Future<void> Function() fn) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: emerald900,
        title: const Text('Confirm', style: TextStyle(color: cream)),
        content: Text(message, style: const TextStyle(color: emerald300)),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Keep'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Yes', style: TextStyle(color: red400)),
          ),
        ],
      ),
    );
    if (ok == true) await fn();
  }

  /// Minutes per stylist — a stylist is busy for their services' real
  /// durations, not a flat hour per row (mirrors the web panel).
  Map<String, int> _stylistLoad(List<m.BookingModel> confirmed) {
    final acc = <String, int>{};
    for (final b in confirmed) {
      final rows = b.slots.isNotEmpty
          ? b.slots
          : (b.stylist != null
                ? [
                    m.SlotModel(
                      id: 'legacy',
                      stylist: b.stylist,
                      timeSlot: b.timeSlot ?? '',
                      durationMins: 60,
                    ),
                  ]
                : <m.SlotModel>[]);
      for (final sl in rows) {
        final name = sl.stylist?.name;
        if (name != null && name.isNotEmpty) {
          acc[name] = (acc[name] ?? 0) + sl.durationMins;
        }
      }
    }
    return acc;
  }
}

// ── Small pieces ─────────────────────────────────────────────────────────────

class _StatCard extends StatelessWidget {
  final IconData icon;
  final String label;
  final String value;
  final Color color;
  const _StatCard({
    required this.icon,
    required this.label,
    required this.value,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    return GlassCard(
      padding: const EdgeInsets.all(12),
      // scaleDown: shrink as a unit on tight cells (small screens / large
      // font scales) instead of overflowing the GridView cell.
      child: FittedBox(
        fit: BoxFit.scaleDown,
        alignment: Alignment.centerLeft,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 30,
              height: 30,
              decoration: BoxDecoration(
                color: color,
                borderRadius: BorderRadius.circular(8),
              ),
              child: Icon(icon, size: 16, color: cream),
            ),
            const SizedBox(height: 8),
            Text(
              value,
              style: const TextStyle(
                fontSize: 20,
                fontWeight: FontWeight.w600,
                color: cream,
              ),
            ),
            const SizedBox(height: 2),
            Text(
              label,
              style: const TextStyle(fontSize: 11, color: emerald300),
            ),
          ],
        ),
      ),
    );
  }
}

class _Badge extends StatelessWidget {
  final String text;
  final Color color;
  const _Badge(this.text, this.color);

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.15),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: color.withValues(alpha: 0.5)),
      ),
      child: Text(text, style: TextStyle(fontSize: 10.5, color: color)),
    );
  }
}

class _SlotRow extends StatelessWidget {
  final m.SlotModel sl;
  final Color timeColor;
  final bool showPrice;
  const _SlotRow({
    required this.sl,
    required this.timeColor,
    this.showPrice = false,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 6),
      child: Row(
        children: [
          SizedBox(
            width: 62,
            child: Text(
              fmtTime(sl.timeSlot),
              style: TextStyle(
                fontSize: 11.5,
                fontWeight: FontWeight.w600,
                color: timeColor,
              ),
            ),
          ),
          Expanded(
            child: Text(
              sl.service?.label ?? 'Service',
              style: const TextStyle(fontSize: 12.5, color: cream),
              overflow: TextOverflow.ellipsis,
            ),
          ),
          const Icon(Icons.content_cut, size: 11, color: emerald300),
          const SizedBox(width: 3),
          Text(
            sl.stylist?.name ?? '—',
            style: const TextStyle(fontSize: 11.5, color: emerald300),
          ),
          if (showPrice) ...[
            const SizedBox(width: 10),
            Text(
              inr(sl.service?.price ?? 0),
              style: const TextStyle(fontSize: 11.5, color: emerald300),
            ),
          ],
        ],
      ),
    );
  }
}

class _CustomerLine extends StatelessWidget {
  final m.BookingModel b;
  const _CustomerLine(this.b);

  @override
  Widget build(BuildContext context) {
    final tel = telHref(b.customerPhone);
    return Wrap(
      spacing: 12,
      runSpacing: 4,
      crossAxisAlignment: WrapCrossAlignment.center,
      children: [
        Text(
          b.customerName ?? 'Customer',
          style: const TextStyle(
            color: cream,
            fontWeight: FontWeight.w600,
            fontSize: 13.5,
          ),
        ),
        if (tel != null)
          InkWell(
            onTap: () => launchUrl(Uri.parse(tel)),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(Icons.phone, size: 11, color: emerald300),
                const SizedBox(width: 3),
                Text(
                  b.customerPhone ?? '',
                  style: const TextStyle(color: emerald300, fontSize: 11.5),
                ),
              ],
            ),
          ),
        Text(b.date, style: const TextStyle(color: emerald300, fontSize: 11.5)),
        Text(
          inr(b.totalPrice),
          style: const TextStyle(
            color: gold400,
            fontSize: 11.5,
            fontWeight: FontWeight.w600,
          ),
        ),
      ],
    );
  }
}

class _PendingCard extends StatelessWidget {
  final m.BookingModel booking;
  final bool busy;
  final VoidCallback onApprove;
  final VoidCallback onDecline;
  final VoidCallback onReschedule;

  const _PendingCard({
    required this.booking,
    required this.busy,
    required this.onApprove,
    required this.onDecline,
    required this.onReschedule,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: GlassCard(
        border: amber400.withValues(alpha: 0.35),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _CustomerLine(booking),
            const SizedBox(height: 4),
            ...booking.slots.map(
              (sl) => _SlotRow(sl: sl, timeColor: amber400, showPrice: true),
            ),
            const SizedBox(height: 10),
            Row(
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                TextButton(
                  onPressed: onReschedule,
                  child: const Text(
                    'Reschedule',
                    style: TextStyle(color: violet300, fontSize: 12.5),
                  ),
                ),
                const SizedBox(width: 4),
                busy
                    ? const Padding(
                        padding: EdgeInsets.symmetric(horizontal: 16),
                        child: SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: gold400,
                          ),
                        ),
                      )
                    : GoldButton(label: 'Approve', onPressed: onApprove),
                const SizedBox(width: 8),
                OutlineButton(
                  label: 'Decline',
                  onPressed: onDecline,
                  textColor: red400,
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _AwaitingCard extends StatelessWidget {
  final m.BookingModel booking;
  const _AwaitingCard({required this.booking});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: GlassCard(
        border: violet400.withValues(alpha: 0.35),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _CustomerLine(booking),
            const SizedBox(height: 6),
            Text.rich(
              TextSpan(
                style: const TextStyle(fontSize: 11.5),
                children: [
                  const TextSpan(
                    text: 'Proposed: ',
                    style: TextStyle(color: violet300),
                  ),
                  TextSpan(
                    text:
                        '${booking.proposedDate ?? '—'} at ${fmtTime(booking.proposedTimeSlot)}',
                    style: const TextStyle(
                      color: cream,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  TextSpan(
                    text:
                        '  (was ${booking.date} at ${fmtTime(booking.firstSlotTime)})',
                    style: const TextStyle(color: emerald500),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 4),
            ...booking.slots.map(
              (sl) => _SlotRow(sl: sl, timeColor: violet400),
            ),
            const SizedBox(height: 8),
            const Align(
              alignment: Alignment.centerRight,
              child: Text(
                "Waiting for customer's answer",
                style: TextStyle(
                  color: violet300,
                  fontSize: 11.5,
                  fontStyle: FontStyle.italic,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ScheduleCard extends StatelessWidget {
  final m.BookingModel booking;
  final bool busy;
  final VoidCallback onReschedule;
  final VoidCallback onCancel;

  const _ScheduleCard({
    required this.booking,
    required this.busy,
    required this.onReschedule,
    required this.onCancel,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: GlassCard(
        border: emerald700,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Icon(Icons.person_outline, size: 14, color: emerald300),
                const SizedBox(width: 6),
                Expanded(
                  child: Text(
                    booking.customerName ?? 'Customer',
                    style: const TextStyle(
                      color: cream,
                      fontWeight: FontWeight.w600,
                      fontSize: 13.5,
                    ),
                  ),
                ),
                Text(
                  '${booking.slots.length} service${booking.slots.length == 1 ? '' : 's'}',
                  style: const TextStyle(color: emerald300, fontSize: 11.5),
                ),
                const SizedBox(width: 10),
                Text(
                  inr(booking.totalPrice),
                  style: const TextStyle(
                    color: gold400,
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 4),
            ...booking.slots.map(
              (sl) => _SlotRow(sl: sl, timeColor: gold400, showPrice: true),
            ),
            const SizedBox(height: 8),
            Row(
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                if (busy)
                  const Padding(
                    padding: EdgeInsets.symmetric(horizontal: 16),
                    child: SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: gold400,
                      ),
                    ),
                  )
                else ...[
                  TextButton(
                    onPressed: onReschedule,
                    child: const Text(
                      'Reschedule',
                      style: TextStyle(color: violet300, fontSize: 12.5),
                    ),
                  ),
                  TextButton(
                    onPressed: onCancel,
                    child: const Text(
                      'Cancel',
                      style: TextStyle(color: red400, fontSize: 12.5),
                    ),
                  ),
                ],
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _LoadBar extends StatelessWidget {
  final String name;
  final int mins;
  const _LoadBar({required this.name, required this.mins});

  @override
  Widget build(BuildContext context) {
    final hrs = mins / 60;
    final pct = (hrs / 11).clamp(0.0, 1.0);
    final label = hrs % 1 == 0
        ? hrs.toStringAsFixed(0)
        : hrs.toStringAsFixed(1);
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: GlassCard(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  name,
                  style: const TextStyle(
                    color: cream,
                    fontSize: 13,
                    fontWeight: FontWeight.w500,
                  ),
                ),
                Text(
                  '$label h booked',
                  style: const TextStyle(
                    color: gold400,
                    fontSize: 12.5,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            ClipRRect(
              borderRadius: BorderRadius.circular(999),
              // Retargets smoothly when refresh() brings new numbers.
              child: TweenAnimationBuilder<double>(
                tween: Tween(begin: 0, end: pct),
                duration: const Duration(milliseconds: 500),
                curve: Curves.easeOutCubic,
                builder: (_, v, _) => LinearProgressIndicator(
                  value: v,
                  minHeight: 6,
                  backgroundColor: emerald900,
                  valueColor: const AlwaysStoppedAnimation(gold500),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ── Propose-reschedule sheet ─────────────────────────────────────────────────

class _RescheduleSheet extends StatefulWidget {
  final m.BookingModel booking;
  final VoidCallback onDone;
  const _RescheduleSheet({required this.booking, required this.onDone});

  @override
  State<_RescheduleSheet> createState() => _RescheduleSheetState();
}

class _RescheduleSheetState extends State<_RescheduleSheet> {
  late DateTime _date;
  String? _start;
  Map<String, m.AvailabilityResult> _avail = {};
  bool _loading = true;
  bool _loadFailed = false;
  final _reason = TextEditingController();

  List<m.SlotModel> get _rows => widget.booking.slots;
  List<String> get _stylistIds => _rows
      .map((sl) => sl.stylist?.id ?? '')
      .where((s) => s.isNotEmpty)
      .toSet()
      .toList();

  String get _dateStr =>
      '${_date.year.toString().padLeft(4, '0')}-${_date.month.toString().padLeft(2, '0')}-${_date.day.toString().padLeft(2, '0')}';

  @override
  void initState() {
    super.initState();
    // Bug 8: rescheduling a booking dated today after the 20:45 IST flip is
    // impossible (every slot closed) — seed the proposal at tomorrow instead.
    final parsed = DateTime.tryParse(widget.booking.date);
    _date = istDayFlipped() && isoDate(parsed ?? DateTime.now()) == istToday()
        ? (DateTime.tryParse(istTomorrow()) ?? DateTime.now())
        : (parsed ?? DateTime.now());
    _loadAvailability();
  }

  @override
  void dispose() {
    _reason.dispose();
    super.dispose();
  }

  Future<void> _loadAvailability() async {
    setState(() {
      _loading = true;
      _loadFailed = false;
      _avail = {};
      _start = null;
    });
    try {
      // This booking's own rows are excluded server-side via exclude_booking_id
      // — they're moving away, so they must not block their own reschedule.
      final results = await Future.wait(
        _stylistIds.map(
          (id) => Api.instance.availability(
            id,
            _dateStr,
            excludeBookingId: widget.booking.id,
          ),
        ),
      );
      if (!mounted) return;
      setState(() {
        for (var i = 0; i < _stylistIds.length; i++) {
          _avail[_stylistIds[i]] = results[i];
        }
        _loading = false;
      });
    } on ApiException {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _loadFailed = true;
      });
    }
  }

  Future<void> _pickDate() async {
    final picked = await pickAyraDate(
      context,
      initialDate: _date,
      // Bug 8: today drops out of the picker once the day flips (20:45 IST).
      firstDate: DateTime.tryParse(minBookableDate()) ?? DateTime.now(),
      lastDate: DateTime.now().add(const Duration(days: 365)),
    );
    if (picked == null || picked == _date) return;
    setState(() => _date = picked);
    _loadAvailability();
  }

  Future<void> _propose() async {
    if (_start == null) return;
    try {
      await Api.instance.proposeReschedule(
        widget.booking.id,
        _dateStr,
        _start!,
        _reason.text.trim().isEmpty ? null : _reason.text.trim(),
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Reschedule proposed — customer notified'),
        ),
      );
      widget.onDone();
    } on ApiException catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(e.message)));
    }
  }

  @override
  Widget build(BuildContext context) {
    // A stylist marked off on this date blocks their whole day — same
    // full-day block the backend's availability math implies.
    List<m.BusyInterval> busyFor(String id) {
      final r = _avail[id];
      if (r == null) return const [];
      if (r.stylistOff) {
        return [m.BusyInterval(start: '10:00', end: '21:00')];
      }
      return r.busy;
    }

    final viable = _loading || _loadFailed || _rows.isEmpty
        ? <String>{}
        : viableStartsFor(busyFor, _rows);
    final availLoaded =
        !_loading &&
        !_loadFailed &&
        _stylistIds.isNotEmpty &&
        _stylistIds.every((id) => _avail.containsKey(id));
    // Names of involved stylists who are off — shown instead of the generic
    // "no slots" message so the reason is obvious.
    final offNames = !availLoaded
        ? <String>[]
        : () {
            final idName = {
              for (final r in _rows)
                if (r.stylist != null) r.stylist!.id: r.stylist!.name,
            };
            return [
              for (final id in _stylistIds)
                if (_avail[id]?.stylistOff ?? false) idName[id] ?? id,
            ];
          }();
    final block = slotsNeededFor(_rows.map((r) => r.durationMins).toList());

    // 10-min booking cutoff for today — mirrors the backend reschedule guard
    // (bookings.py). Reschedule is strictly future-facing: no walk-in
    // override here (started-slot seating belongs to New Appointment). The
    // ONE exception: the last slot (20:00) stays open until 20:15.
    final isToday = _dateStr == istToday();
    final nowIst = DateTime.now().toUtc().add(
      const Duration(hours: 5, minutes: 30),
    );
    final nowMin = nowIst.hour * 60 + nowIst.minute;
    bool closedByCutoff(String t) => isToday &&
        (t == '20:00' ? nowMin >= 20 * 60 + 15 : toMins(t) - nowMin < 10);

    return SafeArea(
      child: Padding(
        padding: EdgeInsets.only(
          left: 20,
          right: 20,
          top: 20,
          bottom: MediaQuery.of(context).viewInsets.bottom + 20,
        ),
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Propose Reschedule',
                          style: Theme.of(context).appBarTheme.titleTextStyle,
                        ),
                        const SizedBox(height: 4),
                        Text(
                          '${widget.booking.customerName ?? 'Customer'} · currently '
                          '${widget.booking.date} at ${fmtTime(widget.booking.firstSlotTime)}'
                          '${_rows.isNotEmpty ? ' · ${_rows.length} service${_rows.length > 1 ? 's' : ''}, reserves $block hour${block != 1 ? 's' : ''}' : ''}',
                          style: const TextStyle(
                            color: emerald300,
                            fontSize: 11.5,
                          ),
                        ),
                      ],
                    ),
                  ),
                  IconButton(
                    icon: const Icon(Icons.close, color: emerald300),
                    onPressed: () => Navigator.of(context).pop(),
                  ),
                ],
              ),
              const SizedBox(height: 18),
              const Text(
                'New date',
                style: TextStyle(color: emerald300, fontSize: 12),
              ),
              const SizedBox(height: 6),
              InkWell(
                onTap: _pickDate,
                borderRadius: BorderRadius.circular(12),
                child: InputDecorator(
                  decoration: const InputDecoration(
                    suffixIcon: Icon(
                      Icons.calendar_today,
                      size: 16,
                      color: emerald300,
                    ),
                  ),
                  child: Text(
                    _dateStr,
                    style: const TextStyle(color: cream, fontSize: 13.5),
                  ),
                ),
              ),
              const SizedBox(height: 18),
              const Text(
                'New start time',
                style: TextStyle(color: emerald300, fontSize: 12),
              ),
              const SizedBox(height: 10),
              if (_rows.isEmpty)
                const Text(
                  'This booking has no slot rows — reschedule is unavailable for legacy bookings.',
                  style: TextStyle(color: amber400, fontSize: 11.5),
                )
              else if (_loading)
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: allSlots
                      .take(8)
                      .map(
                        (_) => Container(
                          width: 72,
                          height: 36,
                          decoration: BoxDecoration(
                            color: emerald900.withValues(alpha: 0.6),
                            borderRadius: BorderRadius.circular(10),
                          ),
                        ),
                      )
                      .toList(),
                )
              else if (!availLoaded)
                const Text(
                  'Could not load availability for this date.',
                  style: TextStyle(color: amber400, fontSize: 11.5),
                )
              else if (offNames.isNotEmpty)
                Text(
                  '${offNames.join(', ')} '
                  '${offNames.length == 1 ? 'is' : 'are'} marked off on $_dateStr — no availability that day.',
                  style: const TextStyle(color: amber400, fontSize: 11.5),
                )
              else if (viable.isEmpty)
                const Text(
                  'No start times available for this date — try another day.',
                  style: TextStyle(color: amber400, fontSize: 11.5),
                )
              else
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: allSlots.map((t) {
                    final isViable =
                        viable.contains(t) && !closedByCutoff(t);
                    final selected = _start == t;
                    return InkWell(
                      onTap: isViable ? () => setState(() => _start = t) : null,
                      borderRadius: BorderRadius.circular(10),
                      child: Container(
                        width: 72,
                        padding: const EdgeInsets.symmetric(vertical: 9),
                        decoration: BoxDecoration(
                          color: selected ? gold500 : Colors.transparent,
                          borderRadius: BorderRadius.circular(10),
                          border: Border.all(
                            color: selected
                                ? gold500
                                : isViable
                                ? emerald700
                                : emerald800.withValues(alpha: 0.5),
                          ),
                        ),
                        child: Text(
                          fmtTime(t),
                          textAlign: TextAlign.center,
                          style: TextStyle(
                            fontSize: 11,
                            color: selected
                                ? emerald950
                                : isViable
                                ? cream
                                : emerald700,
                            fontWeight: selected
                                ? FontWeight.w700
                                : FontWeight.w400,
                            decoration: isViable
                                ? null
                                : TextDecoration.lineThrough,
                          ),
                        ),
                      ),
                    );
                  }).toList(),
                ),
              const SizedBox(height: 18),
              const Text(
                'Reason (optional)',
                style: TextStyle(color: emerald300, fontSize: 12),
              ),
              const SizedBox(height: 6),
              TextField(
                controller: _reason,
                maxLines: 2,
                decoration: const InputDecoration(
                  hintText: 'e.g. Stylist unavailable that morning',
                ),
              ),
              const SizedBox(height: 20),
              Row(
                mainAxisAlignment: MainAxisAlignment.end,
                children: [
                  OutlineButton(
                    label: 'Cancel',
                    onPressed: () => Navigator.of(context).pop(),
                  ),
                  const SizedBox(width: 10),
                  GoldButton(
                    label: 'Propose',
                    onPressed: _start == null ? null : _propose,
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
