import 'dart:async';

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

/// Walk-in entry as a step wizard — mirrors the admin website's form order
/// so both panels feel the same:
///
///   Customer → Date → Services (+ stylist per service) → Time slot
///
/// The date comes BEFORE services (fixed order — the website works the
/// same way) so the off-day roster is known while services are chosen:
/// services whose only specialists are off are hidden right at that step.
/// The stylist is picked on the Services step itself (the website pairs
/// the two dropdowns), and the Time step carries the walk-in override,
/// confirm-now toggle and notes with the Book button — like the web form.
class NewAppointmentScreen extends StatefulWidget {
  final HomeShellState shell;
  const NewAppointmentScreen({super.key, required this.shell});

  @override
  State<NewAppointmentScreen> createState() => _NewAppointmentScreenState();
}

class _NewAppointmentScreenState extends State<NewAppointmentScreen> {
  static const _steps = ['Customer', 'Date', 'Services', 'Time slot'];

  final _name = TextEditingController();
  final _phone = TextEditingController();
  // Optional — only used for the calendar invite email (never required).
  final _email = TextEditingController();
  final _notes = TextEditingController();

  // Known-customer lookup — when the typed number matches an existing
  // account, the name/email fields auto-fill (only if empty) and a chip
  // confirms the match. Read-only: the account itself is never updated.
  // The dirty flag keeps the post-booking _phone.clear() reset from firing
  // a pointless lookup.
  Timer? _lookupDebounce;
  bool _phoneDirty = false;
  m.CustomerLookup? _matchedCustomer;

  List<m.ServiceModel> _services = [];
  List<m.StylistModel> _stylists = [];

  final List<_Item> _items = [];
  String? _pickServiceId;
  String? _pickStylistId;
  String?
  _audience; // men | women | kids — mirrors the website's audience pills

  int _step = 0;
  // Bug 8: seed tomorrow once the booking day has flipped (20:45 IST) so the
  // wizard never opens on today's dead grid.
  DateTime _date = DateTime.tryParse(minBookableDate()) ?? DateTime.now();
  String? _start;
  Map<String, m.AvailabilityResult> _avail = {};
  bool _availLoading = false;
  bool _confirmNow = true;
  // Walk-in override: seat a customer in the slot currently in progress.
  // Waives only the 10-min booking cutoff — and unlocks ONLY the current
  // hour's slot (12:16 → 12:00), never earlier passed slots.
  bool _ignoreCutoff = false;
  bool _saving = false;
  // Off-day roster for the picked date — fail-open (everyone working).
  m.StylistsAvailable? _roster;

  @override
  void initState() {
    super.initState();
    _audience = _sessionAudience;
    _phone.addListener(_onPhoneChanged);
    // The Customer step's Continue gate depends on the typed name —
    // rebuild on every keystroke so the button enables live.
    _name.addListener(_onFormChanged);
    _loadCatalog();
    _loadRoster();
  }

  @override
  void dispose() {
    _lookupDebounce?.cancel();
    _name.dispose();
    _phone.dispose();
    _email.dispose();
    _notes.dispose();
    super.dispose();
  }

  /// Debounced known-customer lookup while the admin types the number.
  /// Fires at ≥10 digits (the backend matches the trailing 10 anyway);
  /// pre-filled fields are never clobbered (fill-if-empty policy).
  void _onPhoneChanged() {
    _onFormChanged();
    final digits = _phone.text.replaceAll(RegExp(r'\D'), '');
    if (digits.length < 10) {
      _lookupDebounce?.cancel();
      if (mounted) setState(() { _phoneDirty = false; _matchedCustomer = null; });
      return;
    }
    _phoneDirty = true;
    _lookupDebounce?.cancel();
    _lookupDebounce = Timer(const Duration(milliseconds: 400), () async {
      final query = _phone.text;
      try {
        final c = await Api.instance.lookupCustomer(query);
        if (!mounted || !_phoneDirty || _phone.text != query) return;
        setState(() => _matchedCustomer = c.found ? c : null);
        if (c.found) {
          if (_name.text.trim().isEmpty && (c.name?.isNotEmpty ?? false)) {
            _name.text = c.name!;
          }
          if (_email.text.trim().isEmpty && (c.email?.isNotEmpty ?? false)) {
            _email.text = c.email!;
          }
        }
      } on ApiException catch (e) {
        if (e.isAuthError && mounted) return widget.shell.handleAuthError();
        // Network/validation blips stay silent — the form stays manual.
      }
    });
  }

