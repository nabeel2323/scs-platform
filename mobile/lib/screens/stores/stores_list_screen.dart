import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/theme.dart';
import '../../providers/providers.dart';
import '../../services/api_service.dart';
import '../../widgets/common_widgets.dart';

Future<void> _refreshStores(WidgetRef ref) async {
  try {
    await ref.refresh(storesProvider.future);
  } catch (_) {
    // The provider exposes the failure in its AsyncValue; pull-to-refresh
    // should complete normally so the stale list and retry message stay usable.
  }
}

class StoresListScreen extends ConsumerWidget {
  const StoresListScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final stores = ref.watch(storesProvider);
    return Scaffold(
      appBar: AppBar(
        title: const Text('Stores'),
        actions: [
          IconButton(
            tooltip: 'Refresh stores',
            icon: const Icon(Icons.refresh),
            onPressed: () => ref.invalidate(storesProvider),
          ),
        ],
      ),
      body: stores.when(
        skipLoadingOnRefresh: true,
        skipError: true,
        data: (list) {
          final showRefreshNotice = stores.isRefreshing || stores.hasError;
          final children = <Widget>[
            if (showRefreshNotice)
              _refreshNotice(
                stores.isRefreshing
                    ? 'Refreshing stores… showing the last successfully loaded list.'
                    : 'Could not refresh stores: ${ApiService.errorMessage(stores.error!)}. Showing the last successfully loaded list.',
                () => ref.invalidate(storesProvider),
              ),
            if (list.isEmpty)
              const SizedBox(
                height: 320,
                child: EmptyState(
                  title: 'No stores',
                  description: 'No stores available yet',
                ),
              )
            else
              ...list.map((store) => Card(
                    child: ListTile(
                      leading: const CircleAvatar(
                        child: Icon(
                          Icons.storefront,
                          color: TaifTokens.brandPrimary,
                        ),
                      ),
                      title: Text(
                        store.displayName,
                        style: const TextStyle(fontWeight: FontWeight.w600),
                      ),
                      subtitle: Text(
                        '${store.verificationStatus} · ${store.currency}',
                      ),
                      trailing: StatusBadge(store.verificationStatus),
                      onTap: () => context.push('/stores/${store.id}'),
                    ),
                  )),
          ];

          return RefreshIndicator(
            onRefresh: () => _refreshStores(ref),
            child: ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.all(16),
              children: children,
            ),
          );
        },
        loading: () => const LoadingSpinner(),
        error: (e, _) => EmptyState(
          title: 'Error',
          description: ApiService.errorMessage(e),
          onAction: () => ref.invalidate(storesProvider),
        ),
      ),
    );
  }
}

Widget _refreshNotice(String message, VoidCallback onRetry) => Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: TaifTokens.err.withValues(alpha: 0.06),
        border: Border.all(color: TaifTokens.err.withValues(alpha: 0.3)),
        borderRadius: BorderRadius.circular(TaifTokens.radiusMd),
      ),
      child: Row(
        children: [
          Expanded(
            child: Text(
              message,
              style: const TextStyle(fontSize: 12, color: TaifTokens.err),
            ),
          ),
          TextButton(onPressed: onRetry, child: const Text('Retry')),
        ],
      ),
    );
