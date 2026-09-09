/// JSON models mirroring backend/schemas.py response shapes.
/// Parsing is defensive: optional fields stay nullable so old snapshot
/// bookings (legacy singular service/stylist) still render.
library;

class UserModel {
  final String id;
  final String name;
  final String email;
  final String? phone;
  final bool isAdmin;
  // Staff identity — mirrors UserOut on the backend: "owner" (is_admin, no
  // stylist link) or "stylist" (is_admin + stylist_id). Stylists act only on
  // their own chair; the owner sees everything.
  final String role; // owner | stylist | customer
  final String? stylistId;

  UserModel({
    required this.id,
    required this.name,
    required this.email,
    this.phone,
    required this.isAdmin,
    this.role = 'customer',
    this.stylistId,
  });

  bool get isOwner => role == 'owner';
  bool get isStylist => role == 'stylist';

  factory UserModel.fromJson(Map<String, dynamic> j) => UserModel(
        id: j['id'].toString(),
        name: j['name'] ?? '',
        email: j['email'] ?? '',
        phone: j['phone'],
        isAdmin: j['is_admin'] == true,
        role: j['role'] ?? 'customer',
        stylistId: j['stylist_id']?.toString(),
      );
}

class ServiceModel {
  final String id;
  final String name;
  final String? description;
  final int durationMins;
  final num price;
  final String category;
  final String audience; // men | women | unisex
  final bool forKids;
  final String? kidGender; // boy | girl | null
  final int popularity;
  final bool bookable; // false = enquiry-only (bridal) — never bookable

  ServiceModel({
    required this.id,
    required this.name,
    this.description,
    required this.durationMins,
    required this.price,
    required this.category,
    this.audience = 'unisex',
    this.forKids = false,
    this.kidGender,
    this.popularity = 50,
    this.bookable = true,
  });

  factory ServiceModel.fromJson(Map<String, dynamic> j) => ServiceModel(
        id: j['id'].toString(),
        name: j['name'] ?? '',
        description: j['description'],
        durationMins: j['duration_mins'] ?? 60,
        price: j['price'] ?? 0,
        category: j['category'] ?? '',
        audience: j['audience'] ?? 'unisex',
        forKids: j['for_kids'] == true,
        kidGender: j['kid_gender'],
        popularity: j['popularity'] ?? 50,
        bookable: j['bookable'] != false,
      );

  /// Kids services come in Boy/Girl variants that share one name — append the
  /// variant wherever the service is listed as plain text (mirrors the web UI).
  String get label => kidGender == null
      ? name
      : '$name (${kidGender![0].toUpperCase()}${kidGender!.substring(1)})';
}

class StylistModel {
  final String id;
  final String name;
  final List<String> categories;

  StylistModel({required this.id, required this.name, required this.categories});

  factory StylistModel.fromJson(Map<String, dynamic> j) => StylistModel(
        id: j['id'].toString(),
        name: j['name'] ?? '',
        categories: (j['categories'] as List<dynamic>? ?? []).map((e) => e.toString()).toList(),
      );
}

class SlotModel {
  final String id;
  final ServiceModel? service;
  final StylistModel? stylist;
  final String timeSlot;
  final int durationMins;

  SlotModel({required this.id, this.service, this.stylist, required this.timeSlot, required this.durationMins});

  factory SlotModel.fromJson(Map<String, dynamic> j) => SlotModel(
        id: j['id'].toString(),
        service: j['service'] == null ? null : ServiceModel.fromJson(j['service']),
        stylist: j['stylist'] == null ? null : StylistModel.fromJson(j['stylist']),
        timeSlot: j['time_slot'] ?? '',
        durationMins: j['duration_mins'] ?? 60,
      );
}

class BookingModel {
  final String id;
  final String date;
  final String? timeSlot;
  final ServiceModel? service;      // legacy singular shape
  final StylistModel? stylist;      // legacy singular shape
  final String? customerName;
  final String? customerPhone;
  final List<SlotModel> slots;
  final String status;
  final String source;
  final String? proposedDate;
  final String? proposedTimeSlot;
  final String? notes;

