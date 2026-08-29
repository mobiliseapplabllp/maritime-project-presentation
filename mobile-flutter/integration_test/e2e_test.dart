import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:provider/provider.dart';

import 'package:marine_mobile/main.dart';
import 'package:marine_mobile/session.dart';

/// End-to-end suite: real app, real API, seeded world.
/// Run: `flutter test integration_test -d simulator-id`
///
/// The suite MUTATES the demo world (closes an inspection, lodges an
/// application, pays an invoice) — re-run `node scripts/seed.js` to reset.
void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  Future<void> boot(WidgetTester tester) async {
    await tester.pumpWidget(
      ChangeNotifierProvider(
        create: (_) => Session(),
        child: const MaritimeMobileApp(),
      ),
    );
    await tester.pumpAndSettle();
  }

  Future<void> signIn(WidgetTester tester,
      {required String app, required String email}) async {
    await boot(tester);
    await tester.tap(find.text(app));
    await tester.pumpAndSettle();
    final emailField = find.widgetWithText(TextField, 'Email');
    await tester.enterText(emailField, email);
    final pwField = find.widgetWithText(TextField, 'Password');
    await tester.enterText(pwField, 'Demo@2026');
    await tester.tap(find.textContaining('Enter '));
    await tester.pumpAndSettle(const Duration(seconds: 2));
    // wait for home data
    for (var i = 0; i < 20; i++) {
      await tester.pump(const Duration(milliseconds: 400));
    }
    await tester.pumpAndSettle();
  }

  Future<void> settleData(WidgetTester tester,
      [int ticks = 16]) async {
    for (var i = 0; i < ticks; i++) {
      await tester.pump(const Duration(milliseconds: 350));
    }
    await tester.pumpAndSettle();
  }

  group('role smoke — every seeded role signs in and the home renders', () {
    for (final (app, email) in const [
      ('Marine Ops', 'surveyor@maritime.example'),
      ('Marine Ops', 'harbour@maritime.example'),
      ('Marine Ops', 'nmc@maritime.example'),
      ('Marine Ops', 'admin@maritime.example'),
      ('Maritime Services', 'agent@maritime.example'),
      ('Maritime Services', 'finance@maritime.example'),
    ]) {
      testWidgets('$email in $app', (tester) async {
        await signIn(tester, app: app, email: email);
        expect(find.byType(NavigationBar), findsOneWidget,
            reason: '$email should land on the shell');
        expect(tester.takeException(), isNull);
      });
    }
  });

  testWidgets('bad password is refused with the platform message',
      (tester) async {
    await boot(tester);
    await tester.enterText(
        find.widgetWithText(TextField, 'Email'), 'surveyor@maritime.example');
    await tester.enterText(
        find.widgetWithText(TextField, 'Password'), 'WrongPass1');
    await tester.tap(find.textContaining('Enter '));
    await settleData(tester, 8);
    expect(find.textContaining('Incorrect email or password'), findsOneWidget);
  });

  testWidgets('authority: targets → dossier → checklist → finding → close',
      (tester) async {
    await signIn(tester,
        app: 'Marine Ops', email: 'surveyor@maritime.example');

    // Targets tab renders the A5 ranking.
    await tester.tap(find.text('Targets'));
    await settleData(tester);
    expect(find.text('Boarding targets'), findsOneWidget);
    expect(find.textContaining('calls ranked').hitTestable(), findsWidgets);

    // Inspect tab: open the planned worklist.
    await tester.tap(find.text('Inspect'));
    await settleData(tester);
    expect(find.text('Inspections'), findsOneWidget);
    final firstCard = find.textContaining('INS-').hitTestable().first;
    expect(firstCard, findsOneWidget, reason: 'a planned inspection exists');
    await tester.tap(firstCard);
    await settleData(tester);

    // Checklist: scroll through the whole list answering YES (list items are
    // built lazily, so re-resolve the finder every pass).
    expect(find.textContaining('answered'), findsWidgets);
    final listFinder = find.byType(ListView).hitTestable().first;
    var guard = 0;
    var complete = false;
    while (guard++ < 30 && !complete) {
      final yes = find.text('YES').hitTestable();
      final n = tester.widgetList(yes).length;
      for (var i = 0; i < n; i++) {
        await tester.tap(yes.at(i), warnIfMissed: false);
        await tester.pump(const Duration(milliseconds: 80));
      }
      complete =
          tester.any(find.textContaining(RegExp(r'(\d+) / \1 answered')));
      if (!complete) {
        await tester.drag(listFinder, const Offset(0, -420));
        await tester.pump(const Duration(milliseconds: 250));
      }
    }
    expect(complete, isTrue, reason: 'all checklist items answered');
    // Flip the first visible item to NO and record the evidence note.
    for (var i = 0; i < 10 && !tester.any(find.text('NO').hitTestable()); i++) {
      await tester.drag(listFinder, const Offset(0, 500));
      await tester.pump(const Duration(milliseconds: 200));
    }
    await tester.tap(find.text('NO').hitTestable().first, warnIfMissed: false);
    await tester.pumpAndSettle();
    final noteField =
        find.widgetWithText(TextFormField, 'Evidence note — what was observed');
    if (tester.any(noteField.hitTestable())) {
      await tester.enterText(noteField.hitTestable().first,
          'Seized in open position — observed during walk-through.');
      await tester.pump();
    }

    // Save answers (PLANNED flips to IN_PROGRESS server-side). The SnackBar is
    // transient, so wait for the durable status change in the header.
    await tester.tap(find.text('Save answers').hitTestable());
    var saved = false;
    for (var i = 0; i < 40 && !saved; i++) {
      await tester.pump(const Duration(milliseconds: 300));
      saved = tester.any(find.textContaining('IN PROGRESS')) ||
          tester.any(find.textContaining('Checklist saved'));
    }
    expect(saved, isTrue, reason: 'checklist answers persisted to the API');

    // Raise a finding from the failed item.
    for (var i = 0;
        i < 20 && !tester.any(find.text('Add finding').hitTestable());
        i++) {
      await tester.drag(listFinder, const Offset(0, -400));
      await tester.pump(const Duration(milliseconds: 250));
    }
    await tester.tap(find.text('Add finding').hitTestable().first);
    await tester.pumpAndSettle();
    await tester.enterText(
        find.widgetWithText(TextField, 'Deficiency code (e.g. 07108)'), '07108');
    await tester.enterText(find.widgetWithText(TextField, 'Description'),
        'Fire damper seized in open position; quick-closing inoperative.');
    await tester.enterText(
        find.widgetWithText(TextField, 'Action code (e.g. 17 — rectify before departure)'),
        '17');
    await tester.tap(find.text('Record finding'));
    await settleData(tester);
    expect(find.textContaining('DEFICIENCY 07108'), findsWidgets);

    // Close as DEFICIENCIES and verify the platform's close-out.
    await tester.tap(find.text('Close & sign report'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('DEFICIENCIES'));
    await tester.pump(const Duration(milliseconds: 200));
    await tester.tap(find.text('Sign & issue report'));
    await settleData(tester);
    expect(find.text('Report issued'), findsOneWidget,
        reason: 'close-out succeeded against the live API');
    await tester.tap(find.text('Done'));
    await tester.pumpAndSettle();
  });

  testWidgets('authority RBAC: NMC duty officer is gated out of targets',
      (tester) async {
    await signIn(tester, app: 'Marine Ops', email: 'nmc@maritime.example');
    await tester.tap(find.text('Targets'));
    await settleData(tester, 6);
    // The NMC role holds incidents perms; if it lacks risk.view the screen
    // must show the permission gate rather than data or an error.
    final session =
        tester.element(find.byType(NavigationBar)).read<Session>();
    if (!session.can('risk.view')) {
      expect(find.text('Not available for this role'), findsOneWidget);
    } else {
      expect(find.text('Boarding targets'), findsOneWidget);
    }
    expect(tester.takeException(), isNull);
  });

  testWidgets('customer: catalogue → apply (dynamic form) → track timeline',
      (tester) async {
    await signIn(tester,
        app: 'Maritime Services', email: 'agent@maritime.example');

    await tester.tap(find.text('Services'));
    await settleData(tester);
    expect(find.text('Service catalogue'), findsOneWidget);
    expect(find.textContaining('zero-touch'), findsOneWidget);

    // Open the first service card.
    final chevron = find.byIcon(Icons.chevron_right).hitTestable().first;
    await tester.tap(chevron);
    await settleData(tester);
    expect(find.text('Submit application'), findsOneWidget);

    // Subject picker if the definition demands one.
    final subjectPrompt = find.textContaining('Select the ');
    if (tester.any(subjectPrompt)) {
      await tester.tap(subjectPrompt);
      await tester.pumpAndSettle();
      await settleData(tester, 8);
      final firstRow = find.byType(ListTile).first;
      await tester.tap(firstRow);
      await tester.pumpAndSettle();
      expect(find.text('Pre-filled from the register'), findsOneWidget);
    }

    // Fill every required dynamic field.
    final fields = find.byType(TextFormField);
    for (var i = 0; i < tester.widgetList(fields).length; i++) {
      final f = fields.at(i);
      await tester.ensureVisible(f);
      await tester.enterText(f, '2026-09-15');
      await tester.pump(const Duration(milliseconds: 80));
    }
    // Selects: choose the first option of each dropdown.
    final dropdowns = find.byType(DropdownButtonFormField<String>);
    for (var i = 0; i < tester.widgetList(dropdowns).length; i++) {
      await tester.ensureVisible(dropdowns.at(i));
      await tester.tap(dropdowns.at(i));
      await tester.pumpAndSettle();
      await tester.tap(find.byType(DropdownMenuItem<String>).last);
      await tester.pumpAndSettle();
    }
    // Checkboxes on.
    final checks = find.byType(CheckboxListTile);
    for (var i = 0; i < tester.widgetList(checks).length; i++) {
      await tester.tap(checks.at(i));
      await tester.pump(const Duration(milliseconds: 80));
    }
    // Attach every listed document.
    final docIcons = find.byIcon(Icons.upload_file_outlined);
    while (tester.any(docIcons)) {
      await tester.ensureVisible(docIcons.first);
      await tester.tap(docIcons.first);
      await tester.pump(const Duration(milliseconds: 120));
    }

    await tester.ensureVisible(find.text('Submit application'));
    await tester.tap(find.text('Submit application'));
    await settleData(tester);

    // Landed on tracking with a real request number and timeline.
    expect(find.textContaining('Application lodged as SR-'), findsOneWidget,
        reason: 'the platform accepted the application');
    expect(find.text('TIMELINE'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('customer: pay an issued invoice end-to-end', (tester) async {
    await signIn(tester,
        app: 'Maritime Services', email: 'agent@maritime.example');
    await tester.tap(find.text('Billing'));
    await settleData(tester);
    expect(find.text('Billing'), findsWidgets);

    final invoiceRow = find.textContaining('/INV/').hitTestable().first;
    expect(invoiceRow, findsOneWidget, reason: 'an issued invoice exists');
    await tester.tap(invoiceRow);
    await settleData(tester);

    final payButton = find.textContaining('Pay ₹').hitTestable();
    expect(payButton, findsOneWidget,
        reason: 'agent holds invoices.pay via the admin-configured role');
    await tester.tap(payButton);
    await tester.pumpAndSettle();
    await tester.tap(find.textContaining('Pay ₹').hitTestable().last);
    // The POST runs over the real network — poll for the receipt.
    var paid = false;
    for (var i = 0; i < 50 && !paid; i++) {
      await tester.pump(const Duration(milliseconds: 400));
      paid = tester.any(find.text('Payment successful'));
    }
    expect(paid, isTrue,
        reason: 'payment posted through the invoice lifecycle');
    await tester.tap(find.text('Done'));
    await tester.pumpAndSettle();
    expect(find.text('PAID'), findsWidgets);
  });

  testWidgets('customer: fleet search and certificate wallet', (tester) async {
    await signIn(tester,
        app: 'Maritime Services', email: 'agent@maritime.example');
    await tester.tap(find.text('Fleet'));
    await settleData(tester);
    expect(find.text('Fleet & registry'), findsOneWidget);
    final firstVessel = find.textContaining('IMO ').hitTestable().first;
    await tester.tap(firstVessel);
    await settleData(tester);
    expect(find.text('Certificate wallet'), findsOneWidget);
    expect(find.text('SHIP CERTIFICATES'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
