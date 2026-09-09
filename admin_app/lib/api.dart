/// Typed API client for the Ayra admin backend.
/// - Attaches the JWT from shared_preferences on every call
/// - Throws ApiException with the server's `detail` message when available
/// - On 401, clears the session and reports it so the shell can show Login
library;

import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

import 'config.dart';
import 'models.dart';

class ApiException implements Exception {
  final int statusCode;
  final String message;
  final bool isAuthError;
  /// The un-processed server `detail` — needed for 409 responses whose detail
  /// is an OBJECT (time-off conflicts: {message, conflicts}), not a string.
  final dynamic rawDetail;

  ApiException(this.statusCode, this.message, {this.isAuthError = false, this.rawDetail});

  @override
  String toString() => message;
}

class Api {
  Api._();
  static final Api instance = Api._();

  static const _tokenKey = 'ayra_token';
  static const _userKey = 'ayra_user';

  String? _token;
  UserModel? _user;
  final _client = http.Client();

  UserModel? get user => _user;
  bool get hasSession => _token != null;

  /// Restores a saved session at app start. Returns true when a token exists.
  Future<bool> restoreSession() async {
    final prefs = await SharedPreferences.getInstance();
    _token = prefs.getString(_tokenKey);
    final raw = prefs.getString(_userKey);
    if (raw != null) {
      try {
        _user = UserModel.fromJson(jsonDecode(raw) as Map<String, dynamic>);
      } catch (_) {
        _user = null;
      }
    }
    return _token != null;
  }

