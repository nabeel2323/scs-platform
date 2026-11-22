import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/theme.dart';
import '../../models/models.dart';
import '../../providers/providers.dart';
import '../../services/api_service.dart';
import '../../widgets/common_widgets.dart';

class MerchantPricingScreen extends ConsumerWidget {
  const MerchantPricingScreen({super.key});

  Future<void> _refresh(WidgetRef ref) async {
    Store? store;
    try {
      store = await ref.refresh(activeStoreProvider.future);
    } catch (_) {
      // Keep the last successful store and let the store AsyncValue show retry.
      return;
    }
    if (store == null) return;
    try {
      // Refreshing activeStoreProvider invalidates its dependent price-list
      // provider; read its resulting Future instead of issuing a second fetch.
      await ref.read(merchantPriceListsProvider.future);
    } catch (_) {
      // The price-list AsyncValue owns its independent error/stale state.
    }
  }

  Future<void> _refreshLists(WidgetRef ref) async {
    try {
      await ref.refresh(merchantPriceListsProvider.future);
    } catch (_) {
      // Preserve the last successful list and show the refresh error below.
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final storeAsync = ref.watch(activeStoreProvider);
    final listsAsync = ref.watch(merchantPriceListsProvider);
    final canWrite = ref.watch(profileProvider).valueOrNull
            ?.hasPermission('merchant:pricing:write') ??
        false;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Pricing'),
        actions: [
          IconButton(
            tooltip: 'Refresh price lists',
            icon: const Icon(Icons.refresh),
            onPressed: () => _refresh(ref),
          ),
        ],
      ),
      floatingActionButton: storeAsync.valueOrNull != null && canWrite
          ? FloatingActionButton.extended(
              onPressed: () => _createList(context, ref, storeAsync.valueOrNull!),
              icon: const Icon(Icons.add),
              label: const Text('New price list'),
            )
          : null,
      body: storeAsync.when(
        skipLoadingOnRefresh: true,

        skipLoadingOnReload: true,
        skipError: true,
        loading: () => const LoadingSpinner(),
        error: (e, _) => EmptyState(
          title: 'Could not load store',
          description: ApiService.errorMessage(e),
          actionLabel: 'Retry store',
          onAction: () => ref.invalidate(activeStoreProvider),
        ),
        data: (store) {
          if (store == null) {
            return const EmptyState(
              title: 'No active store',
              description: 'Join or register a store before managing pricing.',
              icon: Icons.store_outlined,
            );
          }

          final listContent = listsAsync.when(
            skipLoadingOnRefresh: true,

            skipLoadingOnReload: true,
            skipError: true,
            loading: () => const LoadingSpinner(),
            error: (e, _) => EmptyState(
              title: 'Could not load price lists',
              description: ApiService.errorMessage(e),
              actionLabel: 'Retry price lists',
              onAction: () => ref.invalidate(merchantPriceListsProvider),
            ),
            data: (lists) {
              final listView = lists.isEmpty
                  ? ListView(
                      physics: const AlwaysScrollableScrollPhysics(),
                      padding: const EdgeInsets.fromLTRB(16, 16, 16, 96),
                      children: [
                        SizedBox(
                          height: 280,
                          child: EmptyState(
                            title: 'No price lists yet',
                            description: canWrite
                                ? 'Create a price list, then add quantity tiers for product variants.'
                                : 'Your store has no configured price lists.',
                            icon: Icons.price_change_outlined,
                            actionLabel: canWrite ? 'Create price list' : null,
                            onAction: canWrite
                                ? () => _createList(context, ref, store)
                                : null,
                          ),
                        ),
                      ],
                    )
                  : ListView.separated(
                      physics: const AlwaysScrollableScrollPhysics(),
                      padding: const EdgeInsets.fromLTRB(16, 16, 16, 96),
                      itemCount: lists.length,
                      separatorBuilder: (_, __) => const SizedBox(height: 8),
                      itemBuilder: (context, index) {
                        final list = lists[index];
                        return Card(
                          child: ListTile(
                            leading: const Icon(
                              Icons.price_change,
                              color: TaifTokens.info,
                            ),
                            title: Text(
                              list.name,
                              style: const TextStyle(fontWeight: FontWeight.w600),
                            ),
                            subtitle: Text(
                              '${list.currency} · ${list.channel} · ${list.audience} · Priority ${list.priority}',
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                            ),
                            trailing: Chip(
                              label: Text(list.isActive ? 'Active' : 'Inactive'),
                              visualDensity: VisualDensity.compact,
                            ),
                            onTap: () =>
                                context.push('/merchant/pricing/${list.id}'),
                          ),
                        );
                      },
                    );

              final content = RefreshIndicator(
                onRefresh: () => _refreshLists(ref),
                child: listView,
              );

              if (!listsAsync.isRefreshing && !listsAsync.hasError) {
                return content;
              }

              return Column(
                children: [
                  if (listsAsync.isRefreshing)
                    const Padding(
                      padding: EdgeInsets.all(8),
                      child: Text(
                        'Refreshing price lists… showing the last successful results.',
                        style: TextStyle(fontSize: 12, color: TaifTokens.muted),
                      ),
                    ),
                  if (listsAsync.hasError)
                    ErrorBanner(
                      message:
                          'Could not refresh price lists: ${ApiService.errorMessage(listsAsync.error!)}. Showing the last successful results.',
                      onRetry: () => ref.invalidate(merchantPriceListsProvider),
                    ),
                  Expanded(child: content),
                ],
              );
            },
          );

          if (!storeAsync.isRefreshing && !storeAsync.hasError) {
            return listContent;
          }

          return Column(
            children: [
              if (storeAsync.isRefreshing)
                const Padding(
                  padding: EdgeInsets.all(8),
                  child: Text(
                    'Refreshing store… showing the last successfully loaded store.',
                    style: TextStyle(fontSize: 12, color: TaifTokens.muted),
                  ),
                ),
              if (storeAsync.hasError)
                ErrorBanner(
                  message:
                      'Could not refresh store: ${ApiService.errorMessage(storeAsync.error!)}. Showing the last successfully loaded store.',
                  onRetry: () => _refresh(ref),
                ),
              Expanded(child: listContent),
            ],
          );
        },
      ),
    );
  }

  Future<void> _createList(
      BuildContext context, WidgetRef ref, Store store) async {
    final draft = await showDialog<Map<String, dynamic>>(
      context: context,
      builder: (_) => _PriceListCreateDialog(defaultCurrency: store.currency),
    );
    if (draft == null || !context.mounted) return;
    try {
      await ref.read(apiServiceProvider).createPriceList(
            storeId: store.id,
            name: draft['name'] as String,
            currency: draft['currency'] as String,
            channel: draft['channel'] as String,
            audience: draft['audience'] as String,
            priority: draft['priority'] as int,
          );
      ref.invalidate(merchantPriceListsProvider);
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Price list created')),
        );
      }
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(ApiService.errorMessage(e)),
            backgroundColor: TaifTokens.err,
          ),
        );
      }
    }
  }
}

