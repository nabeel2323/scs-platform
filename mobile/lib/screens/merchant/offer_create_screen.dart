import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/theme.dart';
import '../../models/models.dart';
import '../../providers/providers.dart';
import '../../services/api_service.dart';
import '../../widgets/app_widgets.dart';
import '../../widgets/common_widgets.dart';

/// Multi-step wizard for creating a new merchant offer.
///
/// Steps: 1) Select product → 2) Select variant (optional) → 3) Set pricing →
/// 4) Set terms (MOQ, lead time) → 5) Review & submit.
///
/// Route: `/merchant/offers/new`. On success, pops back to the offers list and
/// invalidates the list provider so the new offer appears immediately.
class OfferCreateScreen extends ConsumerStatefulWidget {
  const OfferCreateScreen({super.key});
  @override
  ConsumerState<OfferCreateScreen> createState() => _OfferCreateScreenState();
}

class _OfferCreateScreenState extends ConsumerState<OfferCreateScreen> {
  final _pageCtrl = PageController();
  int _step = 0;

  // Step 1 — product
  String _productSearch = '';
  Product? _selectedProduct;

  // Step 2 — variant
  String? _selectedVariantId;

  // Step 3 — pricing
  final _priceCtrl = TextEditingController();
  final _compareAtCtrl = TextEditingController();
  String _currency = 'SAR';

  // Step 4 — terms
  final _moqCtrl = TextEditingController(text: '1');
  final _leadTimeCtrl = TextEditingController();

  bool _submitting = false;

  static const _stepLabels = [
    'Product',
    'Variant',
    'Pricing',
    'Terms',
    'Review',
  ];

  @override
  void dispose() {
    _pageCtrl.dispose();
    _priceCtrl.dispose();
    _compareAtCtrl.dispose();
    _moqCtrl.dispose();
    _leadTimeCtrl.dispose();
    super.dispose();
  }

  void _goTo(int step) {
    _pageCtrl.animateToPage(step,
        duration: const Duration(milliseconds: 250), curve: Curves.easeInOut);
    setState(() => _step = step);
  }

  bool _canNext() {
    switch (_step) {
      case 0:
        return _selectedProduct != null;
      case 1:
        return true; // variant is optional
      case 2:
        return double.tryParse(_priceCtrl.text) != null;
      case 3:
        return int.tryParse(_moqCtrl.text) != null &&
            int.tryParse(_moqCtrl.text)! >= 1;
      case 4:
        return true;
      default:
        return false;
    }
  }

