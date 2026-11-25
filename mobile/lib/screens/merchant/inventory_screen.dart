import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/theme.dart';
import '../../models/models.dart';
import '../../providers/providers.dart';
import '../../services/api_service.dart';
import '../../widgets/common_widgets.dart';

/// Merchant inventory management screen.
///
/// Shows all inventory items across the store's warehouses with actions for
/// stock adjustment, warehouse transfer, CSV export, and low-stock checks.
/// Mirrors the web /merchant/inventory page.
class InventoryScreen extends ConsumerStatefulWidget {
  const InventoryScreen({super.key});

  @override
  ConsumerState<InventoryScreen> createState() => _InventoryScreenState();
}

class _InventoryScreenState extends ConsumerState<InventoryScreen> {
  int _page = 0;

  Future<void> _ignoreReadFailure<T>(Future<T> read) async {
    try {
      await read;
    } catch (_) {
      // Each inventory surface reports its own read failure. A failed refresh
      // must not turn another successful surface into an error state.
    }
  }

  Future<void> _refreshInventory() async {
    Store? store;
    try {
      store = await ref.refresh(activeStoreProvider.future);
    } catch (_) {
      // The screen retains the last successful store and displays this error.
      return;
    }
    if (!mounted || store == null) return;

    await Future.wait<void>([
      _ignoreReadFailure(
        ref.refresh(storeInventoryProvider((storeId: store.id, page: _page)).future),
      ),
      _ignoreReadFailure(ref.refresh(storeWarehousesProvider(store.id).future)),
    ]);
  }

  @override
  Widget build(BuildContext context) {
    final storeAsync = ref.watch(activeStoreProvider);
    return Scaffold(
      appBar: AppBar(
        title: const Text('Inventory'),
        actions: [
          IconButton(
            tooltip: 'Refresh inventory',
            icon: const Icon(Icons.refresh),
            onPressed: _refreshInventory,
          ),
        ],
      ),
      body: storeAsync.when(
        skipLoadingOnRefresh: true,
        skipError: true,
        loading: () => const LoadingSpinner(),
        error: (e, _) => EmptyState(
          title: 'Could not load store',
          description: ApiService.errorMessage(e),
          actionLabel: 'Retry store',
          onAction: () => ref.invalidate(activeStoreProvider),
        ),
        data: (store) {
          final content = store == null
              ? const EmptyState(
                  title: 'No store',
                  description:
                      'Complete merchant registration to manage inventory.',
                  icon: Icons.inventory_2_outlined,
                )
              : _InventoryBody(
                  storeId: store.id,
                  page: _page,
                  onPageChanged: (p) => setState(() => _page = p),
                );

          if (!storeAsync.isRefreshing && !storeAsync.hasError) {
            return content;
          }

          return Column(
            children: [
              _readNotice(
                message: storeAsync.isRefreshing
                    ? 'Refreshing store… showing the last successfully loaded store.'
                    : 'Could not refresh store: ${ApiService.errorMessage(storeAsync.error!)}. Showing the last successfully loaded store.',
                retryLabel: 'Retry store',
                onRetry: _refreshInventory,
                busy: storeAsync.isRefreshing,
              ),
              Expanded(child: content),
            ],
          );
        },
      ),
    );
  }
}

Widget _readNotice({
  required String message,
  required String retryLabel,
  required VoidCallback onRetry,
  bool busy = false,
}) {
  return Padding(
    padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
    child: Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: TaifTokens.err.withValues(alpha: 0.06),
        border: Border.all(color: TaifTokens.err.withValues(alpha: 0.3)),
        borderRadius: BorderRadius.circular(TaifTokens.radiusMd),
      ),
      child: Row(
        children: [
          if (busy) ...[
            const SizedBox(
              width: 14,
              height: 14,
              child: CircularProgressIndicator(strokeWidth: 2),
            ),
            const SizedBox(width: 8),
          ],
          Expanded(
            child: Text(
              message,
              style: const TextStyle(fontSize: 12, color: TaifTokens.err),
            ),
          ),
          TextButton(onPressed: onRetry, child: Text(retryLabel)),
        ],
      ),
    ),
  );
}

class _InventoryBody extends ConsumerWidget {
  final String storeId;
  final int page;
  final ValueChanged<int> onPageChanged;
  const _InventoryBody({
    required this.storeId,
    required this.page,
    required this.onPageChanged,
  });

