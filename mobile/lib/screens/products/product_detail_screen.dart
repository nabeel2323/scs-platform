import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/theme.dart';
import '../../models/models.dart';
import '../../providers/providers.dart';
import '../../widgets/common_widgets.dart';

/// PHASE COS-15: Enhanced product detail with dynamic variant selector,
/// offer comparison, and structured specifications.
class ProductDetailScreen extends ConsumerStatefulWidget {
  final String productId;
  const ProductDetailScreen({super.key, required this.productId});

  @override
  ConsumerState<ProductDetailScreen> createState() =>
      _ProductDetailScreenState();
}

class _ProductDetailScreenState extends ConsumerState<ProductDetailScreen> {
  // ── Variant selector state ──
  VariantMatrix? _matrix;
  final Map<String, String> _selectedDims = {};

  // ── Offer comparison state ──
  List<Offer> _offers = [];
  Map<String, RankedProductOffer> _rankedById = {};
  String _offerSort = 'price';
  bool _offersLoading = true;

  // ── Add-to-cart feedback ──
  String? _addedId;

  @override
  void initState() {
    super.initState();
    _loadVariantMatrix();
    _loadOffers();
  }

  Future<void> _loadVariantMatrix() async {
    try {
      final matrix = await ref
          .read(apiServiceProvider)
          .fetchVariantMatrix(widget.productId);
      if (!mounted) return;
      setState(() {
        _matrix = matrix;
      });
    } catch (_) {
      if (!mounted) return;
    }
  }