  @override
  Widget build(BuildContext context) {
    final storeAsync = ref.watch(activeStoreProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Create Offer'),
        actions: [
          TextButton(
            onPressed: _submitting ? null : () => context.pop(),
            child:
                const Text('Cancel', style: TextStyle(color: TaifTokens.muted)),
          ),
        ],
      ),
      body: storeAsync.when(
        loading: () => const LoadingSpinner(),
        error: (e, _) => AppErrorState(
          title: 'Could not load store',
          message: ApiService.errorMessage(e),
        ),
        data: (store) {
          if (store == null) {
            return const EmptyState(
              title: 'No store',
              description: 'Register your store first.',
              icon: Icons.storefront_outlined,
            );
          }
          return Column(children: [
            // Step indicator
            _stepIndicator(),
            // Page content
            Expanded(
              child: PageView(
                controller: _pageCtrl,
                physics: const NeverScrollableScrollPhysics(),
                children: [
                  _stepProduct(store),
                  _stepVariant(store),
                  _stepPricing(),
                  _stepTerms(),
                  _stepReview(store),
                ],
              ),
            ),
            // Navigation bar
            _navBar(),
          ]);
        },
      ),
    );
  }

  // ── Step Indicator ──────────────────────────────────────────────

  Widget _stepIndicator() => Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        decoration: const BoxDecoration(
          color: TaifTokens.surface,
          border: Border(bottom: BorderSide(color: TaifTokens.line)),
        ),
        child: Row(children: [
          for (int i = 0; i < _stepLabels.length; i++) ...[
            if (i > 0)
              Expanded(
                child: Container(
                  height: 2,
                  color: i <= _step ? TaifTokens.brandPrimary : TaifTokens.line,
                ),
              ),
            _stepDot(i),
          ],
        ]),
      );

  Widget _stepDot(int i) {
    final active = i == _step;
    final done = i < _step;
    return Column(mainAxisSize: MainAxisSize.min, children: [
      Container(
        width: 28,
        height: 28,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          color: done
              ? TaifTokens.brandPrimary
              : active
                  ? TaifTokens.brandPrimary
                  : TaifTokens.line,
        ),
        child: Center(
          child: done
              ? const Icon(Icons.check, size: 14, color: Colors.white)
              : Text('${i + 1}',
                  style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w700,
                      color: active || done ? Colors.white : TaifTokens.muted)),
        ),
      ),
      const SizedBox(height: 4),
      Text(_stepLabels[i],
          style: TextStyle(
              fontSize: 10,
              fontWeight: active ? FontWeight.w700 : FontWeight.w500,
              color: active ? TaifTokens.brandPrimary : TaifTokens.muted)),
    ]);
  }

  // ── Step 1: Product ─────────────────────────────────────────────

  Widget _stepProduct(Store store) {
    final productsAsync = ref.watch(storeProductsProvider(store.id));
    return productsAsync.when(
      loading: () => const LoadingSpinner(),
      error: (e, _) => AppErrorState(
        title: 'Could not load products',
        message: ApiService.errorMessage(e),
        onRetry: () => ref.invalidate(storeProductsProvider(store.id)),
      ),
      data: (products) {
        final q = _productSearch.trim().toLowerCase();
        final filtered = q.isEmpty
            ? products
            : products
                .where((p) =>
                    p.title.toLowerCase().contains(q) ||
                    (p.description?.toLowerCase().contains(q) ?? false))
                .toList();

        return Column(children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
            child: TextField(
              onChanged: (v) => setState(() => _productSearch = v),
              decoration: const InputDecoration(
                hintText: 'Search products...',
                prefixIcon: Icon(Icons.search),
                isDense: true,
                border: OutlineInputBorder(),
              ),
            ),
          ),
          if (products.isEmpty)
            const Expanded(
              child: EmptyState(
                title: 'No products',
                description:
                    'Add products to your catalog before creating offers.',
                icon: Icons.inventory_2_outlined,
              ),
            )
          else
            Expanded(
              child: filtered.isEmpty
                  ? const EmptyState(
                      title: 'No matches',
                      description: 'Try a different search term.',
                      icon: Icons.search_off)
                  : ListView.builder(
                      padding: const EdgeInsets.symmetric(horizontal: 16),
                      itemCount: filtered.length,
                      itemBuilder: (_, i) {
                        final p = filtered[i];
                        final selected = _selectedProduct?.id == p.id;
                        return Card(
                          margin: const EdgeInsets.only(bottom: 6),
                          shape: RoundedRectangleBorder(
                            borderRadius:
                                BorderRadius.circular(TaifTokens.radiusMd),
                            side: BorderSide(
                              color: selected
                                  ? TaifTokens.brandPrimary
                                  : TaifTokens.line,
                              width: selected ? 2 : 1,
                            ),
                          ),
                          child: ListTile(
                            leading: AppNetworkImage(
                              url: p.imageUrl,
                              width: 44,
                              height: 44,
                              radius: 6,
                            ),
                            title: Text(p.title,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(
                                    fontWeight: FontWeight.w600, fontSize: 14)),
                            subtitle: Text(
                                'MOQ: ${p.moq}${p.priceLabel.isNotEmpty ? ' · ${p.priceLabel}' : ''}',
                                style: const TextStyle(
                                    fontSize: 12, color: TaifTokens.muted)),
                            trailing: selected
                                ? const Icon(Icons.check_circle,
                                    color: TaifTokens.brandPrimary)
                                : null,
                            onTap: () => setState(() => _selectedProduct = p),
                          ),
                        );
                      },
                    ),
            ),
        ]);
      },
    );
  }

  // ── Step 2: Variant ─────────────────────────────────────────────

  Widget _stepVariant(Store store) {
    if (_selectedProduct == null) {
      return const EmptyState(
          title: 'No product selected',
          description: 'Go back and select a product first.');
    }
    final variantsAsync =
        ref.watch(productVariantsProvider(_selectedProduct!.id));
    return variantsAsync.when(
      loading: () => const LoadingSpinner(),
      error: (e, _) => AppErrorState(
        title: 'Could not load variants',
        message: ApiService.errorMessage(e),
      ),
      data: (variants) {
        if (variants.isEmpty) {
          return Center(
            child: Padding(
              padding: const EdgeInsets.all(32),
              child: Column(mainAxisSize: MainAxisSize.min, children: [
                const Icon(Icons.inventory_2_outlined,
                    size: 48, color: TaifTokens.muted),
                const SizedBox(height: 12),
                const Text('No variants',
                    style:
                        TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
                const SizedBox(height: 6),
                const Text(
                    'This product has no variants. The offer will apply to the base product.',
                    textAlign: TextAlign.center,
                    style: TextStyle(fontSize: 13, color: TaifTokens.muted)),
                const SizedBox(height: 16),
                AppButton(
                  label: 'Continue',
                  variant: AppButtonVariant.primary,
                  onPressed: () => _goTo(2),
                ),
              ]),
            ),
          );
        }
        return Column(children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
            child: Row(children: [
              const Expanded(
                child: Text('Select a variant (optional)',
                    style:
                        TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
              ),
              TextButton(
                onPressed: () => setState(() => _selectedVariantId = null),
                child: const Text('Skip'),
              ),
            ]),
          ),
          Expanded(
            child: ListView.builder(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              itemCount: variants.length,
              itemBuilder: (_, i) {
                final v = variants[i];
                final selected = _selectedVariantId == v.id;
                return Card(
                  margin: const EdgeInsets.only(bottom: 6),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(TaifTokens.radiusMd),
                    side: BorderSide(
                      color:
                          selected ? TaifTokens.brandPrimary : TaifTokens.line,
                      width: selected ? 2 : 1,
                    ),
                  ),
                  child: ListTile(
                    title: Text(v.title ?? v.sku,
                        style: const TextStyle(
                            fontWeight: FontWeight.w600, fontSize: 14)),
                    subtitle: Text(
                        'SKU: ${v.sku}${v.title != null ? ' · ${v.title}' : ''}',
                        style: const TextStyle(
                            fontSize: 12, color: TaifTokens.muted)),
                    trailing: selected
                        ? const Icon(Icons.check_circle,
                            color: TaifTokens.brandPrimary)
                        : null,
                    onTap: () => setState(() => _selectedVariantId = v.id),
                  ),
                );
              },
            ),
          ),
        ]);
      },
    );
  }

  // ── Step 3: Pricing ─────────────────────────────────────────────

  Widget _stepPricing() =>
      ListView(padding: const EdgeInsets.all(16), children: [
        const Text('Set your offer pricing',
            style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
        const SizedBox(height: 16),
        AppTextField(
          label: 'Base Price',
          hint: '0.00',
          prefixIcon: Icons.attach_money,
          keyboardType: const TextInputType.numberWithOptions(decimal: true),
          controller: _priceCtrl,
        ),
        const SizedBox(height: 12),
        AppTextField(
          label: 'Compare-at Price (optional)',
          hint: 'Original price before discount',
          prefixIcon: Icons.price_change,
          keyboardType: const TextInputType.numberWithOptions(decimal: true),
          controller: _compareAtCtrl,
        ),
        const SizedBox(height: 16),
        const Text('Currency',
            style: TextStyle(fontSize: 13, color: TaifTokens.muted)),
        const SizedBox(height: 6),
        DropdownButtonFormField<String>(
          initialValue: _currency,
          decoration: const InputDecoration(
            prefixIcon: Icon(Icons.currency_exchange),
          ),
          items: const [
            DropdownMenuItem(value: 'SAR', child: Text('SAR — Saudi Riyal')),
            DropdownMenuItem(value: 'AED', child: Text('AED — UAE Dirham')),
            DropdownMenuItem(value: 'USD', child: Text('USD — US Dollar')),
            DropdownMenuItem(value: 'EUR', child: Text('EUR — Euro')),
          ],
          onChanged: (v) {
            if (v != null) setState(() => _currency = v);
          },
        ),
      ]);

  // ── Step 4: Terms ───────────────────────────────────────────────

  Widget _stepTerms() => ListView(padding: const EdgeInsets.all(16), children: [
        const Text('Set commercial terms',
            style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
        const SizedBox(height: 16),
        AppTextField(
          label: 'Minimum Order Quantity (MOQ)',
          hint: '1',
          prefixIcon: Icons.confirmation_number_outlined,
          keyboardType: TextInputType.number,
          controller: _moqCtrl,
        ),
        const SizedBox(height: 12),
        AppTextField(
          label: 'Lead Time (days, optional)',
          hint: 'e.g. 7',
          prefixIcon: Icons.schedule,
          keyboardType: TextInputType.number,
          controller: _leadTimeCtrl,
        ),
      ]);

  // ── Step 5: Review ──────────────────────────────────────────────

  Widget _stepReview(Store store) {
    final price = double.tryParse(_priceCtrl.text);
    final compareAt = double.tryParse(_compareAtCtrl.text);
    final moq = int.tryParse(_moqCtrl.text) ?? 1;
    final lead = int.tryParse(_leadTimeCtrl.text);
    final priceMinor = price != null ? (price * 100).round() : null;
    final compareMinor = compareAt != null ? (compareAt * 100).round() : null;

    return ListView(padding: const EdgeInsets.all(16), children: [
      const Text('Review your offer',
          style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
      const SizedBox(height: 16),
      _reviewSection('PRODUCT', [
        _reviewRow('Product', _selectedProduct?.title ?? '—'),
        if (_selectedVariantId != null)
          _reviewRow('Variant', _selectedVariantId!.substring(0, 8)),
      ]),
      const SizedBox(height: 12),
      _reviewSection('PRICING', [
        _reviewRow('Base Price',
            priceMinor != null ? formatMinor(priceMinor, _currency) : '—'),
        if (compareMinor != null && compareMinor > 0)
          _reviewRow('Compare-at', formatMinor(compareMinor, _currency)),
        _reviewRow('Currency', _currency),
      ]),
      const SizedBox(height: 12),
      _reviewSection('TERMS', [
        _reviewRow('MOQ', '$moq'),
        if (lead != null) _reviewRow('Lead Time', '$lead days'),
      ]),
      if (_submitting)
        const Padding(
          padding: EdgeInsets.only(top: 20),
          child: Center(child: CircularProgressIndicator()),
        ),
    ]);
  }

  Widget _reviewSection(String title, List<Widget> rows) => Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: TaifTokens.surface,
          borderRadius: BorderRadius.circular(TaifTokens.radiusMd),
          border: Border.all(color: TaifTokens.line),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(title,
                style: const TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w600,
                    color: TaifTokens.muted,
                    letterSpacing: 0.4)),
            const SizedBox(height: 10),
            ...rows,
          ],
        ),
      );

  Widget _reviewRow(String label, String value) => Padding(
        padding: const EdgeInsets.only(bottom: 6),
        child: Row(children: [
          Expanded(
            flex: 2,
            child: Text(label,
                style: const TextStyle(fontSize: 13, color: TaifTokens.muted)),
          ),
          Expanded(
            flex: 3,
            child: Text(value,
                textAlign: TextAlign.right,
                style:
                    const TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
          ),
        ]),
      );

  // ── Navigation Bar ──────────────────────────────────────────────

  Widget _navBar() {
    final isLast = _step == _stepLabels.length - 1;
    final canNext = _canNext();
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
      decoration: const BoxDecoration(
        color: TaifTokens.surface,
        border: Border(top: BorderSide(color: TaifTokens.line)),
      ),
      child: Row(children: [
        if (_step > 0)
          AppButton(
            label: 'Back',
            variant: AppButtonVariant.ghost,
            icon: Icons.arrow_back,
            onPressed: _submitting ? null : () => _goTo(_step - 1),
          )
        else
          const Spacer(),
        const Spacer(),
        AppButton(
          label: isLast ? 'Create Offer' : 'Next',
          variant: AppButtonVariant.primary,
          icon: isLast ? Icons.check : Icons.arrow_forward,
          loading: _submitting,
          onPressed: (!canNext || _submitting) ? null : () => _handleNext(),
        ),
      ]),
    );
  }

  Future<void> _handleNext() async {
    if (_step < _stepLabels.length - 1) {
      _goTo(_step + 1);
      return;
    }
    // Final step — submit.
    await _submit();
  }

  Future<void> _submit() async {
    final store = ref.read(activeStoreProvider).valueOrNull;
    if (store == null || _selectedProduct == null) return;

    final price = double.tryParse(_priceCtrl.text);
    final moq = int.tryParse(_moqCtrl.text) ?? 1;
    final lead = int.tryParse(_leadTimeCtrl.text);
    final priceMinor = price != null ? (price * 100).round() : null;

    setState(() => _submitting = true);
    try {
      final offer = await ref.read(apiServiceProvider).createMerchantOffer(
            storeId: store.id,
            productId: _selectedProduct!.id,
            variantId: _selectedVariantId,
            basePriceMinor: priceMinor,
            currency: _currency,
            moq: moq,
            leadTimeDays: lead,
          );
      // Invalidate the offers list so the new offer appears.
      ref.invalidate(merchantOffersProvider);
      ref.invalidate(merchantOfferAnalyticsProvider);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
              content: Text('Offer created — ${offer.status}'),
              backgroundColor: TaifTokens.ok),
        );
        context.pop();
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(ApiService.errorMessage(e)),
            backgroundColor: TaifTokens.err,
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }
}
