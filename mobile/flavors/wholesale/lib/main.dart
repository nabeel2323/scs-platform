// Wholesale flavor entry point
//
// This file is a convenience alias. The actual entry point is lib/main.dart.
// Run with: flutter run -t flavors/wholesale/lib/main.dart --dart-define=FLAVOR=wholesale
//
// Or simply: flutter run --dart-define=FLAVOR=wholesale
//
// The --dart-define flag is read by lib/main.dart to select the AppFlavor.
// See lib/core/app_flavor.dart for flavor-specific configuration.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:scs_platform/core/app.dart';
import 'package:scs_platform/core/app_flavor.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const ProviderScope(child: ScsApp(flavor: AppFlavor.wholesale)));
}
