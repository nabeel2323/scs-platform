import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/theme.dart';
import '../../models/models.dart';
import '../../providers/providers.dart';
import '../../services/api_service.dart';
import '../../widgets/app_widgets.dart';
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

  // ── Image gallery state (Phase 2, §18) ──
  final PageController _galleryCtrl = PageController();
  int _galleryPage = 0;

  @override
  void initState() {
    super.initState();
    _loadVariantMatrix();
    _loadOffers();
  }

  @override
  void dispose() {
    _galleryCtrl.dispose();
    super.dispose();
  }

  Future<void> _loadVariantMatrix() async {
    try {
      final matrix = await ref
          .read(apiServiceProvider)
          .fetchVariantMatrix(widget.productId);
      if (!mounted) return;
      setState(() {
        _matrix = matrix;
        // Auto-select the first active combination so the PDP resolves to a
        // real price/stock/SKU immediately instead of an empty selector.
        if (_selectedDims.isEmpty && matrix.activeCombinations.isNotEmpty) {
          _selectedDims.addAll(matrix.activeCombinations.first.values);
        }
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
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(ApiService.errorMessage(e))));
    }
  }

  /// An option is available when at least one *active* combination carries it
  /// AND is compatible with every other dimension currently selected. This is
  /// what greys out impossible choices as the buyer narrows the selection.
  bool _isOptionAvailable(String dimId, String option) {
    final matrix = _matrix;
    if (matrix == null || matrix.combinations.isEmpty) return true;
    return matrix.activeCombinations.any((c) {
      if (c.values[dimId] != option) return false;
      for (final entry in _selectedDims.entries) {
        if (entry.key == dimId) continue;
        if (c.values[entry.key] != entry.value) return false;
      }
      return true;
    });
  }

  /// The single active combination matching ALL selected dimensions, or null
  /// when the selection is incomplete or resolves to no live variant.
  VariantCombination? _resolvedCombination() {
    final matrix = _matrix;
    if (matrix == null || matrix.dimensions.isEmpty) return null;
    for (final dim in matrix.dimensions) {
      if (!_selectedDims.containsKey(dim.attributeDefinitionId)) return null;
    }
    for (final c in matrix.activeCombinations) {
      var match = true;
      for (final dim in matrix.dimensions) {
        if (c.values[dim.attributeDefinitionId] !=
            _selectedDims[dim.attributeDefinitionId]) {
          match = false;
          break;
        }
      }
      if (match) return c;
    }
    return null;
  }

  /// Record a dimension choice, then drop any other-dimension selections that
  /// this choice made impossible so the selector never shows a stale combo.
  void _selectOption(String dimId, String option) {
    setState(() {
      _selectedDims[dimId] = option;
      final matrix = _matrix;
      if (matrix == null) return;
      for (final dim in matrix.dimensions) {
        final id = dim.attributeDefinitionId;
        if (id == dimId) continue;
        final current = _selectedDims[id];
        if (current != null && !_isOptionAvailable(id, current)) {
          _selectedDims.remove(id);
        }
      }
    });
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
          final hasMatrix = _matrix != null && _matrix!.dimensions.isNotEmpty;
          final resolved = _resolvedCombination();

          return SingleChildScrollView(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // ── Image gallery (§18) ──
                _buildGallery(p),
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
                // ── Seller reviews (§21) ──
                const SizedBox(height: 24),
                _buildReviews(p),
                // ── Add to Cart ──
                const SizedBox(height: 24),
                SizedBox(
                    width: double.infinity,
                    height: 48,
                    child: ElevatedButton.icon(
                        icon: const Icon(Icons.add_shopping_cart),
                        onPressed: (hasMatrix &&
                                (resolved == null || !resolved.inStock))
                            ? null
                            : () => _add(context, ref, p,
                                variantId: resolved?.variantId),
                        label: Text(!hasMatrix
                            ? 'Add to Cart'
                            : resolved == null
                                ? 'Select options'
                                : resolved.inStock
                                    ? 'Add to Cart'
                                    : 'Out of stock'))),
                const SizedBox(height: 16),
              ],
            ),
          );
        },
      ),
    );
  }

  // ── §18: swipeable image gallery backed by the product media endpoint ──
  //
  // Media rows carry a server-resolved `displayUrl` (the raw `url` is an
  // object-storage key, not loadable), so the gallery renders `renderUrl`.
  // Falls back to the product's own primary image, then to a placeholder.
  Widget _buildGallery(Product p) {
    final mediaAsync = ref.watch(productMediaProvider(widget.productId));
    final images = <String>[];
    mediaAsync.whenData((list) {
      final sorted = list
          .where((m) => m.isImage && m.renderUrl.isNotEmpty)
          .toList()
        ..sort((a, b) => a.sortOrder.compareTo(b.sortOrder));
      images.addAll(sorted.map((m) => m.renderUrl));
    });
    if (images.isEmpty && p.imageUrl != null) images.add(p.imageUrl!);

    if (images.isEmpty) {
      return Container(
        height: 240,
        width: double.infinity,
        decoration: BoxDecoration(
          color: TaifTokens.bg,
          borderRadius: BorderRadius.circular(TaifTokens.radiusMd),
        ),
        child: const Center(
          child: Icon(Icons.inventory_2, size: 64, color: TaifTokens.muted),
        ),
      );
    }

    return Column(children: [
      GestureDetector(
        onTap: () => _openZoom(images, _galleryPage),
        child: Container(
          height: 260,
          width: double.infinity,
          clipBehavior: Clip.antiAlias,
          decoration: BoxDecoration(
            color: TaifTokens.bg,
            borderRadius: BorderRadius.circular(TaifTokens.radiusMd),
          ),
          child: Stack(children: [
            PageView.builder(
              controller: _galleryCtrl,
              itemCount: images.length,
              onPageChanged: (i) => setState(() => _galleryPage = i),
              itemBuilder: (_, i) => AppNetworkImage(
                url: images[i],
                width: double.infinity,
                height: 260,
                fit: BoxFit.contain,
              ),
            ),
            if (images.length > 1)
              Positioned(
                right: 10,
                top: 10,
                child: Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(
                    color: Colors.black54,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Text('${_galleryPage + 1} / ${images.length}',
                      style: const TextStyle(
                          color: Colors.white,
                          fontSize: 11,
                          fontWeight: FontWeight.w600)),
                ),
              ),
          ]),
        ),
      ),
      if (images.length > 1 && images.length <= 8) ...[
        const SizedBox(height: 8),
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            for (var i = 0; i < images.length; i++)
              AnimatedContainer(
                duration: const Duration(milliseconds: 200),
                margin: const EdgeInsets.symmetric(horizontal: 3),
                width: i == _galleryPage ? 16 : 6,
                height: 6,
                decoration: BoxDecoration(
                  color: i == _galleryPage
                      ? TaifTokens.brandPrimary
                      : TaifTokens.line,
                  borderRadius: BorderRadius.circular(3),
                ),
              ),
          ],
        ),
      ],
    ]);
  }

  void _openZoom(List<String> images, int index) {
    showDialog<void>(
      context: context,
      builder: (_) => _GalleryZoomDialog(images: images, initialIndex: index),
    );
  }

  // ── §21: seller reviews (store-scoped — the only review subject the API
  // exposes for a product's seller). Average + recent comments, never faked. ──
  Widget _buildReviews(Product p) {
    final reviewsAsync = ref.watch(storeReviewsProvider(p.storeId));
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('Seller reviews',
            style: Theme.of(context).textTheme.titleMedium?.copyWith(
                fontWeight: FontWeight.w600, color: TaifTokens.brandPrimary)),
        const SizedBox(height: 8),
        reviewsAsync.when(
          data: (reviews) {
            if (reviews.isEmpty) {
              return Container(
                width: double.infinity,
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: TaifTokens.bg,
                  borderRadius: BorderRadius.circular(TaifTokens.radiusSm),
                  border: Border.all(color: TaifTokens.line),
                ),
                child: const Row(children: [
                  Icon(Icons.reviews_outlined,
                      size: 18, color: TaifTokens.muted),
                  SizedBox(width: 8),
                  Expanded(
                    child: Text('No reviews yet for this seller.',
                        style:
                            TextStyle(fontSize: 13, color: TaifTokens.muted)),
                  ),
                ]),
              );
            }
            final sum = reviews.fold<int>(0, (s, r) => s + r.rating);
            final avg = sum / reviews.length;
            return Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(children: [
                  _stars(avg.round()),
                  const SizedBox(width: 8),
                  Text(
                      '${avg.toStringAsFixed(1)} · ${reviews.length} '
                      'review${reviews.length == 1 ? '' : 's'}',
                      style: const TextStyle(
                          fontSize: 13, color: TaifTokens.muted)),
                ]),
                const SizedBox(height: 10),
                ...reviews.take(5).map(_reviewTile),
                if (reviews.length > 5)
                  Padding(
                    padding: const EdgeInsets.only(top: 4),
                    child: Text('Showing 5 of ${reviews.length} reviews',
                        style: const TextStyle(
                            fontSize: 12, color: TaifTokens.muted)),
                  ),
              ],
            );
          },
          loading: () => const Padding(
            padding: EdgeInsets.symmetric(vertical: 16),
            child: Center(child: CircularProgressIndicator()),
          ),
          error: (_, __) => const SizedBox.shrink(),
        ),
      ],
    );
  }

  Widget _reviewTile(Review r) => Container(
        margin: const EdgeInsets.only(bottom: 8),
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: TaifTokens.surface,
          borderRadius: BorderRadius.circular(TaifTokens.radiusSm),
          border: Border.all(color: TaifTokens.line),
        ),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            _stars(r.rating),
            const Spacer(),
            Text(_fmtDate(r.createdAt),
                style: const TextStyle(fontSize: 11, color: TaifTokens.muted)),
          ]),
          if (r.comment != null && r.comment!.trim().isNotEmpty) ...[
            const SizedBox(height: 6),
            Text(r.comment!, style: const TextStyle(fontSize: 13, height: 1.4)),
          ],
        ]),
      );

  Widget _stars(int rating) => Row(mainAxisSize: MainAxisSize.min, children: [
        for (var i = 1; i <= 5; i++)
          Icon(i <= rating ? Icons.star : Icons.star_border,
              size: 15, color: TaifTokens.brandAccent),
      ]);

  String _fmtDate(String iso) {
    final d = DateTime.tryParse(iso);
    if (d == null) return '';
    final l = d.toLocal();
    return '${l.year}-${l.month.toString().padLeft(2, '0')}-'
        '${l.day.toString().padLeft(2, '0')}';
  }

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
                            ? (_) =>
                                _selectOption(dim.attributeDefinitionId, opt)
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
        const SizedBox(height: 4),
        _buildResolvedVariant(currency),
      ],
    );
  }

  // ── §19: resolved variant — real SKU/price/stock for the current selection ──
  Widget _buildResolvedVariant(String currency) {
    final resolved = _resolvedCombination();
    if (resolved == null) {
      return Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: TaifTokens.bg,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: TaifTokens.line),
        ),
        child: const Row(
          children: [
            Icon(Icons.touch_app, size: 18, color: TaifTokens.muted),
            SizedBox(width: 8),
            Expanded(
              child: Text('Select all options to see price & availability',
                  style: TextStyle(fontSize: 13, color: TaifTokens.muted)),
            ),
          ],
        ),
      );
    }
    final priceText = resolved.unitPriceMinor != null
        ? formatMinor(resolved.unitPriceMinor!, resolved.currency ?? currency)
        : 'Price on request';
    final stockText = resolved.stockAvailable == null
        ? 'On request'
        : (resolved.stockAvailable! > 0
            ? '${resolved.stockAvailable!} available'
            : 'Out of stock');
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: TaifTokens.surface,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: TaifTokens.line),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(resolved.title ?? resolved.sku,
                    style: const TextStyle(
                        fontWeight: FontWeight.w600, fontSize: 14)),
              ),
              Text(priceText,
                  style: const TextStyle(
                      fontWeight: FontWeight.w700,
                      fontSize: 16,
                      color: TaifTokens.brandPrimary)),
            ],
          ),
          const SizedBox(height: 6),
          Row(
            children: [
              Text('SKU: ${resolved.sku}',
                  style:
                      const TextStyle(fontSize: 12, color: TaifTokens.muted)),
              const SizedBox(width: 12),
              Text(stockText,
                  style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                      color:
                          resolved.inStock ? TaifTokens.ok : TaifTokens.err)),
            ],
          ),
        ],
      ),
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

