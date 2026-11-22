import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/theme.dart';
import '../../models/models.dart';
import '../../providers/providers.dart';
import '../../services/api_service.dart';
import '../../widgets/common_widgets.dart';

class PriceListDetailScreen extends ConsumerWidget {
  const PriceListDetailScreen({super.key, required this.priceListId});
  final String priceListId;

  Future<void> _ignoreReadFailure<T>(Future<T> read) async {
    try {
      await read;
    } catch (_) {
      // The detail and tier providers surface their own independent failures.
    }
  }

  Future<void> _refresh(WidgetRef ref) async {
    await Future.wait<void>([
      _ignoreReadFailure(
        ref.refresh(priceListDetailProvider(priceListId).future),
      ),
      _ignoreReadFailure(
        ref.refresh(priceListTiersProvider(priceListId).future),
      ),
    ]);
  }

  Future<void> _refreshTiers(WidgetRef ref) async {
    try {
      await ref.refresh(priceListTiersProvider(priceListId).future);
    } catch (_) {
      // Preserve the last successful tiers; the provider state shows the error.
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final listAsync = ref.watch(priceListDetailProvider(priceListId));
    final tiersAsync = ref.watch(priceListTiersProvider(priceListId));
    final canWrite = ref.watch(profileProvider).valueOrNull
            ?.hasPermission('merchant:pricing:write') ??
        false;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Price list'),
        actions: [
          if (canWrite && listAsync.valueOrNull != null)
            IconButton(
              tooltip: 'Edit price list',
              icon: const Icon(Icons.edit_outlined),
              onPressed: () =>
                  _editList(context, ref, listAsync.valueOrNull!),
            ),
          IconButton(
            tooltip: 'Refresh price list',
            icon: const Icon(Icons.refresh),
            onPressed: () => _refresh(ref),
          ),
        ],
      ),
      floatingActionButton: canWrite && listAsync.valueOrNull != null
          ? FloatingActionButton.extended(
              onPressed: () => _addTier(context, ref, listAsync.valueOrNull!),
              icon: const Icon(Icons.add),
              label: const Text('Add tier'),
            )
          : null,
      body: listAsync.when(
        skipLoadingOnRefresh: true,

        skipLoadingOnReload: true,
        skipError: true,
        loading: () => const LoadingSpinner(),
        error: (e, _) => AppErrorState(
          title: 'Could not load price list',
          message: ApiService.errorMessage(e),
          onRetry: () => ref.invalidate(priceListDetailProvider(priceListId)),
        ),
        data: (list) {
          final tierCount = tiersAsync.valueOrNull?.length.toString() ?? '—';
          final header = Card(
            margin: const EdgeInsets.fromLTRB(16, 12, 16, 8),
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          list.name,
                          style: const TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ),
                      Chip(label: Text(list.isActive ? 'Active' : 'Inactive')),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Wrap(
                    spacing: 8,
                    runSpacing: 4,
                    children: [
                      _MetaChip(label: list.currency),
                      _MetaChip(label: list.channel),
                      _MetaChip(label: list.audience),
                      _MetaChip(label: 'Priority ${list.priority}'),
                    ],
                  ),
                ],
              ),
            ),
          );

          final tierContent = tiersAsync.when(
            skipLoadingOnRefresh: true,

            skipLoadingOnReload: true,
            skipError: true,
            loading: () => const LoadingSpinner(),
            error: (e, _) => AppErrorState(
              title: 'Could not load tiers',
              message: ApiService.errorMessage(e),
              onRetry: () => ref.invalidate(priceListTiersProvider(priceListId)),
            ),
            data: (tiers) {
              final tierList = tiers.isEmpty
                  ? ListView(
                      physics: const AlwaysScrollableScrollPhysics(),
                      padding: const EdgeInsets.fromLTRB(16, 4, 16, 96),
                      children: [
                        SizedBox(
                          height: 260,
                          child: EmptyState(
                            title: 'No quantity tiers',
                            description: canWrite
                                ? 'Add a tier for a product variant to enable quantity-based pricing.'
                                : 'No tiers have been configured for this list.',
                            icon: Icons.stacked_bar_chart,
                            actionLabel: canWrite ? 'Add tier' : null,
                            onAction: canWrite
                                ? () => _addTier(context, ref, list)
                                : null,
                          ),
                        ),
                      ],
                    )
                  : ListView.separated(
                      physics: const AlwaysScrollableScrollPhysics(),
                      padding: const EdgeInsets.fromLTRB(16, 4, 16, 96),
                      itemCount: tiers.length,
                      separatorBuilder: (_, __) => const SizedBox(height: 6),
                      itemBuilder: (context, index) {
                        final tier = tiers[index];
                        final variantName =
                            tier.variantTitle?.isNotEmpty == true
                                ? tier.variantTitle!
                                : (tier.variantSku?.isNotEmpty == true
                                    ? tier.variantSku!
                                    : 'Variant ${tier.variantId.substring(0, tier.variantId.length < 8 ? tier.variantId.length : 8)}');
                        final quantity = tier.maxQty == null
                            ? 'Qty ≥ ${tier.minQty}'
                            : 'Qty ${tier.minQty}–${tier.maxQty! - 1}';
                        return Card(
                          child: ListTile(
                            title: Text(
                              tier.productTitle?.isNotEmpty == true
                                  ? '${tier.productTitle} · ${variantName}'
                                  : variantName,
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(fontWeight: FontWeight.w600),
                            ),
                            subtitle: Text(
                              '${quantity} · ${formatMinor(tier.unitPriceMinor, list.currency)}',
                            ),
                            trailing: canWrite
                                ? PopupMenuButton<String>(
                                    onSelected: (value) {
                                      if (value == 'edit') {
                                        _editTier(
                                          context,
                                          ref,
                                          tier,
                                          list.currency,
                                        );
                                      }
                                      if (value == 'delete') {
                                        _deleteTier(context, ref, tier);
                                      }
                                    },
                                    itemBuilder: (_) => const [
                                      PopupMenuItem(
                                        value: 'edit',
                                        child: Text('Edit tier'),
                                      ),
                                      PopupMenuItem(
                                        value: 'delete',
                                        child: Text('Delete tier'),
                                      ),
                                    ],
                                  )
                                : null,
                          ),
                        );
                      },
                    );

              final content = RefreshIndicator(
                onRefresh: () => _refreshTiers(ref),
                child: tierList,
              );

              if (!tiersAsync.isRefreshing && !tiersAsync.hasError) {
                return content;
              }

              return Column(
                children: [
                  if (tiersAsync.isRefreshing)
                    const Padding(
                      padding: EdgeInsets.all(8),
                      child: Text(
                        'Refreshing quantity tiers… showing the last successful results.',
                        style: TextStyle(fontSize: 12, color: TaifTokens.muted),
                      ),
                    ),
                  if (tiersAsync.hasError)
                    ErrorBanner(
                      message:
                          'Could not refresh tiers: ${ApiService.errorMessage(tiersAsync.error!)}. Showing the last successful results.',
                      onRetry: () =>
                          ref.invalidate(priceListTiersProvider(priceListId)),
                    ),
                  Expanded(child: content),
                ],
              );
            },
          );

          final body = Column(
            children: [
              header,
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 4),
                child: Row(
                  children: [
                    const Expanded(
                      child: Text(
                        'QUANTITY TIERS',
                        style: TextStyle(
                          fontSize: 11,
                          color: TaifTokens.muted,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                    Text(
                      '$tierCount tiers',
                      style: const TextStyle(
                        fontSize: 12,
                        color: TaifTokens.muted,
                      ),
                    ),
                  ],
                ),
              ),
              Expanded(child: tierContent),
            ],
          );

          if (!listAsync.isRefreshing && !listAsync.hasError) {
            return body;
          }

          return Column(
            children: [
              if (listAsync.isRefreshing)
                const Padding(
                  padding: EdgeInsets.all(8),
                  child: Text(
                    'Refreshing price list… showing the last successfully loaded details.',
                    style: TextStyle(fontSize: 12, color: TaifTokens.muted),
                  ),
                ),
              if (listAsync.hasError)
                ErrorBanner(
                  message:
                      'Could not refresh price list: ${ApiService.errorMessage(listAsync.error!)}. Showing the last successfully loaded details.',
                  onRetry: () =>
                      ref.invalidate(priceListDetailProvider(priceListId)),
                ),
              Expanded(child: body),
            ],
          );
        },
      ),
    );
  }

  Future<void> _editList(BuildContext context, WidgetRef ref, PriceList list) async {
    final draft = await showDialog<Map<String, dynamic>>(
      context: context,
      builder: (_) => _PriceListEditDialog(list: list),
    );
    if (draft == null || !context.mounted) return;
    try {
      await ref.read(apiServiceProvider).updatePriceList(
            list.id,
            name: draft['name'] as String,
            priority: draft['priority'] as int,
            isActive: draft['isActive'] as bool,
          );
      ref.invalidate(priceListDetailProvider(priceListId));
      ref.invalidate(merchantPriceListsProvider);
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(ApiService.errorMessage(e)), backgroundColor: TaifTokens.err),
        );
      }
    }
  }

  Future<void> _addTier(BuildContext context, WidgetRef ref, PriceList list) async {
    final draft = await showDialog<Map<String, dynamic>>(
      context: context,
      builder: (_) => _CreatePriceTierDialog(storeId: list.storeId),
    );
    if (draft == null || !context.mounted) return;
    try {
      await ref.read(apiServiceProvider).createPriceTier(
            list.id,
            variantId: draft['variantId'] as String,
            minQty: draft['minQty'] as int,
            maxQty: draft['maxQty'] as int?,
            unitPriceMinor: draft['unitPriceMinor'] as int,
          );
      ref.invalidate(priceListTiersProvider(priceListId));
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(ApiService.errorMessage(e)), backgroundColor: TaifTokens.err),
        );
      }
    }
  }

  Future<void> _editTier(BuildContext context, WidgetRef ref, PriceTier tier, String currency) async {
    final draft = await showDialog<Map<String, dynamic>>(
      context: context,
      builder: (_) => _EditPriceTierDialog(tier: tier, currency: currency),
    );
    if (draft == null || !context.mounted) return;
    try {
      final maxQty = draft['maxQty'] as int?;
      await ref.read(apiServiceProvider).updatePriceTier(
            tier.id,
            minQty: draft['minQty'] as int,
            maxQty: maxQty,
            clearMaxQty: maxQty == null,
            unitPriceMinor: draft['unitPriceMinor'] as int,
          );
      ref.invalidate(priceListTiersProvider(priceListId));
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(ApiService.errorMessage(e)), backgroundColor: TaifTokens.err),
        );
      }
    }
  }

  Future<void> _deleteTier(BuildContext context, WidgetRef ref, PriceTier tier) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Delete price tier?'),
        content: const Text('This removes the quantity rule from this price list.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('Delete')),
        ],
      ),
    );
    if (confirmed != true || !context.mounted) return;
    try {
      await ref.read(apiServiceProvider).deletePriceTier(tier.id);
      ref.invalidate(priceListTiersProvider(priceListId));
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(ApiService.errorMessage(e)), backgroundColor: TaifTokens.err),
        );
      }
    }
  }
}

