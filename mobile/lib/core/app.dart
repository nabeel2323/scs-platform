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
      theme: ThemeData(
        useMaterial3: true,
        colorSchemeSeed: flavor.primaryColor,
        fontFamily: TaifTokens.fontFamilyLatin,
        scaffoldBackgroundColor: TaifTokens.bg,
        appBarTheme: const AppBarTheme(centerTitle: false, elevation: 0),
        cardTheme: CardThemeData(
          elevation: 0,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(TaifTokens.radiusMd),
            side: const BorderSide(color: TaifTokens.line),
          ),
        ),
        inputDecorationTheme: InputDecorationTheme(
          border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(TaifTokens.radiusSm)),
          contentPadding:
              const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        ),
        elevatedButtonTheme: ElevatedButtonThemeData(
          style: ElevatedButton.styleFrom(
            shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(TaifTokens.radiusSm)),
          ),
        ),
      ),
      routerConfig: router,
    );
  }
}
