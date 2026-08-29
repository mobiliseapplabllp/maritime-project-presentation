import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';

import 'package:marine_mobile/screens/launcher.dart';
import 'package:marine_mobile/session.dart';
import 'package:marine_mobile/theme.dart';

void main() {
  testWidgets('launcher renders both app choices and the sign-in form',
      (tester) async {
    await tester.pumpWidget(
      ChangeNotifierProvider(
        create: (_) => Session(),
        child: MaterialApp(theme: mobTheme(), home: const LauncherScreen()),
      ),
    );
    expect(find.text('Marine Ops'), findsOneWidget);
    expect(find.text('Maritime Services'), findsOneWidget);
    expect(find.text('Sign in'), findsOneWidget);
    // Switching persona swaps the prefilled identity.
    await tester.tap(find.text('Maritime Services'));
    await tester.pump();
    expect(find.text('Shipping Agent'), findsOneWidget);
  });
}