class _MetaChip extends StatelessWidget {
  const _MetaChip({required this.label});
  final String label;
  @override
  Widget build(BuildContext context) => Chip(
        label: Text(label, style: const TextStyle(fontSize: 11)),
        visualDensity: VisualDensity.compact,
      );
}

class _PriceListEditDialog extends StatefulWidget {
  const _PriceListEditDialog({required this.list});
  final PriceList list;
  @override
  State<_PriceListEditDialog> createState() => _PriceListEditDialogState();
}

class _PriceListEditDialogState extends State<_PriceListEditDialog> {
  late final TextEditingController _name;
  late final TextEditingController _priority;
  late bool _active;

  @override
  void initState() {
    super.initState();
    _name = TextEditingController(text: widget.list.name);
    _priority = TextEditingController(text: widget.list.priority.toString());
    _active = widget.list.isActive;
  }

  @override
  void dispose() {
    _name.dispose();
    _priority.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
        title: const Text('Edit price list'),
        content: Column(mainAxisSize: MainAxisSize.min, children: [
          TextField(controller: _name, decoration: const InputDecoration(labelText: 'Name')),
          TextField(controller: _priority, keyboardType: TextInputType.number,
              decoration: const InputDecoration(labelText: 'Priority')),
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text('Active'),
            value: _active,
            onChanged: (value) => setState(() => _active = value),
          ),
        ]),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
          FilledButton(
            onPressed: () {
              final name = _name.text.trim();
              if (name.isEmpty) return;
              Navigator.pop(context, {
                'name': name,
                'priority': int.tryParse(_priority.text.trim()) ?? widget.list.priority,
                'isActive': _active,
              });
            },
            child: const Text('Save'),
          ),
        ],
      );
}

