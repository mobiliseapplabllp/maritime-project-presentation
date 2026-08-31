import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'screens/launcher.dart';
import 'session.dart';
import 'theme.dart';

void main() {
  runApp(
    ChangeNotifierProvider(
      create: (_) => Session(),
      child: const MaritimeMobileApp(),
    ),
  );
}

class MaritimeMobileApp extends StatelessWidget {
  const MaritimeMobileApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Maritime Mobile',
      debugShowCheckedModeBanner: false,
      theme: mobTheme(),
      home: const LauncherScreen(),
      builder: (context, child) => MediaQuery.withClampedTextScaling(
        maxScaleFactor: 1.3,
        child: child ?? const SizedBox.shrink(),
      ),
    );
  }
}