  Future<void> _refreshInventory(WidgetRef ref) async {
    try {
      await ref.refresh(
        storeInventoryProvider((storeId: storeId, page: page)).future,
      ).then<void>((_) {});
    } catch (_) {
      // Keep the last successful page visible; the AsyncValue below explains
      // the refresh failure and provides a retry action.
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final inventory =
        ref.watch(storeInventoryProvider((storeId: storeId, page: page)));
    final warehouses = ref.watch(storeWarehousesProvider(storeId));

    return Column(
      children: [
        _ActionBar(storeId: storeId),
        const Divider(height: 1),
        if (warehouses.isRefreshing)
          _readNotice(
            message: 'Refreshing warehouses… showing the last successful list.',
            retryLabel: 'Retry warehouses',
            onRetry: () => ref.invalidate(storeWarehousesProvider(storeId)),
            busy: true,
          )
        else if (warehouses.hasError)
          _readNotice(
            message: warehouses.hasValue
                ? 'Could not refresh warehouses: ${ApiService.errorMessage(warehouses.error!)}. Showing the last successful list.'
                : 'Could not load warehouses: ${ApiService.errorMessage(warehouses.error!)}. Stock transfers are unavailable until the warehouse list loads.',
            retryLabel: 'Retry warehouses',
            onRetry: () => ref.invalidate(storeWarehousesProvider(storeId)),
          ),
        Expanded(
          child: inventory.when(
            skipLoadingOnRefresh: true,
            skipError: true,
            loading: () => const LoadingSpinner(),
            error: (e, _) => EmptyState(
              title: 'Could not load inventory',
              description: ApiService.errorMessage(e),
              actionLabel: 'Retry inventory',
              onAction: () => ref.invalidate(
                storeInventoryProvider((storeId: storeId, page: page)),
              ),
            ),
            data: (pag) {
              final items = pag.data;
              final totalPages = (pag.total / 20).ceil();
              final inventoryList = items.isEmpty
                  ? ListView(
                      physics: const AlwaysScrollableScrollPhysics(),
                      padding: const EdgeInsets.all(12),
                      children: const [
                        SizedBox(
                          height: 260,
                          child: EmptyState(
                            title: 'No inventory',
                            description:
                                'Assign variants to warehouses to start tracking stock.',
                            icon: Icons.inventory_2_outlined,
                          ),
                        ),
                      ],
                    )
                  : ListView.separated(
                      physics: const AlwaysScrollableScrollPhysics(),
                      padding: const EdgeInsets.all(12),
                      itemCount: items.length,
                      separatorBuilder: (_, __) => const SizedBox(height: 4),
                      itemBuilder: (_, i) => _InventoryTile(
                        item: items[i],
                        storeId: storeId,
                        page: page,
                      ),
                    );

              final content = Column(
                children: [
                  Expanded(
                    child: RefreshIndicator(
                      onRefresh: () => _refreshInventory(ref),
                      child: inventoryList,
                    ),
                  ),
                  if (totalPages > 1)
                    Container(
                      padding: const EdgeInsets.symmetric(
                        vertical: 8,
                        horizontal: 12,
                      ),
                      decoration: const BoxDecoration(
                        border: Border(
                          top: BorderSide(color: Color(0xFFE2E8F0)),
                        ),
                      ),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          TextButton.icon(
                            icon: const Icon(Icons.chevron_left, size: 18),
                            label: const Text('Prev'),
                            onPressed: page > 0
                                ? () => onPageChanged(page - 1)
                                : null,
                          ),
                          Padding(
                            padding: const EdgeInsets.symmetric(horizontal: 12),
                            child: Text(
                              'Page ${page + 1} of $totalPages',
                              style: const TextStyle(
                                fontSize: 13,
                                color: Color(0xFF5B6B74),
                              ),
                            ),
                          ),
                          TextButton.icon(
                            icon: const Icon(Icons.chevron_right, size: 18),
                            label: const Text('Next'),
                            onPressed: (page + 1) < totalPages
                                ? () => onPageChanged(page + 1)
                                : null,
                          ),
                        ],
                      ),
                    ),
                ],
              );

              if (!inventory.isRefreshing && !inventory.hasError) {
                return content;
              }

              return Column(
                children: [
                  if (inventory.isRefreshing)
                    _readNotice(
                      message:
                          'Refreshing inventory… showing the last successful page.',
                      retryLabel: 'Retry inventory',
                      onRetry: () => ref.invalidate(
                        storeInventoryProvider(
                          (storeId: storeId, page: page),
                        ),
                      ),
                      busy: true,
                    ),
                  if (inventory.hasError)
                    _readNotice(
                      message:
                          'Could not refresh inventory: ${ApiService.errorMessage(inventory.error!)}. Showing the last successfully loaded page.',
                      retryLabel: 'Retry inventory',
                      onRetry: () => ref.invalidate(
                        storeInventoryProvider(
                          (storeId: storeId, page: page),
                        ),
                      ),
                    ),
                  Expanded(child: content),
                ],
              );
            },
          ),
        ),
      ],
    );
  }
}