class _PriceListCreateDialog extends StatefulWidget {
  const _PriceListCreateDialog({required this.defaultCurrency});
  final String defaultCurrency;
  @override
  State<_PriceListCreateDialog> createState() => _PriceListCreateDialogState();
}

class _PriceListCreateDialogState extends State<_PriceListCreateDialog> {
  final _name = TextEditingController();
  final _priority = TextEditingController(text: '0');
  late String _currency;
  String _channel = 'B2B';
  String _audience = 'PUBLIC';

  @override
  void initState() {
    super.initState();
    _currency = widget.defaultCurrency.isEmpty ? 'SAR' : widget.defaultCurrency;
  }

  @override
  void dispose() {
    _name.dispose();
    _priority.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
        title: const Text('Create price list'),
        content: SingleChildScrollView(
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            TextField(controller: _name, autofocus: true,
                decoration: const InputDecoration(labelText: 'Name')),
            const SizedBox(height: 12),
            DropdownButtonFormField<String>(
              value: _currency,
              decoration: const InputDecoration(labelText: 'Currency'),
              items: [
                DropdownMenuItem(value: _currency, child: Text(_currency)),
                ...['SAR', 'AED', 'USD', 'EUR'].where((code) => code != _currency)
                    .map((code) => DropdownMenuItem(value: code, child: Text(code))),
              ],
              onChanged: (value) { if (value != null) setState(() => _currency = value); },
            ),
            const SizedBox(height: 12),
            DropdownButtonFormField<String>(
              value: _channel,
              decoration: const InputDecoration(labelText: 'Channel'),
              items: const [
                DropdownMenuItem(value: 'B2B', child: Text('B2B')),
                DropdownMenuItem(value: 'B2C', child: Text('B2C')),
              ],
              onChanged: (value) { if (value != null) setState(() => _channel = value); },
            ),
            const SizedBox(height: 12),
            const ListTile(
              contentPadding: EdgeInsets.zero,
              title: Text('Audience'),
              subtitle: Text('Public'),
            ),
            const SizedBox(height: 12),
            TextField(controller: _priority, keyboardType: TextInputType.number,
                decoration: const InputDecoration(labelText: 'Priority')),
          ]),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
          FilledButton(
            onPressed: () {
              final name = _name.text.trim();
              if (name.isEmpty) return;
              Navigator.pop(context, {
                'name': name,
                'currency': _currency,
                'channel': _channel,
                'audience': _audience,
                'priority': int.tryParse(_priority.text.trim()) ?? 0,
              });
            },
            child: const Text('Create'),
          ),
        ],
      );
}
