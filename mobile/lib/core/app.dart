import 'package:flutter/material.dart';
import 'app_flavor.dart';

class ScsApp extends StatelessWidget {
  const ScsApp({super.key, required this.flavor});
  final AppFlavor flavor;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: flavor.displayName,
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        useMaterial3: true,
        colorSchemeSeed: flavor.primaryColor,
        fontFamily: 'Inter',
        scaffoldBackgroundColor: const Color(0xFFF2F5F6),
        appBarTheme: const AppBarTheme(centerTitle: false, elevation: 0),
        cardTheme: CardThemeData(
          elevation: 0,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(10),
            side: const BorderSide(color: Color(0xFFD9E2E6)),
          ),
        ),
      ),
      home: const _PlaceholderHome(),
    );
  }
}

class _PlaceholderHome extends StatelessWidget {
  const _PlaceholderHome();
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.storefront, size: 64, color: Theme.of(context).colorScheme.primary),
            const SizedBox(height: 16),
            Text('Smart Commerce Platform', style: Theme.of(context).textTheme.headlineSmall),
            const SizedBox(height: 8),
            Text('Flutter scaffold ready', style: Theme.of(context).textTheme.bodyMedium),
          ],
        ),
      ),
    );
  }
}