class _CreatePriceTierDialog extends ConsumerStatefulWidget {
  const _CreatePriceTierDialog({required this.storeId});
  final String storeId;
  @override
  ConsumerState<_CreatePriceTierDialog> createState() => _CreatePriceTierDialogState();
}

class _CreatePriceTierDialogState extends ConsumerState<_CreatePriceTierDialog> {
  final _minQty = TextEditingController(text: '1');
  final _maxQty = TextEditingController();
  final _price = TextEditingController();
  String? _productId;
  String? _variantId;

  @override
  void dispose() {
    _minQty.dispose();
    _maxQty.dispose();
    _price.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final productsAsync = ref.watch(storeProductsProvider(widget.storeId));
    final variantsAsync = _productId == null ? null : ref.watch(productVariantsProvider(_productId!));

    return AlertDialog(
      title: const Text('Add quantity tier'),
      content: SingleChildScrollView(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          productsAsync.when(
            loading: () => const LinearProgressIndicator(),
            error: (e, _) => Text(ApiService.errorMessage(e)),
            data: (products) => DropdownButtonFormField<String>(
              value: _productId,
              isExpanded: true,
              decoration: const InputDecoration(labelText: 'Product'),
              items: products.map((product) => DropdownMenuItem(
                value: product.id,
                child: Text(product.title, overflow: TextOverflow.ellipsis),
              )).toList(),
              onChanged: (value) => setState(() { _productId = value; _variantId = null; }),
            ),
          ),
          const SizedBox(height: 12),
          if (variantsAsync != null)
            variantsAsync.when(
              loading: () => const LinearProgressIndicator(),
              error: (e, _) => Text(ApiService.errorMessage(e)),
              data: (variants) {
                final active = variants.where((variant) => variant.isActive).toList();
                if (active.isEmpty) return const Text('This product has no active variants.');
                return DropdownButtonFormField<String>(
                  value: _variantId,
                  isExpanded: true,
                  decoration: const InputDecoration(labelText: 'Variant'),
                  items: active.map((variant) => DropdownMenuItem(
                    value: variant.id,
                    child: Text(
                      '${variant.sku}${variant.title == null ? '' : ' · ${variant.title}'}',
                      overflow: TextOverflow.ellipsis,
                    ),
                  )).toList(),
                  onChanged: (value) => setState(() => _variantId = value),
                );
              },
            )
          else
            const Align(
              alignment: Alignment.centerLeft,
              child: Text('Select a product to load its variants.',
                  style: TextStyle(fontSize: 12, color: TaifTokens.muted)),
            ),
          const SizedBox(height: 12),
          TextField(controller: _minQty, keyboardType: TextInputType.number,
              decoration: const InputDecoration(labelText: 'Minimum quantity')),
          TextField(controller: _maxQty, keyboardType: TextInputType.number,
              decoration: const InputDecoration(labelText: 'Exclusive upper quantity (blank = unlimited)')),
          TextField(controller: _price,
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
              decoration: const InputDecoration(labelText: 'Unit price')),
        ]),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
        FilledButton(onPressed: _save, child: const Text('Add tier')),
      ],
    );
  }

  void _save() {
    final minQty = int.tryParse(_minQty.text.trim());
    final maxText = _maxQty.text.trim();
    final maxQty = maxText.isEmpty ? null : int.tryParse(maxText);
    final amount = double.tryParse(_price.text.trim());
    if (_variantId == null || minQty == null || minQty < 1 ||
        (maxText.isNotEmpty && (maxQty == null || maxQty <= minQty)) ||
        amount == null || amount <= 0) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Choose a variant and enter valid quantity and price values.')),
      );
      return;
    }
    Navigator.pop(context, {
      'variantId': _variantId,
      'minQty': minQty,
      'maxQty': maxQty,
      'unitPriceMinor': (amount * 100).round(),
    });
  }
}

