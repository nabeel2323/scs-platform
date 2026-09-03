import 'package:flutter/material.dart';

/// Application flavor - controls branding, feature flags, and default routes.
enum AppFlavor {
  retail,
  wholesale;

  String get displayName => switch (this) {
    AppFlavor.retail => 'Smart Commerce',
    AppFlavor.wholesale => 'SCS Wholesale',
  };

  Color get primaryColor => switch (this) {
    AppFlavor.retail => const Color(0xFF174A5B),
    AppFlavor.wholesale => const Color(0xFF0F3340),
  };

  bool get supportsB2C => this == AppFlavor.retail;
  bool get supportsAds => this == AppFlavor.retail;
}
