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

  UserModel({required this.id, required this.name, required this.email, this.phone, required this.isAdmin});

  factory UserModel.fromJson(Map<String, dynamic> j) => UserModel(
        id: j['id'].toString(),
        name: j['name'] ?? '',
        email: j['email'] ?? '',
        phone: j['phone'],
        isAdmin: j['is_admin'] == true,
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
