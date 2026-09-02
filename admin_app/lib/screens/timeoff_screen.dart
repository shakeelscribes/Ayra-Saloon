import 'package:flutter/material.dart';

import '../api.dart';
import '../models.dart' as m;
import '../theme.dart';
import 'home_shell.dart';

/// Time Off — self-service date ranges for stylists; read-only roster for the
/// owner (no stylist link, mirrors the 403 the backend returns for /me).
/// Mirrors frontend-admin/src/components/TimeOff.jsx:
///  · stylist: form (start/end/reason) + own ranges list + remove
///  · 409 shows the conflict card: message + per-booking Cancel buttons
///  · owner: upcoming ranges of all staff with names
class TimeOffScreen extends StatefulWidget {
  final HomeShellState shell;
  const TimeOffScreen({super.key, required this.shell});

  @override
  State<TimeOffScreen> createState() => TimeOffScreenState();
}

class TimeOffScreenState extends State<TimeOffScreen> {
  bool get _isStylist => Api.instance.user?.isStylist ?? false;

  // Owner roster view
  List<m.TimeOffModel> _upcoming = [];
  Map<String, String> _stylistNames = {};
  bool _loadingOwner = true;
  String? _errorOwner;

  // Stylist self-service view
  List<m.TimeOffModel> _mine = [];
  bool _loadingMine = true;
  String? _errorMine;
  DateTime? _start;
  DateTime? _end;
  final _reason = TextEditingController();
  bool _saving = false;
  String? _removingId;