  BookingModel({
    required this.id,
    required this.date,
    this.timeSlot,
    this.service,
    this.stylist,
    this.customerName,
    this.customerPhone,
    required this.slots,
    required this.status,
    required this.source,
    this.proposedDate,
    this.proposedTimeSlot,
    this.notes,
  });

  factory BookingModel.fromJson(Map<String, dynamic> j) => BookingModel(
        id: j['id'].toString(),
        date: j['date'] ?? '',
        timeSlot: j['time_slot'],
        service: j['service'] == null ? null : ServiceModel.fromJson(j['service']),
        stylist: j['stylist'] == null ? null : StylistModel.fromJson(j['stylist']),
        customerName: j['customer_name'],
        customerPhone: j['customer_phone'],
        slots: (j['slots'] as List<dynamic>? ?? []).map((e) => SlotModel.fromJson(e)).toList(),
        status: j['status'] ?? '',
        source: j['source'] ?? 'online',
        proposedDate: j['proposed_date'],
        proposedTimeSlot: j['proposed_time_slot'],
        notes: j['notes'],
      );

  List<SlotModel> get rows => slots; // multi-slot shape; legacy falls back below
  String get firstSlotTime => slots.isNotEmpty ? slots.first.timeSlot : (timeSlot ?? '');
  num get totalPrice => slots.isNotEmpty
      ? slots.fold(0, (s, sl) => s + (sl.service?.price ?? 0))
      : (service?.price ?? 0);
}

class BusyInterval {
  final String start; // "HH:MM"
  final String end;

  BusyInterval({required this.start, required this.end});

  factory BusyInterval.fromJson(Map<String, dynamic> j) =>
      BusyInterval(start: j['start'] ?? '00:00', end: j['end'] ?? '00:00');
}

class NotificationModel {
  final String id;
  final String phone;
  final String kind;
  final String renderedText;
  final String deepLink;
  final String deliveryStatus; // pending | manual_sent | auto_sent | failed
  final DateTime? sentAt;
  final DateTime? createdAt;

  NotificationModel({
    required this.id,
    required this.phone,
    required this.kind,
    required this.renderedText,
    required this.deepLink,
    required this.deliveryStatus,
    this.sentAt,
    this.createdAt,
  });

  factory NotificationModel.fromJson(Map<String, dynamic> j) => NotificationModel(
        id: j['id'].toString(),
        phone: j['phone'] ?? '',
        kind: j['kind'] ?? '',
        renderedText: j['rendered_text'] ?? '',
        deepLink: j['deep_link'] ?? '',
        deliveryStatus: (j['delivery_status'] ?? 'pending').toString(),
        sentAt: j['sent_at'] == null ? null : DateTime.tryParse(j['sent_at']),
        createdAt: j['created_at'] == null ? null : DateTime.tryParse(j['created_at']),
      );
}

// ── Customer lookup (walk-in form autofill) ──────────────────────────────────

/// GET /users/lookup answer — a minimal customer snapshot for the walk-in
/// form. found=false for unknown numbers AND staff accounts, so the form
/// never pre-fills from an admin/stylist record.
class CustomerLookup {
  final bool found;
  final String? name;
  final String? email;
  final String? phone;

  CustomerLookup({required this.found, this.name, this.email, this.phone});

  factory CustomerLookup.fromJson(Map<String, dynamic> j) => CustomerLookup(
        found: j['found'] == true,
        name: j['name']?.toString(),
        email: j['email']?.toString(),
        phone: j['phone']?.toString(),
      );
}

// ── Time off ──────────────────────────────────────────────────────────────────

class TimeOffModel {
  final String id;
  final String stylistId;
  final String start; // "YYYY-MM-DD" inclusive
  final String end; // "YYYY-MM-DD" inclusive
  final String? reason;
  final DateTime? createdAt;

  TimeOffModel({
    required this.id,
    required this.stylistId,
    required this.start,
    required this.end,
    this.reason,
    this.createdAt,
  });