  /// Rebuild on name/phone edits so the Customer step's Continue gate
  /// tracks the typed text live.
  void _onFormChanged() {
    if (mounted) setState(() {});
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

  /// The in-flight stylist pick on the Services step (website pairs the
  /// service and stylist dropdowns side-by-side before adding). Stylist-role
  /// logins skip the pick entirely — they always book their own chair.
  m.StylistModel? get _pickedStylist {
    final own = _ownStylist;
    if (own != null) return own;
    for (final s in _stylists) {
      if (s.id == _pickStylistId) return s;
    }
    return null;
  }

  /// Own-chair rule: a stylist-role login books their own chair — the
  /// backend enforces the same rule on /bookings/admin/create. No picker:
  /// the stylist is derived from the session, never picked. Null (and the
  /// picker shown) only if the account's Stylist doc is missing.
  m.StylistModel? get _ownStylist {
    final me = Api.instance.user;
    if (me == null || !me.isStylist || me.stylistId == null) return null;
    for (final s in _stylists) {
      if (s.id == me.stylistId) return s;
    }
    return null;
  }

  bool get _ownChair => _ownStylist != null;

  /// Hard audience rules — mirrors the user panel's Services filter: kids
  /// shows only for_kids services; men/women exclude kids services and
  /// audience mismatches (unisex always passes).
  bool _matchesAudience(m.ServiceModel s) {
    if (_audience == 'kids') return s.forKids;
    final mismatch =
        _audience != null && s.audience != 'unisex' && s.audience != _audience;
    return !mismatch && !s.forKids;
  }

  /// Off-day roster for [_dateStr] — fail-open: on error, treat everyone as
  /// working so a transient API failure never blocks walk-ins.
  Future<void> _loadRoster() async {
    try {
      final r = await Api.instance.stylistsAvailable(_dateStr);
      if (!mounted) return;
      setState(() => _roster = r);
    } on ApiException {
      if (!mounted) return;
      setState(() => _roster = null);
    }
  }

  /// Stylists working on [_dateStr] (off roster is a hard filter, fail-open).
  Set<String> get _workingStylistIds {
    final r = _roster;
    if (r == null) return _stylists.map((s) => s.id).toSet();
    return r.working.map((w) => w.stylist.id).toSet();
  }

  /// Services still bookable for [_dateStr]: hidden when their category has
  /// specialists overall but none working today (off-day rule mirrors the
  /// user panel wizard). Stylist logins additionally only see services their
  /// own chair can perform.
  List<m.ServiceModel> get _bookableServices {
    final working = _workingStylistIds;
    final me = Api.instance.user;
    final ownId = (me != null && me.isStylist) ? me.stylistId : null;
    if (working.length >= _stylists.length && ownId == null) return _services;
    return _services.where((s) {
      final specialists = _stylists
          .where((st) => st.categories.contains(s.category))
          .toList();
      // No specialist at all → open to everyone (backend fallback rule).
      if (specialists.isEmpty) return true;
      if (ownId != null) {
        return specialists.any((st) => st.id == ownId) &&
            working.contains(ownId);
      }
      return specialists.any((st) => working.contains(st.id));
    }).toList();
  }

  /// Own-chair rule: a stylist-role admin only ever books their own chair.
  List<m.StylistModel> get _scopedStylists {
    final me = Api.instance.user;
    if (me == null || !me.isStylist || me.stylistId == null) return _stylists;
    final mine =
        _stylists.where((s) => s.id == me.stylistId).toList();
    return mine.isNotEmpty ? mine : _stylists;
  }

  /// Eligible stylists for ONE service: own-chair scope ∩ working today ∩
  /// specialists (empty specialists → everyone, backend fallback).
  List<m.StylistModel> _eligibleStylistsFor(m.ServiceModel svc) {
    final pool = _scopedStylists
        .where((s) => _workingStylistIds.contains(s.id))
        .toList();
    final specialists =
        pool.where((s) => s.categories.contains(svc.category)).toList();
    return specialists.isNotEmpty ? specialists : pool;
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
      }
      _dropOrphanAssignments();
    });
    // Pruned items change the involved stylists — refresh availability.
    if (pruned) _loadAvailability();
  }

  /// Clear stylist assignments that are no longer eligible for their item
  /// (audience/off-day/own-chair scope changed under them).
  void _dropOrphanAssignments() {
    for (final i in _items) {
      final sty = i.stylist;
      if (sty != null && !_eligibleStylistsFor(i.service).any((s) => s.id == sty.id)) {
        i.stylist = null;
      }
    }
  }

  /// Drop cart items (and the in-flight pick) that are no longer bookable —
  /// audience switch, off-day hiding, or own-chair scope changed the pool.
  void _pruneBookable() {
    final pool = _bookableServices.map((s) => s.id).toSet();
    var pruned = false;
    setState(() {
      final before = _items.length;
      _items.removeWhere((i) => !pool.contains(i.service.id));
      pruned = _items.length != before;
      final picked = _pickedService;
      if (picked != null && !pool.contains(picked.id)) {
        _pickServiceId = null;
      }
      _dropOrphanAssignments();
    });
    if (pruned) _loadAvailability();
  }

  Future<void> _openPicker() async {
    final picked = await showServicePickerSheet(
      context,
      services: _bookableServices.where(_matchesAudience).toList(),
      audience: _audience,
      selected: _pickedService,
    );
    if (!mounted || picked == null) return;
    setState(() {
      _pickServiceId = picked.id;
      // Eligible stylists are per-service — a stale pick would let the
      // admin confirm a stylist who can't perform the new service.
      _pickStylistId = null;
    });
  }

  /// Services step confirm — adds the picked service WITH its stylist in
  /// one action (the website's "Confirm service · stylist" button).
  void _addItem() {
    final svc = _pickedService;
    if (svc == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Pick a service first')),
      );
      return;
    }
    final sty = _pickedStylist;
    if (sty == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Now pick a stylist')),
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
      _items.add(_Item(service: svc, stylist: sty));
      _pickServiceId = null;
      _pickStylistId = null;
    });
    _loadAvailability();
  }

  void _removeItem(int idx) {
    setState(() => _items.removeAt(idx));
    _loadAvailability();
  }

  /// Re-assign the stylist for one cart row, inline on the Services step
  /// (the website has no separate stylist section either).
  void _assignStylist(int idx, String? stylistId) {
    setState(() {
      _items[idx].stylist = stylistId == null || stylistId.isEmpty
          ? null
          : _stylists.firstWhere((s) => s.id == stylistId);
    });
    _loadAvailability();
  }

  bool get _allAssigned => _items.isNotEmpty && _items.every((i) => i.stylist != null);

  int get _totalMins => _items.fold(0, (s, i) => s + i.service.durationMins);
  num get _totalPrice => _items.fold(0, (s, i) => s + i.service.price);
  int get _blockSlots =>
      slotsNeededFor(_items.map((i) => i.service.durationMins).toList());

  List<String> get _itemStylistIds => _items
      .map((i) => i.stylist?.id)
      .whereType<String>()
      .toSet()
      .toList();

  String get _dateStr => isoDate(_date);

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
    final picked = await pickAyraDate(
      context,
      initialDate: _date,
      // Bug 8: today drops out of the picker once the day flips (20:45 IST).
      firstDate: DateTime.tryParse(minBookableDate()) ?? DateTime.now(),
      lastDate: DateTime.now().add(const Duration(days: 365)),
      helpText: 'Appointment date',
    );
    if (picked == null || picked == _date) return;
    setState(() => _date = picked);
    _loadRoster();
    // New day = new working roster — prune services that became hidden and
    // refresh the availability map for the remaining stylists.
    _pruneBookable();
    _loadAvailability();
  }

  /// Step gate — Continue is only enabled when the current step is complete.
  bool get _stepComplete {
    switch (_step) {
      case 0:
        return _name.text.trim().isNotEmpty &&
            _phone.text.replaceAll(RegExp(r'\D'), '').length >= 10;
      case 1:
        return true; // date always has a value (defaults to the min bookable day)
      case 2:
        return _allAssigned;
      case 3:
        return true;
      default:
        return true;
    }
  }

  void _goNext() {
    if (!_stepComplete) return;
    if (_step == 2) _loadAvailability(); // fresh grid for the final roster
    setState(() => _step = _step + 1);
  }

  void _goBack() {
    if (_step == 0) return;
    setState(() => _step = _step - 1);
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
    final email = _email.text.trim();
    if (email.isNotEmpty && !RegExp(r'^\S+@\S+\.\S+$').hasMatch(email)) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("That email doesn't look right")),
      );
      return;
    }
    if (_items.isEmpty || !_allAssigned) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
            content: Text('Assign a stylist to every service first')),
      );
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
        'customer_email': email.isEmpty ? null : email,
        'items': _items
            .map(
              (i) => {
                'service_id': i.service.id,
                'stylist_id': i.stylist!.id,
              },
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
      // Reset the form for the next walk-in — the audience choice survives
      // (session memory), everything else starts clean at step 0.
      setState(() {
        _name.clear();
        _phone.clear();
        _email.clear();
        _notes.clear();
        _items.clear();
        _pickServiceId = null;
        _pickStylistId = null;
        _start = null;
        _avail = {};
        _matchedCustomer = null;
        _step = 0;
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

  // ── Build helpers shared by the Time step ─────────────────────────────────

  List<m.BusyInterval> busyFor(String id) {
    final r = _avail[id];
    if (r == null) return const [];
    // Stylist marked off → whole day blocked (defensive; the roster filter
    // should already have kept them out of the eligible pool).
    if (r.stylistOff) {
      return [m.BusyInterval(start: '10:00', end: '21:00')];
    }
    return r.busy;
  }

  @override
  Widget build(BuildContext context) {
    final rows = _items
        .where((i) => i.stylist != null)
        .map(
          (i) => m.SlotModel(
            id: 'x',
            stylist: i.stylist,
            timeSlot: '',
            durationMins: i.service.durationMins,
          ),
        )
        .toList();
    final viable = _items.isEmpty || _availLoading
        ? <String>{}
        : viableStartsFor(busyFor, rows);
    final availLoaded =
        !_availLoading &&
        _itemStylistIds.isNotEmpty &&
        _itemStylistIds.every((id) => _avail.containsKey(id));

    // 10-min booking cutoff for today — mirrors the backend freshness guard
    // (bookings.py): a slot is bookable until 10 minutes before it starts
    // (the 10:00 slot closes at 09:50). The ONE exception: the day's last
    // slot (20:00) stays bookable until 20:15, no override needed. With the
    // walk-in override ON, the ONLY other unlocked past slot is the one
    // currently in progress (12:16 → 12:00) — earlier passed slots stay
    // locked. Backend: ignore_cutoff=true.
    final isToday = _dateStr == istToday();
    final nowMin = istNowMins();
    final currentStart = currentSlotStartMins();
    const lastSlot = '20:00';
    bool isPassed(String t) {
      if (!isToday) return false;
      if (t == lastSlot) return nowMin >= 20 * 60 + 15;
      final tMin = toMins(t);
      if (tMin - nowMin >= 10) return false; // comfortably in the future
      // Inside the cutoff window: override unlocks exactly the current slot.
      return !_ignoreCutoff || tMin != currentStart;
    }

    // "Struck-through times are already booked" helper — shown when at least
    // one slot is booked out (as opposed to not fitting before closing).
    final hasTaken =
        availLoaded &&
        _allAssigned &&
        allSlots.any(
          (t) =>
              allSlots.indexOf(t) + _blockSlots <= allSlots.length &&
              !isPassed(t) &&
              !viable.contains(t),
        );

    // "Your visit" — resolved back-to-back plan for the picked start
    // (mirrors the user panel's timeline preview).
    List<CascadeEntry>? visitPlan;
    if (_start != null && availLoaded && _allAssigned) {
      final idx = allSlots.indexOf(_start!);
      if (idx >= 0 && idx + _blockSlots <= allSlots.length) {
        final res = resolveCascadeFor(busyFor, rows, idx);
        if (res.ok) visitPlan = res.plan;
      }
    }

    // Amber off-notice — who is off on the picked date (mirrors the web
    // panel's Schedule-card note). Empty when everyone works.
    final offNames = () {
      final r = _roster;
      if (r == null || r.off.isEmpty) return <String>[];
      return r.off.map((s) => s.stylist.name).toList();
    }();

    return Scaffold(
      backgroundColor: emerald950,
      appBar: AppBar(title: const Text('New Appointment')),
      body: Column(
        children: [
          _StepProgress(steps: _steps, current: _step),
          Expanded(
            child: RefreshIndicator(
              color: gold500,
              onRefresh: _loadCatalog,
              child: ListView(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
                children: [
                  if (_step == 0) _buildCustomer(),
                  if (_step == 1) _buildDate(offNames),
                  if (_step == 2) _buildServices(),
                  if (_step == 3)
                    _buildTime(
                      viable: viable,
                      availLoaded: availLoaded,
                      isToday: isToday,
                      nowMin: nowMin,
                      isPassed: isPassed,
                      hasTaken: hasTaken,
                      visitPlan: visitPlan,
                    ),
                ],
              ),
            ),
          ),
          if (_step < 3)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 6, 16, 14),
              child: Row(
                children: [
                  if (_step > 0)
                    OutlineButton(
                      label: 'Back',
                      onPressed: _goBack,
                    ),
                  if (_step > 0) const SizedBox(width: 10),
                  Expanded(
                    child: GoldButton(
                      label: 'Continue',
                      onPressed: _stepComplete ? _goNext : null,
                    ),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }

  // ── Step 0 · Customer (the website's first card) ───────────────────────────
  Widget _buildCustomer() {
    return GlassCard(
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
            textCapitalization: TextCapitalization.words,
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
          if (_matchedCustomer != null) ...[
            const SizedBox(height: 8),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
              decoration: BoxDecoration(
                color: gold500.withValues(alpha: 0.10),
                borderRadius: BorderRadius.circular(999),
                border: Border.all(color: gold500.withValues(alpha: 0.5)),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(Icons.verified_outlined, size: 13, color: gold400),
                  const SizedBox(width: 5),
                  Flexible(
                    child: Text(
                      'Known customer · ${_matchedCustomer!.name ?? 'Unnamed'}'
                      '${(_matchedCustomer!.email?.isNotEmpty ?? false) ? ' · ${_matchedCustomer!.email}' : ''}',
                      style: const TextStyle(color: gold400, fontSize: 10.5),
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                ],
              ),
            ),
          ],
          const SizedBox(height: 14),
          const Row(
            children: [
              Icon(Icons.mail_outline, size: 12, color: emerald300),
              SizedBox(width: 4),
              Text(
                'Email (optional)',
                style: TextStyle(color: emerald300, fontSize: 12),
              ),
            ],
          ),
          const SizedBox(height: 6),
          TextField(
            key: const ValueKey('email_field'),
            controller: _email,
            keyboardType: TextInputType.emailAddress,
            decoration: const InputDecoration(
              hintText: 'customer@email.com',
            ),
          ),
          const SizedBox(height: 6),
          const Text(
            'Used to send a calendar invite when the appointment is confirmed.',
            style: TextStyle(color: emerald500, fontSize: 10.5),
          ),
        ],
      ),
    );
  }

  // ── Step 1 · Date (with the off-day roster up front) ──────────────────────
  Widget _buildDate(List<String> offNames) {
    return GlassCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const SectionTitle('When?', icon: Icons.calendar_today),
          const Text(
            'Pick the day first — the roster for that day decides who can serve.',
            style: TextStyle(color: emerald300, fontSize: 12),
          ),
          const SizedBox(height: 14),
          InkWell(
            key: const ValueKey('date_field'),
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
                fmtDateIndian(_date),
                style: const TextStyle(color: cream, fontSize: 13.5),
              ),
            ),
          ),
          if (offNames.isNotEmpty) ...[
            const SizedBox(height: 10),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: amber400.withValues(alpha: 0.08),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: amber400.withValues(alpha: 0.4)),
              ),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Icon(Icons.event_busy, size: 16, color: amber400),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      'Off ${fmtDateIndian(_date)}: ${offNames.join(', ')}'
                      ' — their exclusive services are hidden.',
                      style: const TextStyle(color: amber400, fontSize: 11.5),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }

  // ── Step 2 · Services (audience pills + paired service/stylist picks,
  // ── exactly like the website's Services card) ──────────────────────────────
  Widget _buildServices() {
    final picked = _pickedService;
    final pickedStylist = _pickedStylist;
    final eligible = picked == null
        ? const <m.StylistModel>[]
        : _eligibleStylistsFor(picked);
    return GlassCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const SectionTitle('Services', icon: Icons.content_cut),
          // Audience pills — the website keeps them on its Services card
          // (they filter services + prune mismatched cart items). Tap the
          // active pill to clear it.
          Wrap(
            spacing: 8,
            children: [
              for (final entry in const [
                ('men', 'Men'),
                ('women', 'Women'),
                ('kids', 'Kids'),
              ])
                ChoiceChip(
                  label: Text(entry.$2),
                  selected: _audience == entry.$1,
                  onSelected: (on) =>
                      _setAudience(on ? entry.$1 : null),
                  labelStyle: TextStyle(
                    fontSize: 12,
                    color: _audience == entry.$1 ? emerald950 : emerald300,
                  ),
                  selectedColor: gold500,
                  backgroundColor: Colors.transparent,
                  side: BorderSide(
                    color: _audience == entry.$1
                        ? gold500
                        : emerald700.withValues(alpha: 0.8),
                  ),
                  showCheckmark: false,
                ),
            ],
          ),
          if (_audience == null) ...[
            const SizedBox(height: 6),
            const Text(
              'Pick an audience to see services.',
              style: TextStyle(color: amber400, fontSize: 11),
            ),
          ],
          const SizedBox(height: 14),
          // Paired dropdowns — service and stylist, like the website's
          // two-column picker row.
          InkWell(
            key: const ValueKey('service_field'),
            onTap: _audience == null ? null : _openPicker,
            borderRadius: BorderRadius.circular(12),
            child: InputDecorator(
              decoration: InputDecoration(
                hintText: _audience == null
                    ? 'Pick an audience first…'
                    : 'Select service…',
                suffixIcon: const Icon(
                  Icons.expand_more,
                  size: 18,
                  color: emerald300,
                ),
                enabled: _audience != null,
              ),
              child: Text(
                picked?.label ?? '',
                style: const TextStyle(color: cream, fontSize: 13.5),
              ),
            ),
          ),
          const SizedBox(height: 10),
          // Own-chair logins never see a stylist picker — their chair is the
          // session identity (see _ownStylist). Owner picks per service.
          if (!_ownChair)
            DropdownMenu<String>(
              // Rebuilt per service pick — DropdownMenu keeps its internal
              // text across rebuilds, and _pickStylistId resets when the
              // service changes (eligibility is per-service).
              key: ValueKey('stylist_pick_${picked?.id ?? ''}'),
              width: double.infinity,
              enabled: picked != null,
              initialSelection: pickedStylist?.id ?? '',
              dropdownMenuEntries: [
                DropdownMenuEntry(
                  value: '',
                  label: picked == null
                      ? 'Select a service first…'
                      : 'Select stylist…',
                ),
                ...eligible.map(
                  (s) => DropdownMenuEntry(value: s.id, label: s.name),
                ),
              ],
              onSelected: (v) => setState(
                  () => _pickStylistId = (v == null || v.isEmpty) ? null : v),
            ),
          const SizedBox(height: 12),
          // Three-state action button, mirroring the website: Add service →
          // Now pick a stylist → Confirm <service> · <stylist>. Own-chair
          // logins collapse it to two states: Add service → Confirm.
          if (picked == null)
            OutlineButton(
              label: 'Add service',
              icon: Icons.add,
              onPressed: _openPicker,
            )
          else if (pickedStylist == null)
            OutlineButton(
              label: 'Now pick a stylist',
              icon: Icons.person_outline,
              onPressed: null,
            )
          else
            GoldButton(
              key: const ValueKey('svc_add'),
              label: 'Confirm ${picked.label} · ${pickedStylist.name}',
              onPressed: _addItem,
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
              final sty = it.stylist;
              final rowEligible = _eligibleStylistsFor(it.service);
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
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
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
                                '${it.service.durationMins} min · ${inr(it.service.price)}',
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
                    // Inline stylist switch — the website has no separate
                    // stylist section either. Own-chair logins can't switch
                    // (they only ever book themselves) — show the name.
                    if (_ownChair)
                      Padding(
                        padding: const EdgeInsets.only(top: 2),
                        child: Text(
                          sty?.name ?? '',
                          style: const TextStyle(
                            color: emerald300,
                            fontSize: 12.5,
                          ),
                        ),
                      )
                    else
                      DropdownMenu<String>(
                        width: double.infinity,
                        initialSelection: sty?.id ?? '',
                        dropdownMenuEntries: [
                          const DropdownMenuEntry(
                            value: '',
                            label: 'Select stylist…',
                          ),
                          ...rowEligible.map(
                            (s) => DropdownMenuEntry(
                              value: s.id,
                              label: s.name,
                            ),
                          ),
                        ],
                        onSelected: (v) => _assignStylist(idx, v),
                      ),
                    if (sty != null &&
                        !rowEligible.any((s) => s.id == sty.id))
                      const Padding(
                        padding: EdgeInsets.only(top: 4),
                        child: Text(
                          'That stylist is off that day — pick someone working.',
                          style: TextStyle(color: amber400, fontSize: 11),
                        ),
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
          if (_items.isNotEmpty && !_allAssigned)
            const Padding(
              padding: EdgeInsets.only(top: 6),
              child: Text(
                'Assign a stylist to every service to continue.',
                style: TextStyle(color: amber400, fontSize: 11.5),
              ),
            ),
        ],
      ),
    );
  }

  // ── Step 3 · Time slot (grid + override + confirm-now + notes + book,
  // ── the website's Time slot card and submit row) ───────────────────────────
  Widget _buildTime({
    required Set<String> viable,
    required bool availLoaded,
    required bool isToday,
    required int nowMin,
    required bool Function(String) isPassed,
    required bool hasTaken,
    required List<CascadeEntry>? visitPlan,
  }) {
    return GlassCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const SectionTitle('Start time', icon: Icons.schedule),
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
                  'No start times available for this date — go back and try another day.',
                  style: TextStyle(color: amber400, fontSize: 11.5),
                ),
              ),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: allSlots.map((t) {
                final fitsClosing =
                    allSlots.indexOf(t) + _blockSlots <= allSlots.length;
                final passed = isPassed(t);
                // Late = inside the 10-min cutoff but seatable via the
                // walk-in override (current slot only). The last slot's
                // 20:15 grace needs no override — not "late".
                final late = !passed &&
                    t != '20:00' &&
                    isToday &&
                    toMins(t) - nowMin < 10;
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
                          final plan = visitPlan;
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
                                        '${fmtTime(minsToHm(w.startMin))}–${fmtTime(minsToHm(w.endMin))} · ${it.stylist?.name ?? ''}',
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
                onChanged: (v) {
                  setState(() => _ignoreCutoff = v ?? false);
                  // Leaving the current slot selected while the override
                  // turns off would strand an unbookable pick.
                  if (!(_ignoreCutoff) &&
                      _start != null &&
                      isToday &&
                      isPassed(_start!)) {
                    setState(() => _start = null);
                  }
                },
              ),
              const Icon(
                Icons.schedule,
                size: 16,
                color: amber400,
              ),
              const SizedBox(width: 6),
              const Expanded(
                child: Text(
                  'Walk-in override (unlock only the current hour\'s slot today)',
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
              hintText: 'e.g. Walk-in, prefers the chair by the window',
            ),
          ),
          const SizedBox(height: 16),
          GoldButton(
            label: _confirmNow ? 'Book & Confirm' : 'Save as Pending',
            busy: _saving,
            onPressed: _submit,
          ),
        ],
      ),
    );
  }
}