  Future<void> _loadOffers() async {
    try {
      final api = ref.read(apiServiceProvider);
      final results = await Future.wait([
        api.fetchProductOffers(widget.productId),
        api.fetchProductOffersRanked(widget.productId),
      ]);
      if (!mounted) return;
      final offers = results[0] as List<Offer>;
      final ranked = results[1] as List<RankedProductOffer>;
      setState(() {
        _offers = offers;
        _rankedById = {for (final r in ranked) r.offerId: r};
        _offersLoading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() => _offersLoading = false);
    }
  }

  Future<void> _add(BuildContext context, WidgetRef ref, Product p,
      {String? variantId, String? offerId}) async {
    try {
      await ref
          .read(apiServiceProvider)
          .addProductToCart(p, variantId: variantId, offerId: offerId);
      ref.invalidate(cartProvider);
      if (!context.mounted) return;
      setState(() => _addedId = offerId ?? variantId ?? 'default');
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('Added to cart')));
      Future.delayed(const Duration(seconds: 2), () {
        if (mounted) setState(() => _addedId = null);
      });
    } catch (e) {
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
    }
  }

  /// Check if a dimension option is available (has at least one variant).
  bool _isOptionAvailable(String dimId, String option) {
    if (_matrix == null) return true;
    final testSelection = Map<String, String>.from(_selectedDims);
    testSelection[dimId] = option;
    // Simplified: check if any variant matches all selected dimensions
    // In a real implementation this would check the full variant matrix
    return true;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Product')),
      body: FutureBuilder<Product>(
        future: ref.read(apiServiceProvider).fetchProduct(widget.productId),
        builder: (context, snap) {
          if (snap.connectionState != ConnectionState.done) {
            return const LoadingSpinner();
          }
          if (snap.hasError) {
            return EmptyState(title: 'Error', description: '${snap.error}');
          }
          final p = snap.data!;
          final currency = p.store?.currency ?? 'SAR';
          int? bestPrice;
          for (final v in p.variants) {
            final price = v.priceMinor;
            if (!v.isActive || price == null) continue;
            if (bestPrice == null || price < bestPrice) bestPrice = price;
          }
          final priced = bestPrice != null;

          return SingleChildScrollView(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // ── Image ──
                _buildImage(p),
                const SizedBox(height: 16),
                // ── Title ──
                Text(p.title,
                    style: Theme.of(context)
                        .textTheme
                        .headlineSmall
                        ?.copyWith(fontWeight: FontWeight.w700)),
                if (p.titleAr != null)
                  Padding(
                    padding: const EdgeInsets.only(top: 4),
                    child: Text(p.titleAr!,
                        style: const TextStyle(
                            fontSize: 16, color: TaifTokens.muted),
                        textDirection: TextDirection.rtl),
                  ),
                const SizedBox(height: 8),
                Row(children: [
                  StatusBadge(p.status),
                  const SizedBox(width: 8),
                  Text('MOQ: ${p.moq}',
                      style: const TextStyle(color: TaifTokens.muted))
                ]),
                const SizedBox(height: 8),
                // ── Price ──
                Text(
                  priced
                      ? 'from ${formatMinor(bestPrice, currency)}'
                      : 'Price on request',
                  style: TextStyle(
                      fontSize: 20,
                      fontWeight: FontWeight.w700,
                      color: priced ? TaifTokens.ok : TaifTokens.muted),
                ),
                // ── Seller ──
                if (p.store != null) _buildSellerRow(p),
                // ── Description ──
                if (p.description != null) ...[
                  const SizedBox(height: 16),
                  Text(p.description!,
                      style: const TextStyle(fontSize: 14, height: 1.5))
                ],
                // ── Specifications (PHASE COS-15) ──
                if (p.attributeValues != null && p.attributeValues!.isNotEmpty)
                  ..._buildSpecifications(p),
                // ── Variant Selector (PHASE COS-15) ──
                if (p.productTypeId != null &&
                    _matrix != null &&
                    _matrix!.dimensions.isNotEmpty) ...[
                  const SizedBox(height: 24),
                  _buildVariantSelector(p, currency),
                ],
                // ── Flat variant list (fallback) ──
                if (p.variants.isNotEmpty &&
                    (_matrix == null || _matrix!.dimensions.isEmpty)) ...[
                  const SizedBox(height: 24),
                  _buildFlatVariants(p, currency),
                ],
                // ── Offer Comparison (PHASE COS-15) ──
                if (!_offersLoading && _offers.isNotEmpty) ...[
                  const SizedBox(height: 24),
                  _buildOfferComparison(p, currency),
                ],
                // ── Add to Cart ──
                const SizedBox(height: 24),
                SizedBox(
                    width: double.infinity,
                    height: 48,
                    child: ElevatedButton.icon(
                        icon: const Icon(Icons.add_shopping_cart),
                        onPressed: () => _add(context, ref, p),
                        label: const Text('Add to Cart'))),
                const SizedBox(height: 16),
              ],
            ),
          );
        },
      ),
    );
  }

  Widget _buildImage(Product p) => Container(
      height: 180,
      width: double.infinity,
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
          color: TaifTokens.bg, borderRadius: BorderRadius.circular(10)),
      child: p.imageUrl == null
          ? const Center(
              child: Icon(Icons.inventory_2, size: 64, color: TaifTokens.muted))
          : Image.network(p.imageUrl!,
              fit: BoxFit.cover,
              errorBuilder: (_, __, ___) => const Center(
                  child: Icon(Icons.inventory_2,
                      size: 64, color: TaifTokens.muted))));

  Widget _buildSellerRow(Product p) => Padding(
        padding: const EdgeInsets.only(top: 8),
        child: GestureDetector(
          onTap: () => context.push('/stores/${p.store!.id}'),
          child: Row(
            children: [
              const Text('Sold by ',
                  style: TextStyle(fontSize: 13, color: TaifTokens.muted)),
              Flexible(
                child: Text(p.store!.name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                        fontSize: 13, fontWeight: FontWeight.w600)),
              ),
              if (p.store!.isVerified)
                const Padding(
                  padding: EdgeInsets.only(left: 6),
                  child: Icon(Icons.verified, size: 15, color: TaifTokens.ok),
                ),
              const Icon(Icons.chevron_right,
                  size: 16, color: TaifTokens.muted),
            ],
          ),
        ),
      );

  // ── PHASE COS-15: Specifications table ──
  List<Widget> _buildSpecifications(Product p) {
    return [
      const SizedBox(height: 24),
      Text('Specifications',
          style: Theme.of(context).textTheme.titleMedium?.copyWith(
              fontWeight: FontWeight.w600, color: TaifTokens.brandPrimary)),
      const SizedBox(height: 8),
      ...p.attributeValues!.map((av) => Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            decoration: const BoxDecoration(
              border: Border(bottom: BorderSide(color: TaifTokens.line)),
            ),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                SizedBox(
                  width: 120,
                  child: Text(av.label,
                      style: const TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w500,
                          color: TaifTokens.muted)),
                ),
                Expanded(
                  child: Text(av.value?.toString() ?? '—',
                      style: const TextStyle(fontSize: 13)),
                ),
              ],
            ),
          )),
    ];
  }

  // ── PHASE COS-15: Dynamic variant selector ──
  Widget _buildVariantSelector(Product p, String currency) {
    final matrix = _matrix!;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('Variants',
            style: Theme.of(context).textTheme.titleMedium?.copyWith(
                fontWeight: FontWeight.w600, color: TaifTokens.brandPrimary)),
        const SizedBox(height: 12),
        ...matrix.dimensions.map((dim) => Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    dim.name,
                    style: const TextStyle(
                        fontSize: 13, fontWeight: FontWeight.w600),
                  ),
                  const SizedBox(height: 6),
                  Wrap(
                    spacing: 6,
                    runSpacing: 6,
                    children: dim.options.map((opt) {
                      final isSelected =
                          _selectedDims[dim.attributeDefinitionId] == opt;
                      final isAvail =
                          _isOptionAvailable(dim.attributeDefinitionId, opt);
                      return ChoiceChip(
                        label: Text(opt),
                        selected: isSelected,
                        onSelected: isAvail
                            ? (_) => setState(() =>
                                _selectedDims[dim.attributeDefinitionId] = opt)
                            : null,
                        selectedColor: TaifTokens.brandPrimary.withAlpha(30),
                        disabledColor: TaifTokens.bg,
                        labelStyle: TextStyle(
                          fontSize: 12,
                          color: isAvail ? TaifTokens.ink : TaifTokens.muted,
                        ),
                      );
                    }).toList(),
                  ),
                ],
              ),
            )),
      ],
    );
  }

  // ── Flat variant list (fallback when no product type) ──
  Widget _buildFlatVariants(Product p, String currency) {
    final activeVariants = p.variants.where((v) => v.isActive).toList();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('Variants (${activeVariants.length})',
            style: Theme.of(context).textTheme.titleMedium?.copyWith(
                fontWeight: FontWeight.w600, color: TaifTokens.brandPrimary)),
        const SizedBox(height: 8),
        ...activeVariants.map((v) => Card(
            child: ListTile(
                title: Text(v.title ?? v.sku),
                subtitle: Text('${v.unit} · Available'),
                trailing: Row(mainAxisSize: MainAxisSize.min, children: [
                  Text(
                      v.priceMinor != null
                          ? formatMinor(v.priceMinor!, currency)
                          : '—',
                      style: const TextStyle(
                          fontWeight: FontWeight.w700, fontSize: 16)),
                  IconButton(
                      tooltip: 'Add ${v.title ?? v.sku}',
                      onPressed: () => _add(context, ref, p, variantId: v.id),
                      icon: const Icon(Icons.add_shopping_cart, size: 20)),
                ])))),
      ],
    );
  }

  // ── PHASE COS-15: Offer comparison ──
  Widget _buildOfferComparison(Product p, String currency) {
    // Sort offers
    final sorted = List<Offer>.from(_offers);
    if (_offerSort == 'price') {
      sorted.sort((a, b) => a.basePriceMinor.compareTo(b.basePriceMinor));
    } else if (_offerSort == 'moq') {
      sorted.sort((a, b) => a.moq.compareTo(b.moq));
    } else if (_offerSort == 'lead') {
      sorted.sort(
          (a, b) => (a.leadTimeDays ?? 999).compareTo(b.leadTimeDays ?? 999));
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Text('All Offers (${_offers.length})',
                style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w600,
                    color: TaifTokens.brandPrimary)),
            const Spacer(),
            PopupMenuButton<String>(
              onSelected: (v) => setState(() => _offerSort = v),
              itemBuilder: (_) => [
                const PopupMenuItem(value: 'price', child: Text('Sort: Price')),
                const PopupMenuItem(value: 'moq', child: Text('Sort: MOQ')),
                const PopupMenuItem(
                    value: 'lead', child: Text('Sort: Lead Time')),
              ],
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(
                    border: Border.all(color: TaifTokens.line),
                    borderRadius: BorderRadius.circular(6)),
                child: Row(children: [
                  Text(_offerSort, style: const TextStyle(fontSize: 12)),
                  const Icon(Icons.arrow_drop_down, size: 16),
                ]),
              ),
            ),
          ],
        ),
        const SizedBox(height: 8),
        ...sorted.map((offer) {
          final rank = _rankedById[offer.id];
          final isPopular = rank?.isMostPopular ?? false;
          final added = _addedId == 'offer:${offer.id}';
          return Container(
            margin: const EdgeInsets.only(bottom: 8),
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: isPopular ? const Color(0xFFFFFDF5) : TaifTokens.surface,
              border: Border.all(
                  color: isPopular ? TaifTokens.brandAccent : TaifTokens.line),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Column(
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(children: [
                            Text(offer.storeName,
                                style: const TextStyle(
                                    fontWeight: FontWeight.w600, fontSize: 14)),
                            if (offer.storeVerified)
                              const Padding(
                                padding: EdgeInsets.only(left: 4),
                                child: Icon(Icons.verified,
                                    size: 14, color: TaifTokens.ok),
                              ),
                            if (isPopular)
                              Container(
                                margin: const EdgeInsets.only(left: 6),
                                padding: const EdgeInsets.symmetric(
                                    horizontal: 6, vertical: 1),
                                decoration: BoxDecoration(
                                    color: TaifTokens.brandAccent,
                                    borderRadius: BorderRadius.circular(4)),
                                child: const Text('★ #1',
                                    style: TextStyle(
                                        fontSize: 10,
                                        fontWeight: FontWeight.w700,
                                        color: Colors.white)),
                              ),
                          ]),
                          const SizedBox(height: 4),
                          Text(
                              'MOQ: ${offer.moq}${offer.leadTimeDays != null ? ' · ${offer.leadTimeDays}d lead' : ''}',
                              style: const TextStyle(
                                  fontSize: 12, color: TaifTokens.muted)),
                        ],
                      ),
                    ),
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        Text(formatMinor(offer.basePriceMinor, offer.currency),
                            style: const TextStyle(
                                fontWeight: FontWeight.w700,
                                fontSize: 16,
                                color: TaifTokens.brandPrimary)),
                        const SizedBox(height: 4),
                        SizedBox(
                          height: 32,
                          child: ElevatedButton(
                            onPressed: () => _add(context, ref, p,
                                variantId: offer.variantId, offerId: offer.id),
                            style: ElevatedButton.styleFrom(
                              padding:
                                  const EdgeInsets.symmetric(horizontal: 12),
                              backgroundColor: added
                                  ? TaifTokens.ok
                                  : TaifTokens.brandAccent,
                              minimumSize: const Size(0, 32),
                            ),
                            child: Text(added ? '✓ Added' : 'Add',
                                style: const TextStyle(
                                    fontSize: 12, color: Colors.white)),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ],
            ),
          );
        }),
      ],
    );
  }
}