class _ActionBar extends ConsumerWidget {
  final String storeId;
  const _ActionBar({required this.storeId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final canWrite = ref.watch(profileProvider).valueOrNull?.hasPermission('merchant:inventory:write') ?? false;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      child: Wrap(spacing: 8, children: [
        if (canWrite) OutlinedButton.icon(
          icon: const Icon(Icons.warning_amber, size: 16),
          label: const Text('Check Low Stock'),
          onPressed: () => _checkLowStock(context, ref),
        ),
        OutlinedButton.icon(
          icon: const Icon(Icons.download, size: 16),
          label: const Text('Export CSV'),
          onPressed: () => _exportCsv(context, ref),
        ),
        OutlinedButton.icon(
          icon: const Icon(Icons.move_down, size: 16),
          label: const Text('Movements'),
          onPressed: () => _exportMovements(context, ref),
        ),
      ]),
    );
  }

  Future<void> _checkLowStock(BuildContext context, WidgetRef ref) async {
    if (ref.read(profileProvider).valueOrNull?.hasPermission('merchant:inventory:write') != true) return;
    try {
      final alerted = await ref.read(apiServiceProvider).checkLowStock(storeId);
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text(alerted.isEmpty
              ? 'All stock levels are healthy'
              : '${alerted.length} item(s) below reorder point — notifications sent'),
          backgroundColor: alerted.isEmpty ? TaifTokens.ok : TaifTokens.warn,
        ));
      }
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('Failed: $e')));
      }
    }
  }

  Future<void> _exportCsv(BuildContext context, WidgetRef ref) async {
    try {
      final csv =
          await ref.read(apiServiceProvider).exportInventoryCsv(storeId);
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text('Exported ${csv.split('\n').length - 1} rows'),
          backgroundColor: TaifTokens.ok,
        ));
      }
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('Export failed: $e')));
      }
    }
  }

  Future<void> _exportMovements(BuildContext context, WidgetRef ref) async {
    try {
      final csv =
          await ref.read(apiServiceProvider).exportMovementsCsv(storeId);
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text('Exported ${csv.split('\n').length - 1} movements'),
          backgroundColor: TaifTokens.ok,
        ));
      }
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('Export failed: $e')));
      }
    }
  }
}

class _InventoryTile extends ConsumerStatefulWidget {
  final InventoryItem item;
  final String storeId;
  final int page;
  const _InventoryTile(
      {required this.item, required this.storeId, required this.page});

  @override
  ConsumerState<_InventoryTile> createState() => _InventoryTileState();
}

class _InventoryTileState extends ConsumerState<_InventoryTile> {
  InventoryItem get item => widget.item;
  String get storeId => widget.storeId;

