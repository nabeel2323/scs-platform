import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/theme.dart';
import '../../providers/providers.dart';
import '../../widgets/common_widgets.dart';

class StoresListScreen extends ConsumerWidget {
  const StoresListScreen({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final stores = ref.watch(storesProvider);
    return Scaffold(
        appBar: AppBar(title: const Text('Stores')),
        body: stores.when(
          data: (list) => list.isEmpty
              ? const EmptyState(
                  title: 'No stores', description: 'No stores available yet')
              : ListView.builder(
                  padding: const EdgeInsets.all(16),
                  itemCount: list.length,
                  itemBuilder: (_, i) {
                    final s = list[i];
                    return Card(
                        child: ListTile(
                            leading: CircleAvatar(
                                child: Icon(Icons.storefront,
                                    color: TaifTokens.brandPrimary)),
                            title: Text(s.displayName,
                                style: const TextStyle(
                                    fontWeight: FontWeight.w600)),
                            subtitle:
                                Text('${s.verificationStatus} · ${s.currency}'),
                            trailing: StatusBadge(s.verificationStatus),
                            onTap: () => context.push('/stores/${s.id}')));
                  }),
          loading: () => const LoadingSpinner(),
          error: (e, _) => EmptyState(
              title: 'Error',
              description: '$e',
              onAction: () => ref.invalidate(storesProvider)),
        ));
  }
}