  // 409 conflict card state
  String? _conflictMessage;
  List<m.TimeOffConflict> _conflicts = [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  /// Public hook for HomeShell.refreshAll().
  Future<void> refresh() => _load();

  @override
  void dispose() {
    _reason.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    if (_isStylist) {
      await _loadMine();
    } else {
      await _loadOwner();
    }
  }

  Future<void> _loadOwner() async {
    setState(() {
      _loadingOwner = true;
      _errorOwner = null;
    });
    try {
      final results = await Future.wait([
        Api.instance.upcomingTimeOff(),
        Api.instance.stylists(),
      ]);
      if (!mounted) return;
      setState(() {
        _upcoming = results[0].cast<m.TimeOffModel>();
        // Api.stylists() returns raw JSON maps — index by key, not property.
        _stylistNames = {
          for (final s in results[1])
            s['id'].toString(): (s['name'] as String?) ?? 'Stylist',
        };
        _loadingOwner = false;
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      if (e.isAuthError) return widget.shell.handleAuthError();
      setState(() {
        _errorOwner = e.message;
        _loadingOwner = false;
      });
    }
  }

  Future<void> _loadMine() async {
    setState(() {
      _loadingMine = true;
      _errorMine = null;
    });
    try {
      _mine = await Api.instance.myTimeOff();
      if (!mounted) return;
      setState(() => _loadingMine = false);
    } on ApiException catch (e) {
      if (!mounted) return;
      if (e.isAuthError) return widget.shell.handleAuthError();
      setState(() {
        _errorMine = e.message;
        _loadingMine = false;
      });
    }
  }

  String _fmt(DateTime d) =>
      '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

  bool _overlapsOwn(DateTime s, DateTime e) {
    for (final r in _mine) {
      final rs = DateTime.tryParse(r.start);
      final re = DateTime.tryParse(r.end);
      if (rs == null || re == null) continue;
      if (!e.isBefore(rs) && !s.isAfter(re)) return true; // inclusive
    }
    return false;
  }

  Future<void> _pick({required bool isStart}) async {
    final now = DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: (isStart ? _start : (_end ?? _start)) ?? now,
      firstDate: DateTime(now.year, now.month, now.day),
      lastDate: now.add(const Duration(days: 365)),
    );
    if (picked == null) return;
    setState(() {
      if (isStart) {
        _start = picked;
        if (_end != null && _end!.isBefore(_start!)) _end = null;
      } else {
        _end = picked;
      }
    });
  }

  Future<void> _submit() async {
    final msg = _validate();
    if (msg != null) {
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(msg)));
      return;
    }
    setState(() {
      _saving = true;
      _conflictMessage = null;
      _conflicts = [];
    });
    try {
      await Api.instance.addTimeOff(
        _fmt(_start!),
        _fmt(_end!),
        _reason.text.trim().isEmpty ? null : _reason.text.trim(),
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
        content: Text('Time off marked — customers can\'t book you that day'),
      ));
      setState(() {
        _start = null;
        _end = null;
        _reason.clear();
      });
      await _loadMine();
      widget.shell.refreshAll();
    } on m.TimeOffConflictException catch (e) {
      if (!mounted) return;
      setState(() {
        _conflictMessage = e.message;
        _conflicts = e.conflicts;
      });
      return;
    } on ApiException catch (e) {
      if (!mounted) return;
      if (e.isAuthError) return widget.shell.handleAuthError();
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(e.message)));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  String? _validate() {
    if (_start == null || _end == null) return 'Pick a start and an end date';
    if (_end!.isBefore(_start!)) return 'End date is before start date';
    if (_overlapsOwn(_start!, _end!)) {
      return 'This overlaps a range you already marked off';
    }
    return null;
  }

  Future<void> _remove(m.TimeOffModel r) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: emerald900,
        title: const Text('Remove time off?', style: TextStyle(color: cream)),
        content: Text(
          '${r.start} to ${r.end} — you become bookable again immediately.',
          style: const TextStyle(color: emerald300),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Keep'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Remove', style: TextStyle(color: red400)),
          ),
        ],
      ),
    );
    if (ok != true) return;
    setState(() => _removingId = r.id);
    try {
      await Api.instance.removeTimeOff(r.id);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Time off removed — you\'re bookable again')),
      );
      await _loadMine();
      widget.shell.refreshAll();
    } on ApiException catch (e) {
      if (!mounted) return;
      if (e.isAuthError) return widget.shell.handleAuthError();
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(e.message)));
    } finally {
      if (mounted) setState(() => _removingId = null);
    }
  }

  /// Cancel a conflicting booking straight from the 409 card, then clear the
  /// card (the stylist re-submits the range afterwards).
  Future<void> _cancelConflict(m.TimeOffConflict c) async {
    try {
      await Api.instance.cancel(c.bookingId);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Booking on ${c.date} cancelled')),
      );
      setState(() {
        _conflicts = _conflicts.where((x) => x.bookingId != c.bookingId).toList();
        if (_conflicts.isEmpty) _conflictMessage = null;
      });
      widget.shell.refreshAll();
    } on ApiException catch (e) {
      if (!mounted) return;
      if (e.isAuthError) return widget.shell.handleAuthError();
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(e.message)));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: emerald950,
      appBar: AppBar(title: const Text('Time Off')),
      body: RefreshIndicator(
        color: gold500,
        onRefresh: _load,
        child: _isStylist ? _buildStylist() : _buildOwner(),
      ),
    );
  }

  // ── Owner: read-only upcoming roster ────────────────────────────────────────
  Widget _buildOwner() {
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
      children: [
        Reveal(
          child: GlassCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const SectionTitle('Upcoming Time Off',
                    icon: Icons.event_busy),
                const Text(
                  'Who is marked off, from today on. Stylists mark their own '
                  'ranges from the Time Off tab; you\'ll see an off-day note '
                  'on the dashboard when it affects bookings.',
                  style: TextStyle(color: emerald300, fontSize: 12),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 16),
        if (_loadingOwner)
          ...List.generate(
            2,
            (_) => const Padding(
              padding: EdgeInsets.only(bottom: 10),
              child: GlassCard(child: SizedBox(height: 60)),
            ),
          )
        else if (_errorOwner != null)
          GlassCard(
            child: Center(
              child: Text(_errorOwner!, style: const TextStyle(color: red400)),
            ),
          )
        else if (_upcoming.isEmpty)
          const GlassCard(
            child: Center(
              child: Text(
                'No upcoming time off — everyone is bookable.',
                style: TextStyle(color: emerald300, fontSize: 13),
              ),
            ),
          )
        else
          ..._upcoming.map((r) => Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: GlassCard(
                  child: Row(
                    children: [
                      const Icon(Icons.event_busy,
                          size: 18, color: amber400),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              _stylistNames[r.stylistId] ?? 'Stylist',
                              style: const TextStyle(
                                color: cream,
                                fontSize: 13.5,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                            Text(
                              '${r.start} → ${r.end}',
                              style: const TextStyle(
                                  color: emerald300, fontSize: 12),
                            ),
                            if (r.reason != null && r.reason!.isNotEmpty)
                              Text(
                                r.reason!,
                                style: const TextStyle(
                                    color: emerald500, fontSize: 11.5,
                                    fontStyle: FontStyle.italic),
                              ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              )),
      ],
    );
  }

  // ── Stylist: self-service form + own ranges ─────────────────────────────────
  Widget _buildStylist() {
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
      children: [
        // ── Mark time off ────────────────────────────────────────────────────
        Reveal(
          child: GlassCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const SectionTitle('Mark Time Off',
                    icon: Icons.event_busy),
                const Text(
                  'Pick an inclusive date range. Customers can\'t book you '
                  'that day, and your exclusive services disappear from '
                  'online booking.',
                  style: TextStyle(color: emerald300, fontSize: 12),
                ),
                const SizedBox(height: 14),
                Row(
                  children: [
                    Expanded(
                      child: _DateField(
                        label: _start == null ? 'From' : _fmt(_start!),
                        onTap: () => _pick(isStart: true),
                      ),
                    ),
                    const Padding(
                      padding: EdgeInsets.symmetric(horizontal: 8),
                      child: Icon(Icons.arrow_forward,
                          size: 16, color: emerald300),
                    ),
                    Expanded(
                      child: _DateField(
                        label: _end == null ? 'To' : _fmt(_end!),
                        onTap: () => _pick(isStart: false),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: _reason,
                  decoration: const InputDecoration(
                    hintText: 'Reason (optional) — e.g. family function',
                  ),
                ),
                const SizedBox(height: 14),
                GoldButton(
                  label: 'Mark Time Off',
                  busy: _saving,
                  onPressed: _submit,
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 16),

        // ── 409 conflict card ────────────────────────────────────────────────
        if (_conflictMessage != null) ...[
          Reveal(
            child: GlassCard(
              border: amber400.withValues(alpha: 0.5),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      const Icon(Icons.warning_amber_rounded,
                          size: 18, color: amber400),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          _conflictMessage!,
                          style: const TextStyle(
                              color: amber400, fontSize: 12.5),
                        ),
                      ),
                      IconButton(
                        icon: const Icon(Icons.close,
                            size: 16, color: emerald300),
                        onPressed: () => setState(() {
                          _conflictMessage = null;
                          _conflicts = [];
                        }),
                      ),
                    ],
                  ),
                  ..._conflicts.map((c) => Padding(
                        padding: const EdgeInsets.only(top: 8),
                        child: Row(
                          children: [
                            Expanded(
                              child: Text(
                                '${c.date}'
                                '${c.timeSlot != null && c.timeSlot!.isNotEmpty ? ' at ${fmtTime(c.timeSlot)}' : ''}'
                                ' · ${c.status} · ${c.source == 'walk_in' ? 'walk-in' : 'online'}',
                                style: const TextStyle(
                                    color: cream, fontSize: 12),
                              ),
                            ),
                            OutlineButton(
                              label: 'Cancel',
                              textColor: red400,
                              onPressed: () => _cancelConflict(c),
                            ),
                          ],
                        ),
                      )),
                  if (_conflicts.isNotEmpty)
                    const Padding(
                      padding: EdgeInsets.only(top: 8),
                      child: Text(
                        'Cancel these bookings, then submit the range again.',
                        style: TextStyle(color: emerald500, fontSize: 11),
                      ),
                    ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 16),
        ],

        // ── My ranges ────────────────────────────────────────────────────────
        const SectionTitle('My Time Off', icon: Icons.event_busy),
        if (_loadingMine)
          ...List.generate(
            2,
            (_) => const Padding(
              padding: EdgeInsets.only(bottom: 10),
              child: GlassCard(child: SizedBox(height: 54)),
            ),
          )
        else if (_errorMine != null)
          GlassCard(
            child: Center(
              child: Text(_errorMine!, style: const TextStyle(color: red400)),
            ),
          )
        else if (_mine.isEmpty)
          const GlassCard(
            child: Center(
              child: Text(
                'Nothing marked off — you\'re bookable every day.',
                style: TextStyle(color: emerald300, fontSize: 13),
              ),
            ),
          )
        else
          ..._mine.map((r) => Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: GlassCard(
                  child: Row(
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              '${r.start} → ${r.end}',
                              style: const TextStyle(
                                color: cream,
                                fontSize: 13.5,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                            if (r.reason != null && r.reason!.isNotEmpty)
                              Text(
                                r.reason!,
                                style: const TextStyle(
                                    color: emerald300, fontSize: 11.5),
                              ),
                          ],
                        ),
                      ),
                      _removingId == r.id
                          ? const Padding(
                              padding: EdgeInsets.symmetric(horizontal: 12),
                              child: SizedBox(
                                width: 18,
                                height: 18,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                  color: gold400,
                                ),
                              ),
                            )
                          : IconButton(
                              tooltip: 'Remove',
                              icon: const Icon(Icons.delete_outline,
                                  size: 18, color: red400),
                              onPressed: () => _remove(r),
                            ),
                    ],
                  ),
                ),
              )),
      ],
    );
  }
}

/// Tap-only date field (opens the picker) — matches the Schedule card style.
class _DateField extends StatelessWidget {
  final String label;
  final VoidCallback onTap;
  const _DateField({required this.label, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: InputDecorator(
        decoration: const InputDecoration(
          suffixIcon:
              Icon(Icons.calendar_today, size: 16, color: emerald300),
        ),
        child: Text(
          label,
          style: const TextStyle(color: cream, fontSize: 13.5),
        ),
      ),
    );
  }
}