  @override
  Widget build(BuildContext context) {
    final warehouses = ref.watch(storeWarehousesProvider(storeId));
    final canWrite = ref.watch(profileProvider).valueOrNull?.hasPermission('merchant:inventory:write') ?? false;
    final isLow = item.lowStockAlert && item.available <= item.reorderPoint;
    final whName =
        _warehouseName(item.warehouseId, warehouses.valueOrNull ?? []);

    return Card(
      color: isLow ? const Color(0xFFFEF3C7) : null,
      child: ListTile(
        leading: CircleAvatar(
          backgroundColor: isLow ? TaifTokens.warn : TaifTokens.brandPrimary,
          child: Icon(
            isLow ? Icons.warning_amber : Icons.inventory_2,
            color: Colors.white,
            size: 20,
          ),
        ),
        title: Text(
          'Variant ${_shortId(item.variantId)}',
          style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14),
        ),
        subtitle: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(whName, style: const TextStyle(fontSize: 12)),
            const SizedBox(height: 4),
            Wrap(spacing: 6, children: [
              _chip('On Hand', '${item.qtyOnHand}', TaifTokens.info),
              _chip('Reserved', '${item.qtyReserved}', TaifTokens.muted),
              _chip('Available', '${item.available}',
                  isLow ? TaifTokens.warn : TaifTokens.ok),
              if (item.reorderPoint > 0)
                _chip('Reorder', '${item.reorderPoint}', TaifTokens.muted),
            ]),
          ],
        ),
        isThreeLine: true,
        trailing: canWrite ? PopupMenuButton<String>(
          onSelected: (v) =>
              _onAction(context, v, warehouses.valueOrNull ?? []),
          itemBuilder: (_) => [
            const PopupMenuItem(value: 'adjust', child: Text('Adjust Stock')),
            if ((warehouses.valueOrNull ?? []).length > 1)
              const PopupMenuItem(value: 'transfer', child: Text('Transfer')),
          ],
        ) : null,
      ),
    );
  }

  String _shortId(String id) => id.length > 8 ? '${id.substring(0, 8)}…' : id;

  String _warehouseName(String whId, List<Map<String, dynamic>> warehouses) {
    final wh = warehouses.where((w) => w['id'] == whId).toList();
    return wh.isNotEmpty ? (wh.first['name'] ?? whId) : whId;
  }

  Widget _chip(String label, String value, Color color) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        color: color.withAlpha(20),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Text(
        '$label: $value',
        style:
            TextStyle(fontSize: 10, fontWeight: FontWeight.w600, color: color),
      ),
    );
  }

  void _onAction(BuildContext context, String action,
      List<Map<String, dynamic>> warehouses) {
    switch (action) {
      case 'adjust':
        _showAdjustDialog(context);
      case 'transfer':
        _showTransferDialog(context, warehouses);
    }
  }

  Future<void> _showAdjustDialog(BuildContext context) async {
    if (ref.read(profileProvider).valueOrNull?.hasPermission('merchant:inventory:write') != true) return;
    final qtyCtrl = TextEditingController();
    final reasonCtrl = TextEditingController();
    final result = await showDialog<Map<String, dynamic>>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Adjust Stock'),
        content: Column(mainAxisSize: MainAxisSize.min, children: [
          TextField(
            controller: qtyCtrl,
            keyboardType: TextInputType.number,
            decoration: const InputDecoration(
                labelText: 'Quantity (+/-)',
                hintText: 'Positive to add, negative to remove'),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: reasonCtrl,
            decoration: const InputDecoration(labelText: 'Reason (optional)'),
          ),
        ]),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
          ElevatedButton(
            onPressed: () {
              final qty = int.tryParse(qtyCtrl.text);
              if (qty == null) return;
              Navigator.pop(ctx, {
                'quantity': qty,
                'reason': reasonCtrl.text.isEmpty ? null : reasonCtrl.text,
              });
            },
            child: const Text('Adjust'),
          ),
        ],
      ),
    );
    if (result == null || !context.mounted) return;

    try {
      await ref.read(apiServiceProvider).adjustStock(
            inventoryItemId: item.id,
            quantity: result['quantity'] as int,
            reason: result['reason'] as String?,
          );
      ref.invalidate(
          storeInventoryProvider((storeId: storeId, page: widget.page)));
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
            content: Text('Stock adjusted'), backgroundColor: TaifTokens.ok));
      }
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('Failed: $e')));
      }
    }
  }

  Future<void> _showTransferDialog(
      BuildContext context, List<Map<String, dynamic>> warehouses) async {
    if (ref.read(profileProvider).valueOrNull?.hasPermission('merchant:inventory:write') != true) return;
    final otherWarehouses =
        warehouses.where((w) => w['id'] != item.warehouseId).toList();
    if (otherWarehouses.isEmpty) return;

    String? destWhId = otherWarehouses.first['id'] as String?;
    final qtyCtrl = TextEditingController();
    final reasonCtrl = TextEditingController();

    final result = await showDialog<Map<String, dynamic>>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setState) => AlertDialog(
          title: const Text('Transfer Stock'),
          content: Column(mainAxisSize: MainAxisSize.min, children: [
            DropdownButtonFormField<String>(
              initialValue: destWhId,
              decoration: const InputDecoration(labelText: 'Destination'),
              items: otherWarehouses.map((w) {
                return DropdownMenuItem(
                  value: w['id'] as String,
                  child: Text(w['name'] as String? ?? w['id'] as String),
                );
              }).toList(),
              onChanged: (v) => setState(() => destWhId = v),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: qtyCtrl,
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(labelText: 'Quantity'),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: reasonCtrl,
              decoration: const InputDecoration(labelText: 'Reason (optional)'),
            ),
          ]),
          actions: [
            TextButton(
                onPressed: () => Navigator.pop(ctx),
                child: const Text('Cancel')),
            ElevatedButton(
              onPressed: () {
                final qty = int.tryParse(qtyCtrl.text);
                if (qty == null || destWhId == null) return;
                Navigator.pop(ctx, {
                  'destWhId': destWhId,
                  'quantity': qty,
                  'reason': reasonCtrl.text.isEmpty ? null : reasonCtrl.text,
                });
              },
              child: const Text('Transfer'),
            ),
          ],
        ),
      ),
    );
    if (result == null || !context.mounted) return;

    try {
      await ref.read(apiServiceProvider).transferStock(
            inventoryItemId: item.id,
            fromWarehouseId: item.warehouseId,
            toWarehouseId: result['destWhId'] as String,
            quantity: result['quantity'] as int,
            reason: result['reason'] as String?,
          );
      ref.invalidate(
          storeInventoryProvider((storeId: storeId, page: widget.page)));
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
            content: Text('Stock transferred'),
            backgroundColor: TaifTokens.ok));
      }
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('Failed: $e')));
      }
    }
  }
}
