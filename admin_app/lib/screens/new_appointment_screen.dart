import 'package:flutter/material.dart';

import '../api.dart';
import '../models.dart' as m;
import '../slots.dart';
import '../theme.dart';
import 'home_shell.dart';
import 'service_picker_sheet.dart';

/// Remembers the last audience within the app session — admins book
/// consecutive walk-ins, so the choice survives the post-booking reset.
String? _sessionAudience;

/// Walk-in entry — the salon books on the customer's behalf. Mirrors
/// frontend-admin/src/components/NewAppointment.jsx.
class NewAppointmentScreen extends StatefulWidget {
  final HomeShellState shell;
  const NewAppointmentScreen({super.key, required this.shell});

  @override
  State<NewAppointmentScreen> createState() => _NewAppointmentScreenState();
}

class _NewAppointmentScreenState extends State<NewAppointmentScreen> {
  final _name = TextEditingController();
  final _phone = TextEditingController();
  final _notes = TextEditingController();

  List<m.ServiceModel> _services = [];
  List<m.StylistModel> _stylists = [];

  final List<_Item> _items = [];
  String? _pickServiceId;
  String? _pickStylistId;
  String?
  _audience; // men | women | kids — mirrors the user panel's gender step

  DateTime _date = DateTime.now();
  String? _start;
  Map<String, List<m.BusyInterval>> _avail = {};
  bool _availLoading = false;
  bool _confirmNow = true;
  // Walk-in override: seat a customer in a started/passed slot today.
  // Waives only the 10-min booking cutoff — never conflicts or past dates.
  bool _ignoreCutoff = false;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    _audience = _sessionAudience;
    _loadCatalog();
  }

  @override
  void dispose() {
    _name.dispose();
    _phone.dispose();
    _notes.dispose();
    super.dispose();
  }

  Future<void> _loadCatalog() async {
    try {
      final results = await Future.wait([
        Api.instance.services(),
        Api.instance.stylists(),
      ]);
      if (!mounted) return;
      setState(() {
        _services = results[0]
            .map((e) => m.ServiceModel.fromJson(e))
            .where((s) => s.id.isNotEmpty && s.bookable)
            .toList();
        _stylists = results[1].map((e) => m.StylistModel.fromJson(e)).toList();
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      if (e.isAuthError) return widget.shell.handleAuthError();
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Could not load services: ${e.message}')),
      );
    }
  }

  m.ServiceModel? get _pickedService {
    for (final s in _services) {
      if (s.id == _pickServiceId) return s;
    }
    return null;
  }

  m.StylistModel? get _pickedStylist {
    for (final s in _stylists) {
      if (s.id == _pickStylistId) return s;
    }
    return null;
  }

  /// Specialists first; if the category has no specialist at all, everyone
  /// qualifies (backend fallback, mirrored from the web panel).
  List<m.StylistModel> get _eligibleStylists {
    final svc = _pickedService;
    if (svc == null) return _stylists;
    final specialists = _stylists
        .where((s) => s.categories.contains(svc.category))
        .toList();
    return specialists.isNotEmpty ? specialists : _stylists;
  }

  /// Hard audience rules — mirrors the user panel's Services filter: kids
  /// shows only for_kids services; men/women exclude kids services and
  /// audience mismatches (unisex always passes).
  bool _matchesAudience(m.ServiceModel s) {
    if (_audience == 'kids') return s.forKids;
    final mismatch =
        _audience != null && s.audience != 'unisex' && s.audience != _audience;
    return !mismatch && !s.forKids;
  }

  /// Audience switches prune the cart — a mismatched service would 409 the
  /// whole booking at submit (backend audience-consistency rule). Mirrors
  /// the user panel's prune effect.
  void _setAudience(String? a) {
    var pruned = false;
    setState(() {
      _audience = a;
      _sessionAudience = a;
      final before = _items.length;
      _items.removeWhere((i) => !_matchesAudience(i.service));
      pruned = _items.length != before;
      final picked = _pickedService;
      if (picked != null && !_matchesAudience(picked)) {
        _pickServiceId = null;
        _pickStylistId = null;
      }
    });
    // Pruned items change the involved stylists — refresh availability.
    if (pruned) _loadAvailability();
  }

  Future<void> _openPicker() async {
    final picked = await showServicePickerSheet(
      context,
      services: _services,
      audience: _audience,
      selected: _pickedService,
    );
    if (!mounted || picked == null) return;
    setState(() {
      _pickServiceId = picked.id;
      // Reset the stylist pick when the service changes.
      _pickStylistId = null;
    });
  }

  void _addItem() {
    final svc = _pickedService;
    m.StylistModel? sty;
    for (final s in _stylists) {
      if (s.id == _pickStylistId) sty = s;
    }
    if (svc == null || sty == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Pick a service and a stylist first')),
      );
      return;
    }
    if (_items.any((i) => i.service.id == svc.id)) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Each service can be added only once')),
      );
      return;
    }
    setState(() {
      _items.add(_Item(service: svc, stylist: sty!));
      _pickServiceId = null;
      _pickStylistId = null;
    });
    _loadAvailability();
  }

  void _removeItem(int idx) {
    setState(() => _items.removeAt(idx));
    _loadAvailability();
  }

  int get _totalMins => _items.fold(0, (s, i) => s + i.service.durationMins);
  num get _totalPrice => _items.fold(0, (s, i) => s + i.service.price);
  int get _blockSlots =>
      slotsNeededFor(_items.map((i) => i.service.durationMins).toList());

  List<String> get _itemStylistIds =>
      _items.map((i) => i.stylist.id).toSet().toList();

  String get _dateStr =>
      '${_date.year.toString().padLeft(4, '0')}-${_date.month.toString().padLeft(2, '0')}-${_date.day.toString().padLeft(2, '0')}';

  Future<void> _loadAvailability() async {
    if (_itemStylistIds.isEmpty) {
      setState(() => _avail = {});
      return;
    }
    setState(() {
      _availLoading = true;
      _avail = {};
      _start = null;
    });
    try {
      final results = await Future.wait(
        _itemStylistIds.map((id) => Api.instance.availability(id, _dateStr)),
      );
      if (!mounted) return;
      setState(() {
        for (var i = 0; i < _itemStylistIds.length; i++) {
          _avail[_itemStylistIds[i]] = results[i];
        }
        _availLoading = false;
      });
    } on ApiException {
      if (!mounted) return;
      setState(() => _availLoading = false);
    }
  }

  Future<void> _pickDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _date,
      firstDate: DateTime.now(),
      lastDate: DateTime.now().add(const Duration(days: 365)),
    );
    if (picked == null || picked == _date) return;
    setState(() => _date = picked);
    _loadAvailability();
  }

  Future<void> _submit() async {
    if (_name.text.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Customer name is required')),
      );
      return;
    }
    if (_phone.text.replaceAll(RegExp(r'\D'), '').length < 10) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('A valid 10-digit phone number is required'),
        ),
      );
      return;
    }
    if (_items.isEmpty) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('Add at least one service')));
      return;
    }
    if (_start == null) {
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('Pick a start time')));
      return;
    }
    setState(() => _saving = true);
    try {
      await Api.instance.createWalkIn({
        'customer_name': _name.text.trim(),
        'phone': _phone.text.trim(),
        'items': _items
            .map(
              (i) => {'service_id': i.service.id, 'stylist_id': i.stylist.id},
            )
            .toList(),
        'date': _dateStr,
        'time_slot': _start,
        'notes': _notes.text.trim().isEmpty ? null : _notes.text.trim(),
        'confirm_now': _confirmNow,
        'ignore_cutoff': _ignoreCutoff,
      });
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            _confirmNow
                ? 'Appointment booked & confirmed'
                : 'Appointment saved as pending',
          ),
        ),
      );
      // Reset the form for the next walk-in.
      setState(() {
        _name.clear();
        _phone.clear();
        _notes.clear();
        _items.clear();
        _pickServiceId = null;
        _pickStylistId = null;
        _start = null;
        _avail = {};
      });
      widget.shell.refreshAll();
    } on ApiException catch (e) {
      if (!mounted) return;
      if (e.isAuthError) return widget.shell.handleAuthError();
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(e.message)));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final rows = _items
        .map(
          (i) => m.SlotModel(
            id: 'x',
            stylist: i.stylist,
            timeSlot: '',
            durationMins: i.service.durationMins,
          ),
        )
        .toList();
    List<m.BusyInterval> busyFor(String id) => _avail[id] ?? [];
    final viable = _items.isEmpty || _availLoading
        ? <String>{}
        : viableStartsFor(busyFor, rows);
    final availLoaded =
        !_availLoading &&
        _itemStylistIds.isNotEmpty &&
        _itemStylistIds.every((id) => _avail.containsKey(id));

    // 10-min booking cutoff for today — mirrors the backend freshness guard
    // (bookings.py): a slot is bookable until 10 minutes before it starts
    // (the 10:00 slot closes at 09:50). With the walk-in override ON,
    // started/passed slots stay selectable (backend: ignore_cutoff=true).
    final isToday = _dateStr == istToday();
    final nowIst = DateTime.now().toUtc().add(
      const Duration(hours: 5, minutes: 30),
    );
    final nowMin = nowIst.hour * 60 + nowIst.minute;
    bool isPassed(String t) =>
        isToday && !_ignoreCutoff && toMins(t) - nowMin < 10;

    // "Struck-through times are already booked" helper — shown when at least
    // one slot is booked out (as opposed to not fitting before closing).
    final hasTaken =
        availLoaded &&
        allSlots.any(
          (t) =>
              allSlots.indexOf(t) + _blockSlots <= allSlots.length &&
              !isPassed(t) &&
              !viable.contains(t),
        );

    // "Your visit" — resolved back-to-back plan for the picked start
    // (mirrors the user panel's timeline preview).
    List<CascadeEntry>? visitPlan;
    if (_start != null && availLoaded && _items.isNotEmpty) {
      final idx = allSlots.indexOf(_start!);
      if (idx >= 0 && idx + _blockSlots <= allSlots.length) {
        final res = resolveCascadeFor(busyFor, rows, idx);
        if (res.ok) visitPlan = res.plan;
      }
    }

    return Scaffold(
      backgroundColor: emerald950,
      appBar: AppBar(title: const Text('New Appointment')),
      body: RefreshIndicator(
        color: gold500,
        onRefresh: _loadCatalog,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
          children: [
            // ── Customer ──────────────────────────────────────────────────────
            Reveal(
              child: GlassCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const SectionTitle('Customer', icon: Icons.person_outline),
                    const Text(
                      'Name',
                      style: TextStyle(color: emerald300, fontSize: 12),
                    ),
                    const SizedBox(height: 6),
                    TextField(
                      key: const ValueKey('name_field'),
                      controller: _name,
                      decoration: const InputDecoration(
                        hintText: "Customer's name",
                      ),
                    ),
                    const SizedBox(height: 14),
                    const Row(
                      children: [
                        Icon(Icons.phone_android, size: 12, color: emerald300),
                        SizedBox(width: 4),
                        Text(
                          'WhatsApp number',
                          style: TextStyle(color: emerald300, fontSize: 12),
                        ),
                      ],
                    ),
                    const SizedBox(height: 6),
                    TextField(
                      key: const ValueKey('phone_field'),
                      controller: _phone,
                      keyboardType: TextInputType.phone,
                      decoration: const InputDecoration(
                        hintText: '98765 43210',
                      ),
                    ),
                    const SizedBox(height: 6),
                    const Text(
                      'Existing customers are matched by number — new ones get an account automatically.',
                      style: TextStyle(color: emerald500, fontSize: 10.5),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 16),

            // ── Services ──────────────────────────────────────────────────────
            Reveal(
              delay: const Duration(milliseconds: 50),
              child: GlassCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const SectionTitle('Services', icon: Icons.content_cut),
                    // Audience — mirrors the user panel's gender step. No
                    // default on first open (deliberate choice); the pick
                    // survives the post-booking reset for consecutive walk-ins.
                    SegmentedButton<String>(
                      segments: const [
                        ButtonSegment(value: 'men', label: Text('Men')),
                        ButtonSegment(value: 'women', label: Text('Women')),
                        ButtonSegment(value: 'kids', label: Text('Kids')),
                      ],
                      selected: {?_audience},
                      emptySelectionAllowed: true,
                      showSelectedIcon: false,
                      style: ButtonStyle(
                        side: WidgetStatePropertyAll(
                          BorderSide(color: emerald700.withValues(alpha: 0.8)),
                        ),
                        backgroundColor: WidgetStateProperty.resolveWith(
                          (states) => states.contains(WidgetState.selected)
                              ? gold500.withValues(alpha: 0.22)
                              : Colors.transparent,
                        ),
                        foregroundColor: WidgetStateProperty.resolveWith(
                          (states) => states.contains(WidgetState.selected)
                              ? gold400
                              : emerald300,
                        ),
                      ),
                      onSelectionChanged: (sel) =>
                          _setAudience(sel.isEmpty ? null : sel.first),
                    ),
                    const SizedBox(height: 10),
                    // Service field — opens the picker sheet (search + category
                    // filters + sort), the Flutter equivalent of the user
                    // panel's service list.
                    InkWell(
                      key: const ValueKey('service_field'),
                      onTap: _audience == null ? null : _openPicker,
                      borderRadius: BorderRadius.circular(12),
                      child: InputDecorator(
                        decoration: InputDecoration(
                          enabled: _audience != null,
                          hintText: _audience == null
                              ? 'Pick Men / Women / Kids first'
                              : 'Select service…',
                          suffixIcon: const Icon(
                            Icons.expand_more,
                            size: 18,
                            color: emerald300,
                          ),
                        ),
                        child: Text(
                          _pickedService?.label ?? '',
                          style: const TextStyle(color: cream, fontSize: 13.5),
                        ),
                      ),
                    ),
                    const SizedBox(height: 10),
                    DropdownMenu<String>(
                      width: double.infinity,
                      enabled: _pickServiceId != null,
                      initialSelection: _pickStylistId ?? '',
                      dropdownMenuEntries: [
                        const DropdownMenuEntry(
                          value: '',
                          label: 'Select stylist…',
                        ),
                        ..._eligibleStylists.map(
                          (s) => DropdownMenuEntry(value: s.id, label: s.name),
                        ),
                      ],
                      onSelected: (v) => setState(
                        () => _pickStylistId = v!.isEmpty ? null : v,
                      ),
                    ),
                    const SizedBox(height: 12),
                    _AddServiceButton(
                      pickedService: _pickedService,
                      pickedStylist: _pickedStylist,
                      onOpenPicker: _openPicker,
                      onConfirm: _addItem,
                    ),
                    const SizedBox(height: 12),
                    if (_items.isEmpty)
                      const Text(
                        'No services added yet.',
                        style: TextStyle(color: emerald400, fontSize: 12.5),
                      )
                    else
                      ...List.generate(_items.length, (idx) {
                        final it = _items[idx];
                        return Container(
                          margin: const EdgeInsets.only(bottom: 8),
                          padding: const EdgeInsets.symmetric(
                            horizontal: 14,
                            vertical: 10,
                          ),
                          decoration: BoxDecoration(
                            color: emerald900.withValues(alpha: 0.6),
                            borderRadius: BorderRadius.circular(12),
                            border: Border.all(
                              color: emerald700.withValues(alpha: 0.6),
                            ),
                          ),
                          child: Row(
                            children: [
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      it.service.label,
                                      style: const TextStyle(
                                        color: cream,
                                        fontSize: 13,
                                        fontWeight: FontWeight.w500,
                                      ),
                                    ),
                                    Text(
                                      '${it.stylist.name} · ${it.service.durationMins} min · ${inr(it.service.price)}',
                                      style: const TextStyle(
                                        color: emerald300,
                                        fontSize: 11,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                              IconButton(
                                icon: const Icon(
                                  Icons.delete_outline,
                                  size: 18,
                                  color: red400,
                                ),
                                onPressed: () => _removeItem(idx),
                              ),
                            ],
                          ),
                        );
                      }),
                    if (_items.isNotEmpty)
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text(
                            'Total ≈ $_totalMins min · reserves $_blockSlots hour${_blockSlots != 1 ? 's' : ''}',
                            style: const TextStyle(
                              color: emerald300,
                              fontSize: 12,
                            ),
                          ),
                          Text(
                            inr(_totalPrice),
                            style: const TextStyle(
                              color: gold400,
                              fontSize: 13,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ],
                      ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 16),

            // ── Schedule ──────────────────────────────────────────────────────
            Reveal(
              delay: const Duration(milliseconds: 100),
              child: GlassCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const SectionTitle('Schedule', icon: Icons.calendar_today),
                    const Text(
                      'Date',
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
                    const SizedBox(height: 16),
                    const Text(
                      'Start time',
                      style: TextStyle(color: emerald300, fontSize: 12),
                    ),
                    const SizedBox(height: 10),
                    if (_items.isEmpty)
                      const Text(
                        'Add services first — availability depends on the stylists involved.',
                        style: TextStyle(color: amber400, fontSize: 11.5),
                      )
                    else if (_availLoading)
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
                    else ...[
                      // The full grid stays visible so the admin can see WHY a
                      // slot is blocked (booked vs won't fit vs already passed).
                      if (viable.isEmpty)
                        const Padding(
                          padding: EdgeInsets.only(bottom: 8),
                          child: Text(
                            'No start times available for this date — try another day.',
                            style: TextStyle(color: amber400, fontSize: 11.5),
                          ),
                        ),
                      Wrap(
                        spacing: 8,
                        runSpacing: 8,
                        children: allSlots.map((t) {
                          final fitsClosing =
                              allSlots.indexOf(t) + _blockSlots <=
                              allSlots.length;
                          final passed = isPassed(t);
                          // Late = past the 10-min cutoff but seatable via
                          // the walk-in override.
                          final late =
                              !passed && isToday && toMins(t) - nowMin < 10;
                          // Strike-through = already booked; dimmed without
                          // strike = won't fit before closing / already passed.
                          final taken =
                              fitsClosing && !passed && !viable.contains(t);
                          final selectable = viable.contains(t) && !passed;
                          final selected = _start == t;
                          return InkWell(
                            onTap: selectable
                                ? () => setState(() => _start = t)
                                : null,
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
                                      : selectable && late
                                      ? amber400
                                      : selectable
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
                                      : selectable && late
                                      ? amber400
                                      : selectable
                                      ? cream
                                      : emerald700,
                                  fontWeight: selected
                                      ? FontWeight.w700
                                      : FontWeight.w400,
                                  decoration: taken
                                      ? TextDecoration.lineThrough
                                      : null,
                                ),
                              ),
                            ),
                          );
                        }).toList(),
                      ),
                      if (hasTaken)
                        const Padding(
                          padding: EdgeInsets.only(top: 8),
                          child: Text(
                            'Struck-through times are already booked.',
                            style: TextStyle(color: emerald500, fontSize: 10.5),
                          ),
                        ),
                      // "Your visit" — resolved back-to-back plan for the
                      // picked start (mirrors the user panel's timeline).
                      if (_start != null) ...[
                        const SizedBox(height: 14),
                        Container(
                          width: double.infinity,
                          padding: const EdgeInsets.all(12),
                          decoration: BoxDecoration(
                            color: emerald900.withValues(alpha: 0.6),
                            borderRadius: BorderRadius.circular(12),
                            border: Border.all(
                              color: emerald700.withValues(alpha: 0.6),
                            ),
                          ),
                          child: visitPlan == null
                              ? const Text(
                                  'This start no longer fits — pick another slot.',
                                  style: TextStyle(
                                    color: amber400,
                                    fontSize: 11.5,
                                  ),
                                )
                              : Builder(
                                  builder: (_) {
                                    final plan = visitPlan!;
                                    return Column(
                                      crossAxisAlignment:
                                          CrossAxisAlignment.start,
                                      children: [
                                        const Text(
                                          'YOUR VISIT',
                                          style: TextStyle(
                                            color: gold400,
                                            fontSize: 10,
                                            letterSpacing: 2,
                                            fontWeight: FontWeight.w600,
                                          ),
                                        ),
                                        const SizedBox(height: 6),
                                        ...List.generate(plan.length, (i) {
                                          final w = plan[i];
                                          final it = _items[i];
                                          return Padding(
                                            padding: const EdgeInsets.only(
                                              top: 3,
                                            ),
                                            child: Row(
                                              mainAxisAlignment:
                                                  MainAxisAlignment
                                                      .spaceBetween,
                                              children: [
                                                Expanded(
                                                  child: Text(
                                                    it.service.label,
                                                    overflow:
                                                        TextOverflow.ellipsis,
                                                    style: const TextStyle(
                                                      color: cream,
                                                      fontSize: 12,
                                                    ),
                                                  ),
                                                ),
                                                const SizedBox(width: 8),
                                                Text(
                                                  '${fmtTime(minsToHm(w.startMin))}–${fmtTime(minsToHm(w.endMin))} · ${it.stylist.name}',
                                                  style: const TextStyle(
                                                    color: emerald300,
                                                    fontSize: 10.5,
                                                  ),
                                                ),
                                              ],
                                            ),
                                          );
                                        }),
                                      ],
                                    );
                                  },
                                ),
                        ),
                      ],
                    ],
                    const SizedBox(height: 16),
                    Row(
                      children: [
                        Checkbox(
                          value: _ignoreCutoff,
                          activeColor: gold500,
                          checkColor: emerald950,
                          onChanged: (v) =>
                              setState(() => _ignoreCutoff = v ?? false),
                        ),
                        const Icon(
                          Icons.schedule,
                          size: 16,
                          color: amber400,
                        ),
                        const SizedBox(width: 6),
                        const Expanded(
                          child: Text(
                            'Walk-in override (allow booking a slot that already started today)',
                            style: TextStyle(color: cream, fontSize: 12.5),
                          ),
                        ),
                      ],
                    ),
                    Row(
                      children: [
                        Checkbox(
                          value: _confirmNow,
                          activeColor: gold500,
                          checkColor: emerald950,
                          onChanged: (v) =>
                              setState(() => _confirmNow = v ?? true),
                        ),
                        const Icon(
                          Icons.check_circle_outline,
                          size: 16,
                          color: emerald400,
                        ),
                        const SizedBox(width: 6),
                        const Expanded(
                          child: Text(
                            'Confirm immediately (uncheck to keep it in the pending queue)',
                            style: TextStyle(color: cream, fontSize: 12.5),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    const Text(
                      'Notes (optional)',
                      style: TextStyle(color: emerald300, fontSize: 12),
                    ),
                    const SizedBox(height: 6),
                    TextField(
                      controller: _notes,
                      maxLines: 2,
                      decoration: const InputDecoration(
                        hintText:
                            'e.g. Walk-in, prefers the chair by the window',
                      ),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 20),
            GoldButton(
              label: _confirmNow ? 'Book & Confirm' : 'Save as Pending',
              busy: _saving,
              onPressed: _submit,
            ),
          ],
        ),
      ),
    );
  }
}

class _Item {
  final m.ServiceModel service;
  final m.StylistModel stylist;
  _Item({required this.service, required this.stylist});
}

/// The Services action button — three states that morph in place so the
/// label always names the action:
///  · nothing picked  → outline "Add service" (opens the picker)
///  · service, no stylist → disabled "Now pick a stylist" nudge
///  · both picked     → full-width gold "Confirm `<service>` · `<stylist>`"
///
/// The gold confirm state is the explicit "done" step — tapping it no
/// longer reads like adding *another* service. After confirming, the
/// picks reset and the button returns to "Add service" for the next one.
class _AddServiceButton extends StatelessWidget {
  final m.ServiceModel? pickedService;
  final m.StylistModel? pickedStylist;
  final VoidCallback onOpenPicker;
  final VoidCallback onConfirm;

  const _AddServiceButton({
    required this.pickedService,
    required this.pickedStylist,
    required this.onOpenPicker,
    required this.onConfirm,
  });

  @override
  Widget build(BuildContext context) {
    final reduced = MediaQuery.maybeDisableAnimationsOf(context) ?? false;
    final Widget child;
    if (pickedService == null) {
      child = OutlineButton(
        key: const ValueKey('svc_action_idle'),
        label: 'Add service',
        icon: Icons.add,
        onPressed: onOpenPicker,
      );
    } else if (pickedStylist == null) {
      child = OutlineButton(
        key: const ValueKey('svc_action_need_stylist'),
        label: 'Now pick a stylist',
        icon: Icons.person_outline,
        onPressed: null,
      );
    } else {
      child = _ConfirmServiceButton(
        key: const ValueKey('svc_action_confirm'),
        label: 'Confirm ${pickedService!.label} · ${pickedStylist!.name}',
        onPressed: onConfirm,
      );
    }
    return AnimatedSwitcher(
      duration: reduced ? Duration.zero : const Duration(milliseconds: 200),
      switchInCurve: Curves.easeOut,
      switchOutCurve: Curves.easeOut,
      transitionBuilder: (child, anim) => FadeTransition(
        opacity: anim,
        child: SlideTransition(
          position: Tween<Offset>(
            begin: const Offset(0, 0.05),
            end: Offset.zero,
          ).animate(anim),
          child: child,
        ),
      ),
      child: child,
    );
  }
}

/// Full-width gold confirm pill — the "done" step. Ellipsizes long
/// service names instead of overflowing.
class _ConfirmServiceButton extends StatelessWidget {
  final String label;
  final VoidCallback? onPressed;
  const _ConfirmServiceButton({super.key, required this.label, this.onPressed});

  @override
  Widget build(BuildContext context) {
    return PressableScale(
      child: Opacity(
        opacity: onPressed == null ? 0.5 : 1,
        child: DecoratedBox(
          decoration: BoxDecoration(
            gradient: goldGradient,
            borderRadius: BorderRadius.circular(999),
          ),
          child: TextButton(
            onPressed: onPressed,
            style: TextButton.styleFrom(
              foregroundColor: emerald950,
              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
              shape: const StadiumBorder(),
            ),
            child: Row(
              children: [
                const Icon(Icons.check_circle_outline, size: 16),
                const SizedBox(width: 6),
                Expanded(
                  child: Text(
                    label,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontWeight: FontWeight.w600,
                      fontSize: 13,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