/// Fullscreen swipe + pinch-zoom gallery (Phase 2, §18). Opened by tapping the
/// inline gallery. Owns its own [PageController] so it can start on the image
/// the buyer was already viewing and dispose the controller on close.
class _GalleryZoomDialog extends StatefulWidget {
  const _GalleryZoomDialog({required this.images, required this.initialIndex});
  final List<String> images;
  final int initialIndex;
  @override
  State<_GalleryZoomDialog> createState() => _GalleryZoomDialogState();
}

class _GalleryZoomDialogState extends State<_GalleryZoomDialog> {
  late final PageController _ctrl =
      PageController(initialPage: widget.initialIndex);
  late int _index = widget.initialIndex;

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final size = MediaQuery.of(context).size;
    return Dialog(
      backgroundColor: Colors.black,
      insetPadding: const EdgeInsets.all(12),
      child: Stack(children: [
        PageView.builder(
          controller: _ctrl,
          itemCount: widget.images.length,
          onPageChanged: (i) => setState(() => _index = i),
          itemBuilder: (_, i) => InteractiveViewer(
            minScale: 0.8,
            maxScale: 4,
            child: Center(
              child: AppNetworkImage(
                url: widget.images[i],
                width: size.width,
                height: size.height * 0.7,
                fit: BoxFit.contain,
                fallbackIcon: Icons.image_not_supported_outlined,
              ),
            ),
          ),
        ),
        Positioned(
          top: 4,
          right: 4,
          child: IconButton(
            icon: const Icon(Icons.close, color: Colors.white),
            onPressed: () => Navigator.pop(context),
          ),
        ),
        if (widget.images.length > 1)
          Positioned(
            bottom: 12,
            left: 0,
            right: 0,
            child: Center(
              child: Text('${_index + 1} / ${widget.images.length}',
                  style: const TextStyle(
                      color: Colors.white,
                      fontSize: 12,
                      fontWeight: FontWeight.w600)),
            ),
          ),
      ]),
    );
  }
}