  Future<void> login(String email, String password) async {
    final data = await _send('POST', '/auth/login',
        body: {'email': email, 'password': password}, auth: false);
    _token = data['access_token'] as String?;
    _user = UserModel.fromJson(data['user'] as Map<String, dynamic>);
    if (!_user!.isAdmin) {
      // Mirror the web panel: staff app refuses non-admin accounts.
      _token = null;
      _user = null;
      throw ApiException(403, 'This account is not an admin.', isAuthError: true);
    }
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_tokenKey, _token!);
    await prefs.setString(_userKey, jsonEncode(data['user']));
  }

  Future<void> logout() async {
    _token = null;
    _user = null;
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_tokenKey);
    await prefs.remove(_userKey);
  }

  // ── Bookings ────────────────────────────────────────────────────────────────
  Future<List<dynamic>> adminBookings({String? date}) async {
    final data = await _send('GET', '/bookings/admin/all${date != null && date.isNotEmpty ? '?date=$date' : ''}');
    return data as List<dynamic>;
  }

  Future<void> createWalkIn(Map<String, dynamic> body) =>
      _send('POST', '/bookings/admin/create', body: body);

  Future<void> approve(String id) => _send('POST', '/bookings/$id/approve');
  Future<void> decline(String id) => _send('POST', '/bookings/$id/decline');
  Future<void> cancel(String id) => _send('DELETE', '/bookings/$id');

  Future<void> proposeReschedule(String id, String date, String timeSlot, String? reason) =>
      _send('POST', '/bookings/$id/propose-reschedule',
          body: {'date': date, 'time_slot': timeSlot, 'reason': reason});

  // ── Customer lookup ─────────────────────────────────────────────────────────
  /// Find a customer by phone for the walk-in form's autofill. Read-only —
  /// the form fills from the snapshot; the account itself is never touched.
  /// found=false for unknown numbers and staff accounts.
  Future<CustomerLookup> lookupCustomer(String phone) async {
    final data = await _send('GET', '/users/lookup?phone=${Uri.encodeComponent(phone)}');
    return CustomerLookup.fromJson(data as Map<String, dynamic>);
  }

  // ── Availability ────────────────────────────────────────────────────────────
  /// When [result.stylistOff] is true the stylist marked the date off — the
  /// busy list is empty but the whole day is blocked. Mirrors the web panel's
  /// defensive mapping: off → a full-day busy block (10:00–21:00) so the
  /// existing slot math greys every start without special-casing.
  Future<AvailabilityResult> availability(String stylistId, String date, {String? excludeBookingId}) async {
    final q = excludeBookingId == null ? '' : '&exclude_booking_id=$excludeBookingId';
    final data = await _send('GET', '/availability/?stylist_id=$stylistId&date=$date$q');
    final off = data['stylist_off'] == true;
    final busy = (data['busy'] as List<dynamic>? ?? [])
        .map((e) => BusyInterval.fromJson(e))
        .toList();
    if (off) {
      return AvailabilityResult(
        busy: [BusyInterval(start: '10:00', end: '21:00')],
        stylistOff: true,
      );
    }
    return AvailabilityResult(busy: busy);
  }

  // ── Catalog ─────────────────────────────────────────────────────────────────
  Future<List<dynamic>> services() async => await _send('GET', '/services') as List<dynamic>;
  Future<List<dynamic>> stylists() async => await _send('GET', '/stylists') as List<dynamic>;

  // ── Stylist availability (off-day roster) ───────────────────────────────────
  /// Working vs off stylists for ONE date. Powers the New-Appointment
  /// filtering (off stylists excluded, unbookable services hidden) and the
  /// dashboard off-day banner. Mirrors GET /stylists/available.
  Future<StylistsAvailable> stylistsAvailable(String date) async {
    final data = await _send('GET', '/stylists/available?date=$date');
    return StylistsAvailable.fromJson(data);
  }

  // ── Time off ────────────────────────────────────────────────────────────────
  /// All staff-marked ranges from today on (shared banner). Owner + stylists.
  Future<List<TimeOffModel>> upcomingTimeOff() async {
    final data = await _send('GET', '/stylists/time-off/upcoming') as List<dynamic>;
    return data.map((e) => TimeOffModel.fromJson(e)).toList();
  }

  /// The signed-in stylist's own ranges. Owner gets 403 (no stylist link).
  Future<List<TimeOffModel>> myTimeOff() async {
    final data = await _send('GET', '/stylists/time-off/me') as List<dynamic>;
    return data.map((e) => TimeOffModel.fromJson(e)).toList();
  }

  /// Mark a range off (self-only). Throws [TimeOffConflictException] on 409 —
  /// either an overlapping own range (message only) or active bookings in the
  /// range (message + conflicts list to cancel/reschedule first).
  Future<List<TimeOffModel>> addTimeOff(String start, String end, String? reason) async {
    try {
      final data = await _send('POST', '/stylists/time-off/me',
          body: {'start': start, 'end': end, 'reason': reason});
      return (data as List<dynamic>).map((e) => TimeOffModel.fromJson(e)).toList();
    } on ApiException catch (e) {
      if (e.statusCode == 409 && e.rawDetail is Map<String, dynamic>) {
        final d = e.rawDetail as Map<String, dynamic>;
        final conflicts = (d['conflicts'] as List<dynamic>? ?? [])
            .map((c) => TimeOffConflict.fromJson(c))
            .toList();
        throw TimeOffConflictException(
          d['message']?.toString() ?? e.message,
          conflicts,
        );
      }
      rethrow;
    }
  }

  /// Un-mark a range — availability returns immediately.
  Future<void> removeTimeOff(String id) =>
      _send('DELETE', '/stylists/time-off/me/$id');

  // ── Economy ─────────────────────────────────────────────────────────────────
  Future<EconomySummaryModel> economySummary(String from, String to) async {
    final data = await _send('GET', '/economy/summary?from=$from&to=$to');
    return EconomySummaryModel.fromJson(data);
  }

  /// The signed-in stylist's OWN earnings (owner gets 403 — no stylist link).
  Future<StylistMeSummaryModel> meSummary() async {
    final data = await _send('GET', '/economy/me/summary');
    return StylistMeSummaryModel.fromJson(data);
  }

  /// Owner-only per-stylist performance for the By Stylist tab.
  Future<ByStylistResponseModel> byStylist(String from, String to) async {
    final data = await _send('GET', '/economy/by-stylist?from=$from&to=$to');
    return ByStylistResponseModel.fromJson(data);
  }

  Future<List<ExpenseModel>> expenses(String from, String to) async {
    final data = await _send('GET', '/economy/expenses?from=$from&to=$to') as List<dynamic>;
    return data.map((e) => ExpenseModel.fromJson(e)).toList();
  }

  Future<void> addExpense({
    required String date,
    required String category,
    String? description,
    required num amount,
  }) =>
      _send('POST', '/economy/expenses', body: {
        'date': date,
        'category': category,
        'description': description,
        'amount': amount,
      });

  Future<void> deleteExpense(String id) => _send('DELETE', '/economy/expenses/$id');

  Future<BudgetResponseModel> budgets(String month) async {
    final data = await _send('GET', '/economy/budgets?month=$month');
    return BudgetResponseModel.fromJson(data);
  }

  /// Set (or clear with 0) a monthly per-category budget target.
  Future<BudgetResponseModel> setBudget(String month, String category, num amount) async {
    final data = await _send('PUT', '/economy/budgets?month=$month',
        body: {'category': category, 'amount': amount});
    return BudgetResponseModel.fromJson(data);
  }

  /// CSV export — returns the raw UTF-8 text (backend adds a BOM). The app
  /// has no file/share dependencies, so the UI offers a preview + clipboard
  /// copy instead of a download.
  Future<String> exportCsv(String type, String from, String to) async {
    final uri = Uri.parse('$apiBaseUrl/economy/export?type=$type&from=$from&to=$to');
    final headers = <String, String>{};
    if (_token != null) headers['Authorization'] = 'Bearer $_token';
    late http.Response res;
    try {
      res = await _client.get(uri, headers: headers).timeout(const Duration(seconds: 15));
    } on TimeoutException {
      throw ApiException(0, 'Server took too long to respond.');
    } catch (_) {
      throw ApiException(0, 'Cannot reach the salon server. Check the connection.');
    }
    if (res.statusCode >= 400) {
      throw ApiException(res.statusCode, 'Export failed (${res.statusCode})',
          isAuthError: res.statusCode == 401);
    }
    return utf8.decode(res.bodyBytes);
  }

  // ── Notifications ───────────────────────────────────────────────────────────
  Future<List<dynamic>> notifications({int limit = 20}) async =>
      await _send('GET', '/notifications/all?limit=$limit') as List<dynamic>;

  Future<void> markSent(String id) => _send('POST', '/notifications/$id/mark-sent');

  // ── Device tokens (FCM alert registration — stylist only) ──────────────────
  Future<void> registerDeviceToken(String token, {String platform = 'android'}) =>
      _send('POST', '/devices/token', body: {'token': token, 'platform': platform});

  Future<void> unregisterDeviceToken(String token) =>
      _send('DELETE', '/devices/token?token=${Uri.encodeComponent(token)}');

  // ── Pending count (alert polling fallback) ──────────────────────────────────
  /// `{count, latest_id}` for the signed-in stylist's pending bookings.
  Future<Map<String, dynamic>> pendingCount() async {
    final data = await _send('GET', '/bookings/pending-count');
    return data as Map<String, dynamic>;
  }

  // ── Transport ───────────────────────────────────────────────────────────────
  Future<dynamic> _send(String method, String path, {Map<String, dynamic>? body, bool auth = true}) async {
    final uri = Uri.parse('$apiBaseUrl$path');
    final headers = {'Content-Type': 'application/json'};
    if (auth && _token != null) headers['Authorization'] = 'Bearer $_token';

    late http.Response res;
    try {
      switch (method) {
        case 'GET':
          res = await _client.get(uri, headers: headers).timeout(const Duration(seconds: 15));
        case 'DELETE':
          res = await _client.delete(uri, headers: headers).timeout(const Duration(seconds: 15));
        case 'POST':
          res = await _client.post(uri, headers: headers, body: jsonEncode(body ?? {})).timeout(const Duration(seconds: 15));
        case 'PUT':
          res = await _client.put(uri, headers: headers, body: jsonEncode(body ?? {})).timeout(const Duration(seconds: 15));
        default:
          throw ApiException(0, 'Unsupported method $method');
      }
    } on TimeoutException {
      throw ApiException(0, 'Server took too long to respond.');
    } catch (_) {
      throw ApiException(0, 'Cannot reach the salon server. Check the connection.');
    }

    if (res.statusCode == 204) return null;

    dynamic decoded;
    try {
      decoded = res.body.isEmpty ? null : jsonDecode(res.body);
    } catch (_) {
      decoded = null;
    }

    if (res.statusCode >= 400) {
      final detail = decoded is Map<String, dynamic> ? decoded['detail'] : null;
      final msg = detail is String ? detail : (detail != null ? jsonEncode(detail) : 'Request failed (${res.statusCode})');
      throw ApiException(res.statusCode, msg,
          isAuthError: res.statusCode == 401, rawDetail: detail);
    }
    return decoded;
  }
}
