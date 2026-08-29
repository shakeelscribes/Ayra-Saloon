/// Duration-based slot math — mirrors backend/routes/availability.py and the
/// identical math in the web panel (Dashboard.jsx / NewAppointment.jsx).
library;

import 'models.dart';

/// Salon day grid: 10:00 through 20:00, hourly starts.
const List<String> allSlots = ['10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00'];

int toMins(String hm) {
  final p = hm.split(':');
  return (int.tryParse(p[0]) ?? 0) * 60 + (int.tryParse(p[1]) ?? 0);
}

String minsToHm(int mins) =>
    '${(mins ~/ 60).toString().padLeft(2, '0')}:${(mins % 60).toString().padLeft(2, '0')}';

/// True when [startMin,endMin) doesn't overlap any busy interval.
bool isFree(List<BusyInterval> busy, int startMin, int endMin) =>
    !busy.any((b) => startMin < toMins(b.end) && toMins(b.start) < endMin);

/// Whole-hour block sizing: real durations rounded up with the 30-min grace —
/// same rule as creation and the backend.
int slotsNeededFor(List<int> durations) {
  final total = durations.fold(0, (s, d) => s + d);
  return ((total - 30) / 60).ceil().clamp(1, 1 << 31);
}

/// One resolved service window in the back-to-back visit plan.
class CascadeEntry {
  final StylistModel? stylist;
  final int durationMins;
  final int startMin;
  final int endMin;
  const CascadeEntry({required this.stylist, required this.durationMins, required this.startMin, required this.endMin});
}

/// Cascade resolution outcome — [blockedAt] is the row index that couldn't
/// fit, or null when the whole visit resolves from the given start.
class CascadeResult {
  final List<CascadeEntry> plan;
  final int? blockedAt;
  const CascadeResult(this.plan, this.blockedAt);
  bool get ok => blockedAt == null;
}

/// Can ALL services fit back-to-back from allSlots[startIdx]? Each service
/// starts where the previous one ends (real durations); its stylist must be
/// interval-free for that exact window. Shared by the slot grid
/// (viableStartsFor) and the "Your visit" timeline so the two never drift —
/// mirrors resolveCascade in the user panel (BookingComponent.jsx).
CascadeResult resolveCascadeFor(
    List<BusyInterval> Function(String stylistId) busyFor, List<SlotModel> rows, int startIdx) {
  final plan = <CascadeEntry>[];
  var cursor = toMins(allSlots[startIdx]);
  for (var i = 0; i < rows.length; i++) {
    final row = rows[i];
    final sMin = cursor;
    final eMin = cursor + row.durationMins;
    final busy = busyFor(row.stylist?.id ?? '');
    if (!isFree(busy, sMin, eMin)) return CascadeResult(const [], i);
    plan.add(CascadeEntry(
        stylist: row.stylist, durationMins: row.durationMins, startMin: sMin, endMin: eMin));
    cursor = eMin;
  }
  return CascadeResult(plan, null);
}

/// A start works when the whole back-to-back block fits before closing and
/// every service's own stylist is interval-free for its real window.
/// [rows] are (stylist, durationMins) pairs in visit order.
Set<String> viableStartsFor(List<BusyInterval> Function(String stylistId) busyFor, List<SlotModel> rows) {
  final viable = <String>{};
  if (rows.isEmpty) return viable;
  final block = slotsNeededFor(rows.map((r) => r.durationMins).toList());
  for (var s = 0; s + block <= allSlots.length; s++) {
    if (resolveCascadeFor(busyFor, rows, s).ok) viable.add(allSlots[s]);
  }
  return viable;
}