  factory TimeOffModel.fromJson(Map<String, dynamic> j) => TimeOffModel(
        id: j['id'].toString(),
        stylistId: j['stylist_id']?.toString() ?? '',
        start: j['start'] ?? '',
        end: j['end'] ?? '',
        reason: j['reason'],
        createdAt: j['created_at'] == null
            ? null
            : DateTime.tryParse(j['created_at']),
      );
}

/// One row of the 409 conflict list — a booking that blocks a time-off range.
class TimeOffConflict {
  final String bookingId;
  final String date;
  final String? timeSlot;
  final String status;
  final String source;

  TimeOffConflict({
    required this.bookingId,
    required this.date,
    this.timeSlot,
    required this.status,
    required this.source,
  });

  factory TimeOffConflict.fromJson(Map<String, dynamic> j) => TimeOffConflict(
        bookingId: j['booking_id']?.toString() ?? '',
        date: j['date'] ?? '',
        timeSlot: j['time_slot'],
        status: j['status'] ?? '',
        source: j['source'] ?? 'online',
      );
}

/// Thrown by POST /stylists/time-off/me with 409 when the range overlaps an
/// existing range (message only) or holds active bookings (message + list).
class TimeOffConflictException implements Exception {
  final String message;
  final List<TimeOffConflict> conflicts;
  TimeOffConflictException(this.message, this.conflicts);

  @override
  String toString() => message;
}

// ── Economy ───────────────────────────────────────────────────────────────────

/// Same fixed category ids/labels as backend EXPENSE_CATEGORIES — keep in
/// sync (the backend rejects anything else with 400).
const kExpenseCategories = <(String, String)>[
  ('rent', 'Rent'),
  ('products', 'Products'),
  ('salaries', 'Salaries'),
  ('utilities', 'Utilities'),
  ('marketing', 'Marketing'),
  ('maintenance', 'Maintenance'),
  ('other', 'Other'),
];

String expenseCategoryLabel(String id) {
  for (final (cid, label) in kExpenseCategories) {
    if (cid == id) return label;
  }
  return id.isEmpty ? '—' : id;
}

class ExpenseModel {
  final String id;
  final String date; // "YYYY-MM-DD"
  final String category;
  final String? description;
  final num amount;

  ExpenseModel({
    required this.id,
    required this.date,
    required this.category,
    this.description,
    required this.amount,
  });

  factory ExpenseModel.fromJson(Map<String, dynamic> j) => ExpenseModel(
        id: j['id'].toString(),
        date: j['date'] ?? '',
        category: j['category'] ?? '',
        description: j['description'],
        amount: j['amount'] ?? 0,
      );
}

class BudgetCategoryStatus {
  final String category;
  final num target;
  final num spent;

  BudgetCategoryStatus({
    required this.category,
    this.target = 0,
    this.spent = 0,
  });

  factory BudgetCategoryStatus.fromJson(Map<String, dynamic> j) =>
      BudgetCategoryStatus(
        category: j['category'] ?? '',
        target: j['target'] ?? 0,
        spent: j['spent'] ?? 0,
      );
}

class BudgetResponseModel {
  final String month; // "YYYY-MM"
  final List<BudgetCategoryStatus> categories;

  BudgetResponseModel({required this.month, this.categories = const []});

  factory BudgetResponseModel.fromJson(Map<String, dynamic> j) =>
      BudgetResponseModel(
        month: j['month'] ?? '',
        categories: (j['categories'] as List<dynamic>? ?? [])
            .map((e) => BudgetCategoryStatus.fromJson(e))
            .toList(),
      );
}

class EconomySummaryModel {
  final String fromDate;
  final String toDate;
  final num income;
  final num expenses;
  final num net;
  final int bookingsTotal;
  final int bookingsConfirmed;
  final int bookingsCancelled;
  final int bookingsDeclined;
  final int walkIns;
  final int online;
  final Map<String, num> incomeByCategory;
  final Map<String, num> incomeByStylist;
  final Map<String, num> expensesByCategory;
  final List<EconomyDailyPoint> daily;

