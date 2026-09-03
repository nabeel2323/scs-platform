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