/// Thin progress strip above the wizard — one segment per step, filled up
/// to the current one, labels under the active segment.
class _StepProgress extends StatelessWidget {
  final List<String> steps;
  final int current;
  const _StepProgress({required this.steps, required this.current});

  @override
  Widget build(BuildContext context) {
    final reduced = MediaQuery.maybeDisableAnimationsOf(context) ?? false;
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 10, 16, 4),
      child: Column(
        children: [
          Row(
            children: [
              for (var i = 0; i < steps.length; i++) ...[
                if (i > 0) const SizedBox(width: 4),
                Expanded(
                  child: AnimatedContainer(
                    duration: reduced
                        ? Duration.zero
                        : const Duration(milliseconds: 200),
                    height: 3,
                    decoration: BoxDecoration(
                      color: i <= current ? gold500 : emerald800,
                      borderRadius: BorderRadius.circular(2),
                    ),
                  ),
                ),
              ],
            ],
          ),
          const SizedBox(height: 6),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                'Step ${current + 1} of ${steps.length}',
                style: const TextStyle(
                  color: gold400,
                  fontSize: 11,
                  fontWeight: FontWeight.w600,
                ),
              ),
              Text(
                steps[current],
                style: const TextStyle(
                  color: cream,
                  fontSize: 11,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

/// One cart row — a service plus its assigned stylist. The stylist is
/// picked alongside the service on the Services step (like the website)
/// and can be switched inline afterwards.
class _Item {
  final m.ServiceModel service;
  m.StylistModel? stylist;
  _Item({required this.service, this.stylist});
}
