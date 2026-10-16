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

  bool _initialized = false;
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
    if (_initialized) return;
    _initialized = true;
    _displayNameCtrl.text = store.displayName;
    _descriptionCtrl.text = store.description ?? '';
    _timezoneCtrl.text = store.timezone ?? '';
    _cityCtrl.text = (store.address['city'] ?? '').toString();
    if (_currencies.contains(store.currency)) _currency = store.currency;
    _locale = store.locale == 'en' ? 'en' : 'ar';
  }

  Future<void> _save(Store store) async {
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

  @override
  Widget build(BuildContext context) {
    final storeAsync = ref.watch(activeStoreProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Store Profile')),
      body: storeAsync.when(
        loading: () => const LoadingSpinner(),
        error: (e, _) => EmptyState(
            title: 'Error',
            description: ApiService.errorMessage(e),
            onAction: () => ref.invalidate(myStoresProvider)),
        data: (store) {
          if (store == null) {
            return const EmptyState(
                title: 'No store',
                description:
                    'Your organization has no storefront yet. Complete merchant registration first.',
                icon: Icons.storefront_outlined);
          }
          _populate(store);
          return _form(store);
        },
      ),
    );
  }

  Widget _form(Store store) =>
      ListView(padding: const EdgeInsets.all(16), children: [
        if (_error != null) ...[
          ErrorBanner(message: _error!),
          const SizedBox(height: 12),
        ],
        Row(children: [
          Expanded(
              child: Text(store.displayName,
                  style: const TextStyle(
                      fontSize: 18, fontWeight: FontWeight.w700))),
          StatusBadge(store.verificationStatus),
        ]),
        const SizedBox(height: 4),
        Text('Slug: /${store.slug} (read-only)',
            style: const TextStyle(fontSize: 12, color: TaifTokens.muted)),
        const SizedBox(height: 20),
        TextField(
            controller: _displayNameCtrl,
            decoration: const InputDecoration(
                labelText: 'Display Name *', border: OutlineInputBorder())),
        const SizedBox(height: 16),
        TextField(
            controller: _descriptionCtrl,
            maxLines: 3,
            decoration: const InputDecoration(
                labelText: 'Description',
                alignLabelWithHint: true,
                border: OutlineInputBorder())),
        const SizedBox(height: 16),
        Row(children: [
          Expanded(
            child: DropdownButtonFormField<String>(
              initialValue: _currency,
              decoration: const InputDecoration(
                  labelText: 'Currency', border: OutlineInputBorder()),
              items: _currencies
                  .map((c) => DropdownMenuItem(value: c, child: Text(c)))
                  .toList(),
              onChanged: (v) {
                if (v != null) setState(() => _currency = v);
              },
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: DropdownButtonFormField<String>(
              initialValue: _locale,
              decoration: const InputDecoration(
                  labelText: 'Locale', border: OutlineInputBorder()),
              items: const [
                DropdownMenuItem(value: 'ar', child: Text('Arabic')),
                DropdownMenuItem(value: 'en', child: Text('English')),
              ],
              onChanged: (v) {
                if (v != null) setState(() => _locale = v);
              },
            ),
          ),
        ]),
        const SizedBox(height: 16),
        TextField(
            controller: _timezoneCtrl,
            decoration: const InputDecoration(
                labelText: 'Timezone',
                hintText: 'e.g. Asia/Riyadh',
                border: OutlineInputBorder())),
        const SizedBox(height: 16),
        TextField(
            controller: _cityCtrl,
            decoration: const InputDecoration(
                labelText: 'City',
                hintText: 'e.g. Riyadh',
                border: OutlineInputBorder())),
        const SizedBox(height: 24),
        SizedBox(
            width: double.infinity,
            child: ElevatedButton.icon(
                onPressed: _saving ? null : () => _save(store),
                icon: _saving
                    ? const SizedBox(
                        width: 16,
                        height: 16,
                        child: CircularProgressIndicator(
                            strokeWidth: 2, color: Colors.white))
                    : const Icon(Icons.save),
                label: Text(_saving ? 'Saving...' : 'Save Changes'),
                style: ElevatedButton.styleFrom(
                    backgroundColor: TaifTokens.brandPrimary,
                    padding: const EdgeInsets.symmetric(vertical: 14)))),
        const SizedBox(height: 32),
        _warehousesSection(store),
      ]);

  Widget _warehousesSection(Store store) {
    final whs = ref.watch(storeWarehousesProvider(store.id));
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Row(children: [
        const Text('Warehouses',
            style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
        const Spacer(),
        TextButton.icon(
            onPressed: () => _addWarehouse(store.id),
            icon: const Icon(Icons.add, size: 18),
            label: const Text('Add')),
      ]),
      const SizedBox(height: 4),
      whs.when(
        loading: () => const Padding(
            padding: EdgeInsets.symmetric(vertical: 16),
            child: LoadingSpinner()),
        error: (e, _) => ErrorBanner(message: ApiService.errorMessage(e)),
        data: (list) => list.isEmpty
            ? const Padding(
                padding: EdgeInsets.symmetric(vertical: 12),
                child: Text('No warehouses yet.',
                    style: TextStyle(color: TaifTokens.muted, fontSize: 13)))
            : Column(
                children: list
                    .map((w) => Card(
                        margin: const EdgeInsets.only(bottom: 8),
                        child: ListTile(
                            leading: const Icon(Icons.warehouse,
                                color: TaifTokens.brandPrimary),
                            title: Text((w['name'] ?? 'Warehouse').toString(),
                                style: const TextStyle(
                                    fontWeight: FontWeight.w600)),
                            subtitle: Text(_warehouseSubtitle(w)))))
                    .toList(),
              ),
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
