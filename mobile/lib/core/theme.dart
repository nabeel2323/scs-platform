import 'package:flutter/material.dart';

/// TAIF Design Tokens
///
/// Centralized design constants for the Smart Commerce Platform.
/// Mirrors packages/ui-kit/src/tokens.ts for web consistency.
abstract final class TaifTokens {
  // -- Brand --
  static const Color brandPrimary = Color(0xFF174A5B);
  static const Color brandSecondary = Color(0xFF0F3340);
  static const Color brandAccent = Color(0xFFC98A2D);

  // -- Semantic --
  static const Color ok = Color(0xFF1B7A4B);
  static const Color warn = Color(0xFFB45309);
  static const Color err = Color(0xFFB3372F);
  static const Color info = Color(0xFF1D5FA8);

  // -- Surface --
  static const Color ink = Color(0xFF16232B);
  static const Color muted = Color(0xFF5B6B74);
  static const Color surface = Color(0xFFFFFFFF);
  static const Color bg = Color(0xFFF2F5F6);
  static const Color line = Color(0xFFD9E2E6);

  // -- Typography --
  static const String fontFamilyLatin = 'Inter';
  static const String fontFamilyArabic = 'IBMPlexSansArabic';

  // -- Spacing --
  static const double sp4 = 4;
  static const double sp8 = 8;
  static const double sp12 = 12;
  static const double sp16 = 16;
  static const double sp20 = 20;
  static const double sp24 = 24;
  static const double sp32 = 32;

  // -- Radii --
  static const double radiusSm = 6;
  static const double radiusMd = 10;
  static const double radiusLg = 14;

  // -- Shadows --
  static const List<BoxShadow> shadowSm = [
    BoxShadow(color: Color(0x0F16232B), offset: Offset(0, 1), blurRadius: 2),
  ];
  static const List<BoxShadow> shadowMd = [
    BoxShadow(color: Color(0x0F16232B), offset: Offset(0, 1), blurRadius: 2),
    BoxShadow(color: Color(0x0D16232B), offset: Offset(0, 4), blurRadius: 14),
  ];
  static const List<BoxShadow> shadowLg = [
    BoxShadow(color: Color(0x1A16232B), offset: Offset(0, 4), blurRadius: 24),
  ];
}

/// Formalized type scale (spec §Phase 1 `AppTypography`), built on the brand
/// fonts so every screen shares one rhythm instead of ad-hoc `TextStyle`s.
/// Colors are light-theme only — §46 forbids shipping a half-done dark mode.
abstract final class AppTypography {
  static const String _latin = TaifTokens.fontFamilyLatin;

  static const TextTheme textTheme = TextTheme(
    displayLarge: TextStyle(
        fontSize: 40, fontWeight: FontWeight.w700, letterSpacing: -0.5,
        color: TaifTokens.ink, fontFamily: _latin),
    displayMedium: TextStyle(
        fontSize: 34, fontWeight: FontWeight.w700, letterSpacing: -0.25,
        color: TaifTokens.ink, fontFamily: _latin),
    displaySmall: TextStyle(
        fontSize: 28, fontWeight: FontWeight.w700,
        color: TaifTokens.ink, fontFamily: _latin),
    headlineMedium: TextStyle(
        fontSize: 24, fontWeight: FontWeight.w700,
        color: TaifTokens.ink, fontFamily: _latin),
    headlineSmall: TextStyle(
        fontSize: 20, fontWeight: FontWeight.w700,
        color: TaifTokens.ink, fontFamily: _latin),
    titleLarge: TextStyle(
        fontSize: 18, fontWeight: FontWeight.w600,
        color: TaifTokens.ink, fontFamily: _latin),
    titleMedium: TextStyle(
        fontSize: 16, fontWeight: FontWeight.w600,
        color: TaifTokens.ink, fontFamily: _latin),
    titleSmall: TextStyle(
        fontSize: 14, fontWeight: FontWeight.w600,
        color: TaifTokens.ink, fontFamily: _latin),
    bodyLarge: TextStyle(
        fontSize: 16, fontWeight: FontWeight.w400, height: 1.4,
        color: TaifTokens.ink, fontFamily: _latin),
    bodyMedium: TextStyle(
        fontSize: 14, fontWeight: FontWeight.w400, height: 1.4,
        color: TaifTokens.ink, fontFamily: _latin),
    bodySmall: TextStyle(
        fontSize: 12, fontWeight: FontWeight.w400,
        color: TaifTokens.muted, fontFamily: _latin),
    labelLarge: TextStyle(
        fontSize: 14, fontWeight: FontWeight.w600,
        color: TaifTokens.ink, fontFamily: _latin),
    labelMedium: TextStyle(
        fontSize: 12, fontWeight: FontWeight.w500,
        color: TaifTokens.muted, fontFamily: _latin),
    labelSmall: TextStyle(
        fontSize: 11, fontWeight: FontWeight.w500, letterSpacing: 0.3,
        color: TaifTokens.muted, fontFamily: _latin),
  );
}

