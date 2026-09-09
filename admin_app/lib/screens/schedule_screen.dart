import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../api.dart';
import '../models.dart' as m;
import '../theme.dart';
import 'home_shell.dart';

/// Datewise schedule of every booking the signed-in role can see — the
/// backend scopes /bookings/admin/all to the stylist's own chair, so the
/// owner sees the salon and a stylist sees only their bookings. Grouped by
/// date (ascending, today highlighted) — the "what's on which day" view the
/// Dashboard's single-day filter can't give.
class ScheduleScreen extends StatefulWidget {
  final HomeShellState shell;
  const ScheduleScreen({super.key, required this.shell});

  @override
  State<ScheduleScreen> createState() => ScheduleScreenState();
}

class ScheduleScreenState extends State<ScheduleScreen> {
  List<m.BookingModel> _bookings = [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    refresh();
  }

  /// Public hook for HomeShell.refreshAll().
  Future<void> refresh() async {
    setState(() {
      _loading = _bookings.isEmpty;
      _error = null;
    });
    try {
      final rows = await Api.instance.adminBookings();
      if (!mounted) return;
      setState(() {
        _bookings = rows
            .map((e) => m.BookingModel.fromJson(e))
            .where(_ownChair)
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

  /// Same defensive client filter as the dashboard — a booking is the
  /// stylist's when one of its slot rows (or the legacy field) names them.
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

  /// date → bookings for that date. Upcoming gets priority: today + future
  /// days ascending first, then past days most-recent-first (02/09 → 29/08)
  /// at the bottom. Within a day, bookings sort by start time.
  Map<String, List<m.BookingModel>> get _byDate {
    final map = <String, List<m.BookingModel>>{};
    for (final b in _bookings) {
      map.putIfAbsent(b.date, () => []).add(b);
    }
    for (final list in map.values) {
      list.sort((a, b) => a.firstSlotTime.compareTo(b.firstSlotTime));
    }
    final keys = map.keys.toList();
    final today = istToday();
    final upcoming = keys.where((d) => d.compareTo(today) >= 0).toList()..sort();
    final past = keys.where((d) => d.compareTo(today) < 0).toList()
      ..sort((a, b) => b.compareTo(a));
    return {for (final k in [...upcoming, ...past]) k: map[k]!};
  }

  @override
  Widget build(BuildContext context) {
    final today = istToday();
    return Scaffold(
      backgroundColor: emerald950,
      body: SafeArea(
        child: RefreshIndicator(
          color: gold400,
          backgroundColor: emerald900,
          onRefresh: refresh,
          child: ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
            children: [
              const SectionTitle('Schedule', icon: Icons.view_timeline),
              const SizedBox(height: 4),
              Text(
                'Every booking, grouped by day — stylists see their own chair only.',
                style: const TextStyle(color: emerald300, fontSize: 12),
              ),
              const SizedBox(height: 16),
              if (_loading)
                ...List.generate(
                  4,
                  (_) => const Padding(
                    padding: EdgeInsets.only(bottom: 10),
                    child: GlassCard(child: SizedBox(height: 64)),
                  ),
                )
              else if (_error != null)
                GlassCard(
                  child: Center(
                    child: Text(_error!, style: const TextStyle(color: red400)),
                  ),
                )
              else if (_bookings.isEmpty)
                GlassCard(
                  child: Center(
                    child: Column(
                      children: [
                        const Icon(Icons.view_timeline,
                            size: 28, color: emerald400),
                        const SizedBox(height: 8),
                        const Text(
                          'No bookings yet.',
                          style: TextStyle(color: emerald300),
                        ),
                      ],
                    ),
                  ),
                )
              else
                ..._byDate.entries.expand((entry) {
                  final date = entry.key;
                  final list = entry.value;
                  final isPast = date.compareTo(today) < 0;
                  final isToday = date == today;
                  return [
                    Padding(
                      padding: const EdgeInsets.only(top: 6, bottom: 8),
                      child: Row(
                        children: [
                          Text(
                            isToday
                                ? 'Today · ${fmtDateStrIndian(date)}'
                                : fmtDateStrIndian(date),
                            style: TextStyle(
                              color: isToday ? gold400 : cream,
                              fontSize: 13.5,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                          const SizedBox(width: 8),
                          _CountBadge('${list.length}'),
                        ],
                      ),
                    ),
                    ...list.indexed.map((rec) {
                      final (i, b) = rec;
                      return Reveal(
                        delay: Duration(milliseconds: math.min(i * 30, 240)),
                        child: Padding(
                          padding: const EdgeInsets.only(bottom: 10),
                          child: _ScheduleTile(booking: b, dimmed: isPast),
                        ),
                      );
                    }),
                    const SizedBox(height: 8),
                  ];
                }),
            ],
          ),
        ),
      ),
    );
  }
}

class _CountBadge extends StatelessWidget {
  final String label;
  const _CountBadge(this.label);

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(
        color: emerald800,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        label,
        style: const TextStyle(
            color: emerald300, fontSize: 11, fontWeight: FontWeight.w600),
      ),
    );
  }
}

/// Read-only booking row for the schedule — time, customer, services,
/// status chip. Actions live on the Dashboard; this screen is the overview.
class _ScheduleTile extends StatelessWidget {
  final m.BookingModel booking;
  final bool dimmed;
  const _ScheduleTile({required this.booking, required this.dimmed});

  (String, Color) get _status {
    switch (booking.status) {
      case 'confirmed':
        return ('Confirmed', emerald400);
      case 'pending':
        return ('Pending', amber400);
      case 'awaiting_reschedule':
        return ('Reschedule?', violet400);
      case 'cancelled':
        return ('Cancelled', red400);
      case 'declined':
        return ('Declined', red400);
      case 'completed':
        return ('Completed', gold400);
      default:
        return (booking.status, emerald300);
    }
  }

  String get _servicesSummary {
    if (booking.slots.isNotEmpty) {
      return booking.slots
          .map((sl) => sl.service?.name ?? 'Service')
          .toSet()
          .join(' + ');
    }
    return booking.service?.name ?? 'Service';
  }

  String get _stylistsSummary {
    final names = booking.slots
        .map((sl) => sl.stylist?.name ?? '')
        .where((n) => n.isNotEmpty)
        .toSet()
        .toList();
    if (names.isEmpty) return booking.stylist?.name ?? '';
    return names.join(' + ');
  }

  @override
  Widget build(BuildContext context) {
    final (statusLabel, statusColor) = _status;
    final opacity = dimmed ? 0.55 : 1.0;
    return Opacity(
      opacity: opacity,
      child: GlassCard(
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Time column
            SizedBox(
              width: 74,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    fmtTime(booking.firstSlotTime),
                    style: const TextStyle(
                      color: gold400,
                      fontSize: 13.5,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    booking.source == 'walk_in' ? 'walk-in' : 'online',
                    style: const TextStyle(
                        color: emerald300, fontSize: 10.5),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    booking.customerName ?? 'Customer',
                    style: const TextStyle(
                      color: cream,
                      fontSize: 13.5,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    _servicesSummary,
                    style:
                        const TextStyle(color: emerald300, fontSize: 11.5),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                  if (_stylistsSummary.isNotEmpty) ...[
                    const SizedBox(height: 2),
                    Text(
                      _stylistsSummary,
                      style: const TextStyle(
                          color: emerald400, fontSize: 11),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
                ],
              ),
            ),
            const SizedBox(width: 8),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
              decoration: BoxDecoration(
                color: statusColor.withValues(alpha: 0.14),
                borderRadius: BorderRadius.circular(999),
                border: Border.all(color: statusColor.withValues(alpha: 0.5)),
              ),
              child: Text(
                statusLabel,
                style: TextStyle(
                  color: statusColor,
                  fontSize: 10.5,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