class _EditPriceTierDialog extends StatefulWidget {
  const _EditPriceTierDialog({required this.tier, required this.currency});
  final PriceTier tier;
  final String currency;
  @override
  State<_EditPriceTierDialog> createState() => _EditPriceTierDialogState();
}

class _EditPriceTierDialogState extends State<_EditPriceTierDialog> {
  late final TextEditingController _minQty;
  late final TextEditingController _maxQty;
  late final TextEditingController _price;

  @override
  void initState() {
    super.initState();
    _minQty = TextEditingController(text: widget.tier.minQty.toString());
    _maxQty = TextEditingController(text: widget.tier.maxQty?.toString() ?? '');
    _price = TextEditingController(text: (widget.tier.unitPriceMinor / 100).toStringAsFixed(2));
  }

  @override
  void dispose() {
    _minQty.dispose();
    _maxQty.dispose();
    _price.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
        title: const Text('Edit quantity tier'),
        content: Column(mainAxisSize: MainAxisSize.min, children: [
          TextField(controller: _minQty, keyboardType: TextInputType.number,
              decoration: const InputDecoration(labelText: 'Minimum quantity')),
          TextField(controller: _maxQty, keyboardType: TextInputType.number,
              decoration: const InputDecoration(labelText: 'Exclusive upper quantity (blank = unlimited)')),
          TextField(controller: _price, keyboardType: const TextInputType.numberWithOptions(decimal: true),
              decoration: InputDecoration(labelText: 'Unit price (${widget.currency})')),
        ]),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
          FilledButton(
            onPressed: () {
              final minQty = int.tryParse(_minQty.text.trim());
              final maxText = _maxQty.text.trim();
              final maxQty = maxText.isEmpty ? null : int.tryParse(maxText);
              final amount = double.tryParse(_price.text.trim());
              if (minQty == null || minQty < 1 ||
                  (maxText.isNotEmpty && (maxQty == null || maxQty <= minQty)) ||
                  amount == null || amount <= 0) return;
              Navigator.pop(context, {
                'minQty': minQty,
                'maxQty': maxQty,
                'unitPriceMinor': (amount * 100).round(),
              });
            },
            child: const Text('Save'),
          ),
        ],
      );
}
