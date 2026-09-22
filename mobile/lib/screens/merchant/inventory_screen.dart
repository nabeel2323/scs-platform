import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/theme.dart';
import '../../models/models.dart';
import '../../providers/providers.dart';
import '../../widgets/common_widgets.dart';

/// Merchant inventory management screen.
///
/// Shows all inventory items across the store's warehouses with actions for
/// stock adjustment, warehouse transfer, CSV export, and low-stock checks.
/// Mirrors the web /merchant/inventory page.
class InventoryScreen extends ConsumerWidget {
  const InventoryScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final storeAsync = ref.watch(activeStoreProvider);
    return Scaffold(
      appBar: AppBar(
        title: const Text('Inventory'),
        actions: [
          IconButton(
              icon: const Icon(Icons.refresh),
              onPressed: () {
                storeAsync.maybeWhen(
                  data: (s) {
                    if (s != null) {
                      ref.invalidate(storeInventoryProvider(s.id));
                      ref.invalidate(storeWarehousesProvider(s.id));
                    }
                  },
                  orElse: () {},
                );
              }),
        ],
      ),
      body: storeAsync.when(
        loading: () => const LoadingSpinner(),
        error: (e, _) => EmptyState(
            title: 'Error',
            description: '$e',
            onAction: () => ref.invalidate(activeStoreProvider)),
        data: (store) {
          if (store == null) {
            return const EmptyState(
                title: 'No store',
                description:
                    'Complete merchant registration to manage inventory.',
                icon: Icons.inventory_2_outlined);
          }
          return _InventoryBody(storeId: store.id);
        },
      ),
    );
  }
}

class _InventoryBody extends ConsumerWidget {
  final String storeId;
  const _InventoryBody({required this.storeId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final inventory = ref.watch(storeInventoryProvider(storeId));

    return Column(children: [
      _ActionBar(storeId: storeId),
      const Divider(height: 1),
      Expanded(
        child: inventory.when(
          loading: () => const LoadingSpinner(),
          error: (e, _) => EmptyState(
              title: 'Error',
              description: '$e',
              onAction: () => ref.invalidate(storeInventoryProvider(storeId))),
          data: (items) => items.isEmpty
              ? const EmptyState(
                  title: 'No inventory',
                  description:
                      'Assign variants to warehouses to start tracking stock.',
                  icon: Icons.inventory_2_outlined)
              : RefreshIndicator(
                  onRefresh: () async =>
                      ref.invalidate(storeInventoryProvider(storeId)),
                  child: ListView.separated(
                    padding: const EdgeInsets.all(12),
                    itemCount: items.length,
                    separatorBuilder: (_, __) => const SizedBox(height: 4),
                    itemBuilder: (_, i) => _InventoryTile(
                      item: items[i],
                      storeId: storeId,
                    ),
                  ),
                ),
        ),
      ),
    ]);
  }
}

class _ActionBar extends ConsumerWidget {
  final String storeId;
  const _ActionBar({required this.storeId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      child: Wrap(spacing: 8, children: [
        OutlinedButton.icon(
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
  const _InventoryTile({required this.item, required this.storeId});

  @override
  ConsumerState<_InventoryTile> createState() => _InventoryTileState();
}

class _InventoryTileState extends ConsumerState<_InventoryTile> {
  InventoryItem get item => widget.item;
  String get storeId => widget.storeId;

  @override
  Widget build(BuildContext context) {
    final warehouses = ref.watch(storeWarehousesProvider(storeId));
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
        trailing: PopupMenuButton<String>(
          onSelected: (v) =>
              _onAction(context, v, warehouses.valueOrNull ?? []),
          itemBuilder: (_) => [
            const PopupMenuItem(value: 'adjust', child: Text('Adjust Stock')),
            if ((warehouses.valueOrNull ?? []).length > 1)
              const PopupMenuItem(value: 'transfer', child: Text('Transfer')),
          ],
        ),
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
      ref.invalidate(storeInventoryProvider(storeId));
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
      ref.invalidate(storeInventoryProvider(storeId));
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
