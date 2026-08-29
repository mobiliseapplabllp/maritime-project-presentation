import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;

class ApiException implements Exception {
  ApiException(this.message, {this.status = 0});
  final String message;
  final int status;
  bool get isAuth => status == 401;
  bool get isForbidden => status == 403;
  @override
  String toString() => message;
}

/// Thin client for the Unified Maritime Platform API.
///
/// - Wraps the `{success, data, meta}` envelope; throws [ApiException] with the
///   server's own message on failure.
/// - Sends `Authorization: Bearer <token>`; on a 401 it attempts one silent
///   refresh (`POST /auth/refresh`) and retries the original request.
class ApiClient {
  ApiClient({String? baseUrl}) : baseUrl = baseUrl ?? defaultBaseUrl();

  final String baseUrl;
  String? _token;
  String? _refreshToken;

  /// Called whenever a login/refresh returns a fresh user payload.
  void Function(Map<String, dynamic> user)? onUser;

  /// Called when the session is lost (refresh failed) — the app returns to login.
  VoidCallback? onSessionExpired;

  bool get hasSession => _token != null;

  static String defaultBaseUrl() {
    // The Android emulator reaches the host machine via 10.0.2.2.
    if (!kIsWeb && Platform.isAndroid) return 'http://10.0.2.2:5200/api';
    return 'http://127.0.0.1:5200/api';
  }

  Map<String, String> _headers() => {
        'Content-Type': 'application/json',
        if (_token != null) 'Authorization': 'Bearer $_token',
      };

  Uri _uri(String path, [Map<String, String>? query]) =>
      Uri.parse('$baseUrl$path').replace(queryParameters: query);

  Future<Map<String, dynamic>> login(String email, String password) async {
    final data = await _request('POST', '/auth/login',
        body: {'email': email, 'password': password}, allowRetry: false);
    _adoptSession(data as Map<String, dynamic>);
    return data['user'] as Map<String, dynamic>;
  }

  void logout() {
    _token = null;
    _refreshToken = null;
  }

  void _adoptSession(Map<String, dynamic> data) {
    _token = data['token'] as String?;
    _refreshToken = data['refreshToken'] as String?;
    final user = data['user'];
    if (user is Map<String, dynamic>) onUser?.call(user);
  }

  Future<bool> _tryRefresh() async {
    final rt = _refreshToken;
    if (rt == null) return false;
    try {
      final data = await _request('POST', '/auth/refresh',
          body: {'refreshToken': rt}, allowRetry: false, authorized: false);
      _adoptSession(data as Map<String, dynamic>);
      return true;
    } on ApiException {
      logout();
      onSessionExpired?.call();
      return false;
    }
  }

  Future<dynamic> get(String path, {Map<String, String>? query}) =>
      _request('GET', path, query: query);

  Future<dynamic> post(String path, {Object? body}) =>
      _request('POST', path, body: body);

  Future<dynamic> put(String path, {Object? body}) =>
      _request('PUT', path, body: body);

  /// Like [get], but also returns the envelope `meta` (pagination, weights…).
  Future<(dynamic, Map<String, dynamic>)> getWithMeta(String path,
      {Map<String, String>? query}) async {
    final env = await _requestEnvelope('GET', path, query: query);
    return (env['data'], (env['meta'] as Map<String, dynamic>?) ?? const {});
  }

  Future<dynamic> _request(String method, String path,
      {Map<String, String>? query,
      Object? body,
      bool allowRetry = true,
      bool authorized = true}) async {
    final env = await _requestEnvelope(method, path,
        query: query, body: body, allowRetry: allowRetry, authorized: authorized);
    return env['data'];
  }

  Future<Map<String, dynamic>> _requestEnvelope(String method, String path,
      {Map<String, String>? query,
      Object? body,
      bool allowRetry = true,
      bool authorized = true}) async {
    http.Response res;
    try {
      final uri = _uri(path, query);
      final headers = authorized ? _headers() : {'Content-Type': 'application/json'};
      final encoded = body == null ? null : jsonEncode(body);
      res = switch (method) {
        'GET' => await http.get(uri, headers: headers),
        'POST' => await http.post(uri, headers: headers, body: encoded),
        'PUT' => await http.put(uri, headers: headers, body: encoded),
        _ => throw ApiException('Unsupported method $method'),
      };
    } on SocketException {
      throw ApiException('Cannot reach the server. Check that the platform API is running.');
    }

    if (res.statusCode == 401 && allowRetry && path != '/auth/login') {
      if (await _tryRefresh()) {
        return _requestEnvelope(method, path,
            query: query, body: body, allowRetry: false, authorized: authorized);
      }
    }

    Map<String, dynamic> env;
    try {
      env = jsonDecode(res.body) as Map<String, dynamic>;
    } catch (_) {
      throw ApiException('Unexpected server response (${res.statusCode})',
          status: res.statusCode);
    }
    if (env['success'] == true) return env;
    throw ApiException(
        (env['message'] as String?) ?? 'Request failed (${res.statusCode})',
        status: res.statusCode);
  }
}
