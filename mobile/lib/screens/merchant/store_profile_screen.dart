import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/theme.dart';
import '../../models/models.dart';
import '../../providers/providers.dart';
import '../../services/api_service.dart';
import '../../widgets/common_widgets.dart';

/// Merchant store profile editor — mirrors the web /merchant/store page.
/// Editable: displayName, description, currency, locale, timezone, address city.
/// Read-only: slug, verificationStatus. Includes a warehouses sub-section.
class StoreProfileScreen extends ConsumerStatefulWidget {
  const StoreProfileScreen({super.key});
  @override
  ConsumerState<StoreProfileScreen> createState() => _StoreProfileScreenState();
}

class _StoreProfileScreenState extends ConsumerState<StoreProfileScreen> {
  static const _currencies = [
    'SAR',
    'AED',
    'KWD',
    'BHD',
    'OMR',
    'QAR',
    'USD',
    'EUR',
    'GBP',
  ];

  final _displayNameCtrl = TextEditingController();
  final _descriptionCtrl = TextEditingController();
  final _timezoneCtrl = TextEditingController();
  final _cityCtrl = TextEditingController();
  String _currency = 'SAR';
  String _locale = 'ar';

  String? _initializedStoreId;
  bool _saving = false;
  String? _error;

  @override
  void dispose() {
    _displayNameCtrl.dispose();
    _descriptionCtrl.dispose();
    _timezoneCtrl.dispose();
    _cityCtrl.dispose();
    super.dispose();
  }

  void _populate(Store store) {
    if (_initializedStoreId == store.id) return;
    _initializedStoreId = store.id;
    _displayNameCtrl.text = store.displayName;
    _descriptionCtrl.text = store.description ?? '';
    _timezoneCtrl.text = store.timezone ?? '';
    _cityCtrl.text = (store.address['city'] ?? '').toString();
    if (_currencies.contains(store.currency)) _currency = store.currency;
    _locale = store.locale == 'en' ? 'en' : 'ar';
  }