/// Centralized `ThemeData` factory (spec §Phase 1 `AppTheme`). Wraps
/// [TaifTokens] + [AppTypography] and adds component themes so screens stop
/// hand-styling buttons/inputs/chips. `seed` is the flavor's primary color, so
/// retail/wholesale keep distinct M3 tonal palettes.
///
/// Deliberately does NOT hardcode a primary button color — M3 derives it from
/// the seed. Only neutral surfaces, borders, radii and touch-target sizes are
/// tokenized here.
abstract final class AppTheme {
  /// 48dp minimum touch target (spec §42 accessibility).
  static const Size _minTapTarget = Size(0, 48);

  static ThemeData light(Color seed) => ThemeData(
        useMaterial3: true,
        colorSchemeSeed: seed,
        fontFamily: TaifTokens.fontFamilyLatin,
        textTheme: AppTypography.textTheme,
        scaffoldBackgroundColor: TaifTokens.bg,
        appBarTheme: const AppBarTheme(
          centerTitle: false,
          elevation: 0,
          backgroundColor: TaifTokens.surface,
          foregroundColor: TaifTokens.ink,
          surfaceTintColor: Colors.transparent,
        ),
        cardTheme: CardThemeData(
          elevation: 0,
          color: TaifTokens.surface,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(TaifTokens.radiusMd),
            side: const BorderSide(color: TaifTokens.line),
          ),
        ),
        inputDecorationTheme: InputDecorationTheme(
          filled: true,
          fillColor: TaifTokens.surface,
          contentPadding:
              const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
          border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(TaifTokens.radiusSm),
              borderSide: const BorderSide(color: TaifTokens.line)),
          enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(TaifTokens.radiusSm),
              borderSide: const BorderSide(color: TaifTokens.line)),
          focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(TaifTokens.radiusSm),
              borderSide:
                  const BorderSide(color: TaifTokens.brandPrimary, width: 1.5)),
          errorBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(TaifTokens.radiusSm),
              borderSide: const BorderSide(color: TaifTokens.err)),
          focusedErrorBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(TaifTokens.radiusSm),
              borderSide: const BorderSide(color: TaifTokens.err, width: 1.5)),
          labelStyle: const TextStyle(color: TaifTokens.muted),
        ),
        elevatedButtonTheme: ElevatedButtonThemeData(
          style: ElevatedButton.styleFrom(
            elevation: 0,
            minimumSize: _minTapTarget,
            shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(TaifTokens.radiusSm)),
            textStyle: const TextStyle(
                fontSize: 15,
                fontWeight: FontWeight.w600,
                fontFamily: TaifTokens.fontFamilyLatin),
          ),
        ),
        outlinedButtonTheme: OutlinedButtonThemeData(
          style: OutlinedButton.styleFrom(
            minimumSize: _minTapTarget,
            side: const BorderSide(color: TaifTokens.line),
            shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(TaifTokens.radiusSm)),
            textStyle: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
          ),
        ),
        textButtonTheme: TextButtonThemeData(
          style: TextButton.styleFrom(
            shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(TaifTokens.radiusSm)),
            textStyle: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
          ),
        ),
        chipTheme: ChipThemeData(
          side: const BorderSide(color: TaifTokens.line),
          backgroundColor: TaifTokens.surface,
          shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(TaifTokens.radiusSm)),
          labelStyle: const TextStyle(fontSize: 12, color: TaifTokens.ink),
        ),
        dividerTheme: const DividerThemeData(
            color: TaifTokens.line, thickness: 1, space: 1),
        snackBarTheme: SnackBarThemeData(
          behavior: SnackBarBehavior.floating,
          shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(TaifTokens.radiusSm)),
        ),
        progressIndicatorTheme:
            const ProgressIndicatorThemeData(color: TaifTokens.brandPrimary),
      );
}
