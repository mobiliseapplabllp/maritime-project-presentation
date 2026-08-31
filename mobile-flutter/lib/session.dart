import 'package:flutter/foundation.dart';

import 'api/api_client.dart';

/// Authenticated session: the signed-in user, their flat permission list, and
/// the shared [ApiClient]. RBAC gating mirrors the platform: a permission is
/// held when the list contains `*` or the exact `module.action` string.
class Session extends ChangeNotifier {
  Session() {
    api = ApiClient();
    api.onUser = (user) {
      _user = user;
      notifyListeners();
    };
    api.onSessionExpired = () {
      _user = null;
      notifyListeners();
    };
  }

  late final ApiClient api;
  Map<String, dynamic>? _user;

  Map<String, dynamic>? get user => _user;
  bool get signedIn => _user != null && api.hasSession;

  String get name => (_user?['name'] as String?) ?? '';
  String get designation => (_user?['designation'] as String?) ?? '';
  String get roleName =>
      ((_user?['role'] as Map<String, dynamic>?)?['name'] as String?) ?? '';
  List<String> get perms =>
      ((_user?['perms'] as List?)?.cast<String>()) ?? const [];

  bool can(String perm) => perms.contains('*') || perms.contains(perm);

  Future<void> login(String email, String password) async {
    await api.login(email, password);
  }

  void logout() {
    api.logout();
    _user = null;
    notifyListeners();
  }
}