  Future<void> _save(Store store) async {
    if (ref.read(profileProvider).valueOrNull?.hasPermission('merchant:stores:write') != true) return;
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      final addr = Map<String, dynamic>.from(store.address);
      final city = _cityCtrl.text.trim();
      if (city.isNotEmpty) {
        addr['city'] = city;
      } else {
        addr.remove('city');
      }
      await ref.read(apiServiceProvider).updateStore(
            store.id,
            displayName: _displayNameCtrl.text.trim(),
            description: _descriptionCtrl.text.trim(),
            currency: _currency,
            locale: _locale,
            timezone: _timezoneCtrl.text.trim().isEmpty
                ? null
                : _timezoneCtrl.text.trim(),
            address: addr,
          );
      ref.invalidate(myStoresProvider);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
            content: Text('Store updated'), backgroundColor: TaifTokens.ok));
      }
    } catch (e) {
      setState(() => _error = 'Failed to save: $e');
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _addWarehouse(String storeId) async {
    if (ref.read(profileProvider).valueOrNull?.hasPermission('merchant:stores:write') != true) return;
    final nameCtrl = TextEditingController();
    final cityCtrl = TextEditingController();
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Add Warehouse'),
        content: Column(mainAxisSize: MainAxisSize.min, children: [
          TextField(
              controller: nameCtrl,
              decoration: const InputDecoration(
                  labelText: 'Name *', border: OutlineInputBorder())),
          const SizedBox(height: 12),
          TextField(
              controller: cityCtrl,
              decoration: const InputDecoration(
                  labelText: 'City', border: OutlineInputBorder())),
        ]),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Cancel')),
          ElevatedButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('Add')),
        ],
      ),
    );
    if (ok == true && nameCtrl.text.trim().isNotEmpty) {
      try {
        await ref.read(apiServiceProvider).createWarehouse(
              storeId,
              name: nameCtrl.text.trim(),
              address: cityCtrl.text.trim().isNotEmpty
                  ? {'city': cityCtrl.text.trim()}
                  : null,
            );
        ref.invalidate(storeWarehousesProvider(storeId));
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
              content: Text('Warehouse added'),
              backgroundColor: TaifTokens.ok));
        }
      } catch (e) {
        if (mounted) {
          ScaffoldMessenger.of(context)
              .showSnackBar(SnackBar(content: Text('Failed: $e')));
        }
      }
    }
    nameCtrl.dispose();
    cityCtrl.dispose();
  }

  Future<void> _refreshStoreProfile() async {
    try {
      await ref.refresh(myStoresProvider.future).then<void>((_) {});
    } catch (_) {
      // activeStoreProvider retains its last successful value when possible.
      return;
    }

    Store? store;
    try {
      // activeStoreProvider depends on myStoresProvider; await its recomputed
      // value rather than forcing a second store-directory request.
      store = await ref.read(activeStoreProvider.future);
    } catch (_) {
      return;
    }
    if (store == null) return;

    try {
      await ref.refresh(storeWarehousesProvider(store.id).future).then<void>((_) {});
    } catch (_) {
      // Warehouse reads report their own retry/error state in the form.
    }
  }

  @override
  Widget build(BuildContext context) {
    final storeAsync = ref.watch(activeStoreProvider);
    final canWrite = ref.watch(profileProvider).valueOrNull?.hasPermission('merchant:stores:write') ?? false;
    return Scaffold(
      appBar: AppBar(
        title: const Text('Store Profile'),
        actions: [
          IconButton(
            tooltip: 'Refresh store profile',
            icon: const Icon(Icons.refresh),
            onPressed: _refreshStoreProfile,
          ),
        ],
      ),
      body: storeAsync.when(
        skipLoadingOnRefresh: true,
        skipLoadingOnReload: true,
        skipError: true,
        loading: () => const LoadingSpinner(),
        error: (e, _) => EmptyState(
            title: 'Could not load store profile',
            description: ApiService.errorMessage(e),
            actionLabel: 'Retry store profile',
            onAction: _refreshStoreProfile),
        data: (store) {
          final expectedOrgId = ref.watch(activeOrgIdProvider) ??
              ref.watch(profileProvider).valueOrNull?.activeOrgId;
          if (store != null && expectedOrgId != null && store.orgId != expectedOrgId) {
            if (storeAsync.hasError) {
              return EmptyState(
                title: 'Unable to load active store',
                description: ApiService.errorMessage(storeAsync.error!),
                onAction: () {
                  ref.invalidate(activeStoreProvider);
                  ref.invalidate(myStoresProvider);
                },
              );
            }
            return const LoadingSpinner();
          }
          if (store == null) {
            final empty = const EmptyState(
              title: 'No store',
              description: 'Your organization has no storefront yet. Complete merchant registration first.',
              icon: Icons.storefront_outlined,
            );
            if (!storeAsync.hasError && !storeAsync.isRefreshing) return empty;
            return Column(children: [
              if (storeAsync.hasError)
                _storeReadWarning(storeAsync.error!, ref),
              Expanded(child: empty),
            ]);
          }
          _populate(store);
          final content = _form(store, canWrite);
          if (!storeAsync.isRefreshing && !storeAsync.hasError) return content;
          return Column(children: [
            if (storeAsync.isRefreshing)
              const Padding(
                padding: EdgeInsets.all(8),
                child: Text('Refreshing store profile… showing the last successful details.',
                    style: TextStyle(fontSize: 12, color: TaifTokens.muted)),
              ),
            if (storeAsync.hasError) _storeReadWarning(storeAsync.error!, ref),
            Expanded(child: content),
          ]);
        },
      ),
    );
  }

  Widget _storeReadWarning(Object error, WidgetRef ref) => Container(
        width: double.infinity,
        margin: const EdgeInsets.fromLTRB(12, 8, 12, 8),
        padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(
          color: TaifTokens.err.withValues(alpha: 0.06),
          border: Border.all(color: TaifTokens.err.withValues(alpha: 0.3)),
          borderRadius: BorderRadius.circular(TaifTokens.radiusMd),
        ),
        child: Row(children: [
          Expanded(
            child: Text(
              'Could not refresh store profile: ${ApiService.errorMessage(error)}. Showing the last successfully loaded details.',
              style: const TextStyle(fontSize: 12, color: TaifTokens.err),
            ),
          ),
          TextButton(
            onPressed: _refreshStoreProfile,
            child: const Text('Retry'),
          ),
        ]),
      );

  Widget _form(Store store, bool canWrite) => RefreshIndicator(
      onRefresh: _refreshStoreProfile,
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.all(16),
        children: [
        if (_error != null) ...[
          ErrorBanner(message: _error!),
          const SizedBox(height: 12),
        ],
        Row(children: [
          Expanded(child: Text(store.displayName, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700))),
          StatusBadge(store.verificationStatus),
        ]),
        const SizedBox(height: 4),
        Text('Slug: /${store.slug} (read-only)', style: const TextStyle(fontSize: 12, color: TaifTokens.muted)),
        const SizedBox(height: 20),
        TextField(controller: _displayNameCtrl, enabled: canWrite, decoration: const InputDecoration(labelText: 'Display Name *', border: OutlineInputBorder())),
        const SizedBox(height: 16),
        TextField(controller: _descriptionCtrl, enabled: canWrite, maxLines: 3, decoration: const InputDecoration(labelText: 'Description', alignLabelWithHint: true, border: OutlineInputBorder())),
        const SizedBox(height: 16),
        Row(children: [
          Expanded(child: DropdownButtonFormField<String>(
            initialValue: _currency,
            decoration: const InputDecoration(labelText: 'Currency', border: OutlineInputBorder()),
            items: _currencies.map((currency) => DropdownMenuItem(value: currency, child: Text(currency))).toList(),
            onChanged: canWrite ? (value) { if (value != null) setState(() => _currency = value); } : null,
          )),
          const SizedBox(width: 12),
          Expanded(child: DropdownButtonFormField<String>(
            initialValue: _locale,
            decoration: const InputDecoration(labelText: 'Locale', border: OutlineInputBorder()),
            items: const [DropdownMenuItem(value: 'ar', child: Text('Arabic')), DropdownMenuItem(value: 'en', child: Text('English'))],
            onChanged: canWrite ? (value) { if (value != null) setState(() => _locale = value); } : null,
          )),
        ]),
        const SizedBox(height: 16),
        TextField(controller: _timezoneCtrl, enabled: canWrite, decoration: const InputDecoration(labelText: 'Timezone', hintText: 'e.g. Asia/Riyadh', border: OutlineInputBorder())),
        const SizedBox(height: 16),
        TextField(controller: _cityCtrl, enabled: canWrite, decoration: const InputDecoration(labelText: 'City', hintText: 'e.g. Riyadh', border: OutlineInputBorder())),
        const SizedBox(height: 24),
        if (canWrite) SizedBox(
          width: double.infinity,
          child: ElevatedButton.icon(
            onPressed: _saving ? null : () => _save(store),
            icon: _saving ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white)) : const Icon(Icons.save),
            label: Text(_saving ? 'Saving...' : 'Save Changes'),
            style: ElevatedButton.styleFrom(backgroundColor: TaifTokens.brandPrimary, padding: const EdgeInsets.symmetric(vertical: 14)),
          ),
        ),
        if (!canWrite) const Text('Read-only: store changes require merchant:stores:write', style: TextStyle(color: TaifTokens.muted, fontSize: 12)),
        const SizedBox(height: 32),
        _warehousesSection(store, canWrite),
        ],
      ),
    );

  Widget _warehousesSection(Store store, bool canWrite) {
    final whs = ref.watch(storeWarehousesProvider(store.id));
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Row(children: [
        const Text('Warehouses',
            style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
        const Spacer(),
        if (canWrite) TextButton.icon(
            onPressed: () => _addWarehouse(store.id),
            icon: const Icon(Icons.add, size: 18),
            label: const Text('Add')),
      ]),
      const SizedBox(height: 4),
      whs.when(
        skipLoadingOnRefresh: true,
        skipLoadingOnReload: true,
        skipError: true,
        loading: () => const Padding(
          padding: EdgeInsets.symmetric(vertical: 16),
          child: LoadingSpinner(),
        ),
        error: (e, _) => ErrorBanner(
          message: 'Could not load warehouses: ${ApiService.errorMessage(e)}',
          onRetry: () => ref.invalidate(storeWarehousesProvider(store.id)),
        ),
        data: (list) {
          final content = list.isEmpty
              ? const Padding(
                  padding: EdgeInsets.symmetric(vertical: 12),
                  child: Text(
                    'No warehouses yet.',
                    style: TextStyle(color: TaifTokens.muted, fontSize: 13),
                  ),
                )
              : Column(
                  children: list
                      .map((w) => Card(
                            margin: const EdgeInsets.only(bottom: 8),
                            child: ListTile(
                              leading: const Icon(
                                Icons.warehouse,
                                color: TaifTokens.brandPrimary,
                              ),
                              title: Text(
                                (w['name'] ?? 'Warehouse').toString(),
                                style: const TextStyle(
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                              subtitle: Text(_warehouseSubtitle(w)),
                            ),
                          ))
                      .toList(),
                );

          if (!whs.isRefreshing && !whs.hasError) return content;

          return Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (whs.isRefreshing)
                const Padding(
                  padding: EdgeInsets.symmetric(vertical: 8),
                  child: Text(
                    'Refreshing warehouses… showing the last successful list.',
                    style: TextStyle(fontSize: 12, color: TaifTokens.muted),
                  ),
                ),
              if (whs.hasError)
                ErrorBanner(
                  message:
                      'Could not refresh warehouses: ${ApiService.errorMessage(whs.error!)}. Showing the last successful list.',
                  onRetry: () =>
                      ref.invalidate(storeWarehousesProvider(store.id)),
                ),
              content,
            ],
          );
        },
      ),
    ]);
  }

  String _warehouseSubtitle(Map<String, dynamic> w) {
    final addr = w['address'];
    final city = addr is Map ? (addr['city'] ?? '').toString() : '';
    final code = (w['code'] ?? '').toString();
    final parts = <String>[
      if (code.isNotEmpty) code,
      if (city.isNotEmpty) city,
    ];
    return parts.isEmpty ? '—' : parts.join(' · ');
  }
}
