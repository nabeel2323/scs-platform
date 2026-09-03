import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'core/app.dart';
import 'core/app_flavor.dart';

/// Entry point — flavor is selected via --dart-define=FLAVOR=retail|wholesale
///
/// Run retail:   flutter run --dart-define=FLAVOR=retail
/// Run wholesale: flutter run --dart-define=FLAVOR=wholesale
void main() {
  WidgetsFlutterBinding.ensureInitialized();

  const flavorStr = String.fromEnvironment('FLAVOR', defaultValue: 'retail');
  final flavor = AppFlavor.values.firstWhere(
    (f) => f.name == flavorStr,
    orElse: () => AppFlavor.retail,
  );

  runApp(ProviderScope(child: ScsApp(flavor: flavor)));
}
