import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:provider/provider.dart';

import 'package:marine_mobile/main.dart';
import 'package:marine_mobile/session.dart';

// Drives representative screens and captures device screenshots.
// Run with: flutter test integration_test/shots_test.dart -d <sim>
void main() {
  final binding = IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  Future<void> shot(WidgetTester tester, String name) async {
    await tester.pumpAndSettle();
    await binding.takeScreenshot(name);
  }

  Future<void> settle(WidgetTester tester, [int t = 16]) async {
    for (var i = 0; i < t; i++) {
      await tester.pump(const Duration(milliseconds: 350));
    }
    await tester.pumpAndSettle();
  }

  Future<Session> signIn(WidgetTester tester, String app, String email) async {
    await tester.pumpWidget(ChangeNotifierProvider(
        create: (_) => Session(), child: const MaritimeMobileApp()));
    await tester.pumpAndSettle();
    await tester.tap(find.text(app));
    await tester.pumpAndSettle();
    await tester.enterText(find.widgetWithText(TextField, 'Email'), email);
    await tester.enterText(find.widgetWithText(TextField, 'Password'), 'Demo@2026');
    await tester.tap(find.textContaining('Enter '));
    await settle(tester, 20);
    return tester.element(find.byType(NavigationBar)).read<Session>();
  }

  testWidgets('capture authority', (tester) async {
    await signIn(tester, 'Marine Ops', 'surveyor@maritime.example');
    await shot(tester, '01-authority-home');
    await tester.tap(find.text('Targets'));
    await settle(tester);
    await shot(tester, '02-authority-targets');
    await tester.tap(find.text('Inspect'));
    await settle(tester);
    await shot(tester, '03-authority-inspections');
    final ins = find.textContaining('INS-').hitTestable();
    if (tester.any(ins)) {
      await tester.tap(ins.first);
      await settle(tester);
      await shot(tester, '04-authority-checklist');
      await tester.pageBack();
      await tester.pumpAndSettle();
    }
    await tester.tap(find.text('Alerts'));
    await settle(tester);
    await shot(tester, '05-authority-alerts');
  });

  testWidgets('capture customer', (tester) async {
    await signIn(tester, 'Maritime Services', 'agent@maritime.example');
    await shot(tester, '06-customer-home');
    await tester.tap(find.text('Services'));
    await settle(tester);
    await shot(tester, '07-customer-services');
    final chev = find.byIcon(Icons.chevron_right).hitTestable();
    if (tester.any(chev)) {
      await tester.tap(chev.first);
      await settle(tester);
      await shot(tester, '08-customer-apply');
      await tester.pageBack();
      await tester.pumpAndSettle();
    }
    await tester.tap(find.text('Fleet'));
    await settle(tester);
    final imo = find.textContaining('IMO ').hitTestable();
    if (tester.any(imo)) {
      await tester.tap(imo.first);
      await settle(tester);
      await shot(tester, '09-customer-wallet');
      await tester.pageBack();
      await tester.pumpAndSettle();
    }
    await tester.tap(find.text('Billing'));
    await settle(tester);
    await shot(tester, '10-customer-billing');
  });
}
