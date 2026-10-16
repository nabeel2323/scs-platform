import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'app_flavor.dart';
import 'theme.dart';
import '../router/router.dart';

class ScsApp extends ConsumerWidget {
  const ScsApp({super.key, required this.flavor});
  final AppFlavor flavor;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final router = ref.watch(routerProvider);
    return MaterialApp.router(
      title: flavor.displayName,
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light(flavor.primaryColor),
      routerConfig: router,
    );
  }
}
