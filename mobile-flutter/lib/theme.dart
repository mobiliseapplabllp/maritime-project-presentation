import 'package:flutter/material.dart';

/// Mobilise design-system tokens (from the design handoff).
class Mob {
  Mob._();

  // Brand
  static const navy900 = Color(0xFF001A44);
  static const navy800 = Color(0xFF00265D); // primary
  static const navy700 = Color(0xFF0A3A7D);
  static const navy50 = Color(0xFFEEF4FB);
  static const cyan700 = Color(0xFF007A9B);
  static const cyan600 = Color(0xFF00A0C6); // accent / AI
  static const cyan100 = Color(0xFFD3F0F8);
  static const cyan50 = Color(0xFFEAF8FC);

  // Neutrals
  static const gray900 = Color(0xFF131C2B);
  static const gray700 = Color(0xFF3B4757);
  static const gray500 = Color(0xFF647080);
  static const gray400 = Color(0xFF8B96A5);
  static const gray300 = Color(0xFFC3CBD6);
  static const gray200 = Color(0xFFDFE4EB);
  static const gray100 = Color(0xFFEEF1F5);
  static const gray50 = Color(0xFFF7F9FB);

  // Semantic
  static const green600 = Color(0xFF1E8E5A);
  static const green50 = Color(0xFFE7F6EE);
  static const amber600 = Color(0xFFB9770E);
  static const amber50 = Color(0xFFFDF3E1);
  static const red600 = Color(0xFFC43D3D);
  static const red50 = Color(0xFFFBEAEA);

  // On-navy
  static const onNavyMuted = Color(0xFF9FB4D4);
  static const cyanBright = Color(0xFF63D3EC);
  static const dotOnline = Color(0xFF4BD48B);
  static const dotOffline = Color(0xFFF5B942);
}

/// Heading / numeric type — Poppins.
TextStyle pop(double size, {FontWeight w = FontWeight.w600, Color c = Mob.navy800, double? h}) =>
    TextStyle(fontFamily: 'Poppins', fontSize: size, fontWeight: w, color: c, height: h);

/// Body type — Source Sans 3.
TextStyle ss(double size, {FontWeight w = FontWeight.w400, Color c = Mob.gray700, double? h}) =>
    TextStyle(fontFamily: 'SourceSans3', fontSize: size, fontWeight: w, color: c, height: h);

ThemeData mobTheme() {
  final base = ThemeData(
    useMaterial3: true,
    colorScheme: ColorScheme.fromSeed(
      seedColor: Mob.navy800,
      primary: Mob.navy800,
      secondary: Mob.cyan600,
      surface: Colors.white,
      error: Mob.red600,
    ),
    scaffoldBackgroundColor: Mob.gray50,
  );
  return base.copyWith(
    textTheme: base.textTheme.apply(fontFamily: 'SourceSans3'),
    dividerColor: Mob.gray200,
    splashFactory: InkSparkle.splashFactory,
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: Colors.white,
      contentPadding: const EdgeInsets.symmetric(horizontal: 13, vertical: 12),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(8),
        borderSide: const BorderSide(color: Mob.gray300),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(8),
        borderSide: const BorderSide(color: Mob.gray300),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(8),
        borderSide: const BorderSide(color: Mob.cyan600, width: 1.5),
      ),
      labelStyle: ss(13, c: Mob.gray500),
      hintStyle: ss(13, c: Mob.gray400),
    ),
    snackBarTheme: SnackBarThemeData(
      backgroundColor: Mob.navy800,
      contentTextStyle: ss(13, c: Colors.white, w: FontWeight.w600),
      behavior: SnackBarBehavior.floating,
    ),
  );
}