  EconomySummaryModel({
    required this.fromDate,
    required this.toDate,
    this.income = 0,
    this.expenses = 0,
    this.net = 0,
    this.bookingsTotal = 0,
    this.bookingsConfirmed = 0,
    this.bookingsCancelled = 0,
    this.bookingsDeclined = 0,
    this.walkIns = 0,
    this.online = 0,
    this.incomeByCategory = const {},
    this.incomeByStylist = const {},
    this.expensesByCategory = const {},
    this.daily = const [],
  });

  factory EconomySummaryModel.fromJson(Map<String, dynamic> j) =>
      EconomySummaryModel(
        fromDate: j['from_date'] ?? '',
        toDate: j['to_date'] ?? '',
        income: j['income'] ?? 0,
        expenses: j['expenses'] ?? 0,
        net: j['net'] ?? 0,
        bookingsTotal: j['bookings_total'] ?? 0,
        bookingsConfirmed: j['bookings_confirmed'] ?? 0,
        bookingsCancelled: j['bookings_cancelled'] ?? 0,
        bookingsDeclined: j['bookings_declined'] ?? 0,
        walkIns: j['walk_ins'] ?? 0,
        online: j['online'] ?? 0,
        incomeByCategory: _numMap(j['income_by_category']),
        incomeByStylist: _numMap(j['income_by_stylist']),
        expensesByCategory: _numMap(j['expenses_by_category']),
        daily: (j['daily'] as List<dynamic>? ?? [])
            .map((e) => EconomyDailyPoint.fromJson(e))
            .toList(),
      );

  static Map<String, num> _numMap(dynamic v) {
    if (v is Map<String, dynamic>) {
      return v.map((k, e) => MapEntry(k, (e as num?) ?? 0));
    }
    return {};
  }
}

class EconomyDailyPoint {
  final String date;
  final num income;
  final num expense;

  EconomyDailyPoint({required this.date, this.income = 0, this.expense = 0});

  factory EconomyDailyPoint.fromJson(Map<String, dynamic> j) =>
      EconomyDailyPoint(
        date: j['date'] ?? '',
        income: j['income'] ?? 0,
        expense: j['expense'] ?? 0,
      );
}

// ── Stylist's own earnings (GET /economy/me/summary) ─────────────────────────

/// The "Next up" hint on the stylist dashboard — their earliest upcoming
/// confirmed booking. All fields defensive: the backend may omit any.
class NextAppointmentModel {
  final String bookingId;
  final String date;
  final String? timeSlot;
  final String? customerName;
  final List<String> services;

  NextAppointmentModel({
    required this.bookingId,
    required this.date,
    this.timeSlot,
    this.customerName,
    this.services = const [],
  });

  factory NextAppointmentModel.fromJson(Map<String, dynamic> j) =>
      NextAppointmentModel(
        bookingId: j['booking_id']?.toString() ?? '',
        date: j['date'] ?? '',
        timeSlot: j['time_slot']?.toString(),
        customerName: j['customer_name']?.toString(),
        services: (j['services'] as List<dynamic>? ?? [])
            .map((e) => e.toString())
            .toList(),
      );
}

/// The signed-in stylist's OWN numbers — never salon-wide. Mirrors
/// StylistMeSummary on the backend.
class StylistMeSummaryModel {
  final String today; // "YYYY-MM-DD" (IST)
  final String month; // "YYYY-MM" (IST)
  final num todayRevenue;
  final int todayBookings;
  final num monthRevenue;
  final int monthBookings;
  final NextAppointmentModel? nextAppointment;

  StylistMeSummaryModel({
    required this.today,
    required this.month,
    this.todayRevenue = 0,
    this.todayBookings = 0,
    this.monthRevenue = 0,
    this.monthBookings = 0,
    this.nextAppointment,
  });

  factory StylistMeSummaryModel.fromJson(Map<String, dynamic> j) =>
      StylistMeSummaryModel(
        today: j['today'] ?? '',
        month: j['month'] ?? '',
        todayRevenue: j['today_revenue'] ?? 0,
        todayBookings: j['today_bookings'] ?? 0,
        monthRevenue: j['month_revenue'] ?? 0,
        monthBookings: j['month_bookings'] ?? 0,
        nextAppointment: j['next_appointment'] is Map<String, dynamic>
            ? NextAppointmentModel.fromJson(
                j['next_appointment'] as Map<String, dynamic>)
            : null,
      );
}

