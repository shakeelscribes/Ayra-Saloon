/// Typed API client for the Ayra admin backend.
/// - Attaches the JWT from shared_preferences on every call
/// - Throws ApiException with the server's `detail` message when available
/// - On 401, clears the session and reports it so the shell can show Login
library;

import 'dart:convert';
import 'dart:async';

import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

import 'config.dart';
import 'models.dart';

class ApiException implements Exception {
  final int statusCode;
  final String message;
  final bool isAuthError;

  ApiException(this.statusCode, this.message, {this.isAuthError = false});

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

  // ── Availability ────────────────────────────────────────────────────────────
  Future<List<BusyInterval>> availability(String stylistId, String date, {String? excludeBookingId}) async {
    final q = excludeBookingId == null ? '' : '&exclude_booking_id=$excludeBookingId';
    final data = await _send('GET', '/availability/?stylist_id=$stylistId&date=$date$q');
    return (data['busy'] as List<dynamic>? ?? []).map((e) => BusyInterval.fromJson(e)).toList();
  }

  // ── Catalog ─────────────────────────────────────────────────────────────────
  Future<List<dynamic>> services() async => await _send('GET', '/services') as List<dynamic>;
  Future<List<dynamic>> stylists() async => await _send('GET', '/stylists') as List<dynamic>;

  // ── Notifications ───────────────────────────────────────────────────────────
  Future<List<dynamic>> notifications({int limit = 20}) async =>
      await _send('GET', '/notifications/all?limit=$limit') as List<dynamic>;

  Future<void> markSent(String id) => _send('POST', '/notifications/$id/mark-sent');

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
      throw ApiException(res.statusCode, msg, isAuthError: res.statusCode == 401);
    }
    return decoded;
  }
}
