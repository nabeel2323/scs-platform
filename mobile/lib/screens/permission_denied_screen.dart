import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../core/theme.dart';

class PermissionDeniedScreen extends StatelessWidget {
  const PermissionDeniedScreen({super.key, required this.requiredPermissions});
  final String requiredPermissions;

  @override
  Widget build(BuildContext context) {
    final requirements = requiredPermissions.split(';').map((value) => value.trim()).where((value) => value.isNotEmpty).toList();
    return Scaffold(
      appBar: AppBar(title: const Text('Access restricted')),
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.lock_outline, size: 48, color: TaifTokens.muted),
              const SizedBox(height: 16),
              Text(
                'Your active organization does not grant access to this screen.',
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.titleMedium,
              ),
              if (requirements.isNotEmpty) ...[
                const SizedBox(height: 12),
                const Text('Required permission:'),
                const SizedBox(height: 6),
                ...requirements.map((value) => Text(
                      value,
                      textAlign: TextAlign.center,
                      style: const TextStyle(color: TaifTokens.muted, fontFamily: 'monospace'),
                    )),
              ],
              const SizedBox(height: 24),
              FilledButton(onPressed: () => context.go('/home'), child: const Text('Return home')),
            ],
          ),
        ),
      ),
    );
  }
}