// ── Owner's per-stylist performance (GET /economy/by-stylist) ────────────────

/// One service inside a stylist's top-services list.
class TopServiceModel {
  final String name;
  final int count;
  final num revenue;

  TopServiceModel({required this.name, this.count = 0, this.revenue = 0});

  factory TopServiceModel.fromJson(Map<String, dynamic> j) => TopServiceModel(
        name: j['name'] ?? '',
        count: j['count'] ?? 0,
        revenue: j['revenue'] ?? 0,
      );
}

/// Per-stylist aggregates for the owner's Economy → By Stylist tab. Mirrors
/// StylistPerformance on the backend.
class StylistPerformanceModel {
  final String stylistId;
  final String stylistName;
  final num revenue;
  final int bookings; // distinct bookings involving this stylist
  final int slots; // individual services performed
  final num bookedHours;
  final List<TopServiceModel> topServices; // best-first

  StylistPerformanceModel({
    required this.stylistId,
    required this.stylistName,
    this.revenue = 0,
    this.bookings = 0,
    this.slots = 0,
    this.bookedHours = 0,
    this.topServices = const [],
  });

  factory StylistPerformanceModel.fromJson(Map<String, dynamic> j) =>
      StylistPerformanceModel(
        stylistId: j['stylist_id']?.toString() ?? '',
        stylistName: j['stylist_name'] ?? '',
        revenue: j['revenue'] ?? 0,
        bookings: j['bookings'] ?? 0,
        slots: j['slots'] ?? 0,
        bookedHours: j['booked_hours'] ?? 0,
        topServices: (j['top_services'] as List<dynamic>? ?? [])
            .map((e) => TopServiceModel.fromJson(e))
            .toList(),
      );
}

/// GET /economy/by-stylist response — confirmed bookings only, [from, to].
class ByStylistResponseModel {
  final String fromDate;
  final String toDate;
  final List<StylistPerformanceModel> stylists;

  ByStylistResponseModel({
    required this.fromDate,
    required this.toDate,
    this.stylists = const [],
  });

  factory ByStylistResponseModel.fromJson(Map<String, dynamic> j) =>
      ByStylistResponseModel(
        fromDate: j['from_date'] ?? '',
        toDate: j['to_date'] ?? '',
        stylists: (j['stylists'] as List<dynamic>? ?? [])
            .map((e) => StylistPerformanceModel.fromJson(e))
            .toList(),
      );
}

/// Availability call result — [stylistOff] is the backend's flag that the
/// stylist marked this date off (busy stays empty; UI greys the whole day).
class AvailabilityResult {
  final List<BusyInterval> busy;
  final bool stylistOff;

  AvailabilityResult({required this.busy, this.stylistOff = false});
}

// ── Off-day roster ────────────────────────────────────────────────────────────

/// One stylist's working status for a specific date (StylistAvailabilityOut).
class StylistAvailability {
  final StylistModel stylist;
  final bool isOff;

  StylistAvailability({required this.stylist, this.isOff = false});

  factory StylistAvailability.fromJson(Map<String, dynamic> j) =>
      StylistAvailability(
        stylist: StylistModel.fromJson(j['stylist'] ?? {}),
        isOff: j['is_off'] == true,
      );
}

/// GET /stylists/available response — working vs off for one date.
class StylistsAvailable {
  final String date;
  final List<StylistAvailability> working;
  final List<StylistAvailability> off;

  StylistsAvailable({
    required this.date,
    this.working = const [],
    this.off = const [],
  });

  factory StylistsAvailable.fromJson(Map<String, dynamic> j) =>
      StylistsAvailable(
        date: j['date'] ?? '',
        working: (j['working'] as List<dynamic>? ?? [])
            .map((e) => StylistAvailability.fromJson(e))
            .toList(),
        off: (j['off'] as List<dynamic>? ?? [])
            .map((e) => StylistAvailability.fromJson(e))
            .toList(),
      );
}
