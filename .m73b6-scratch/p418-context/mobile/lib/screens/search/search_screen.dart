import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import '../../core/theme.dart';
import '../../models/models.dart';
import '../../providers/providers.dart';
import '../../services/api_service.dart';
import '../../widgets/app_widgets.dart';
import '../../widgets/common_widgets.dart';

class SearchScreen extends ConsumerStatefulWidget {
  const SearchScreen({super.key});
  @override
  ConsumerState<SearchScreen> createState() => _SearchScreenState();
}

class _SearchScreenState extends ConsumerState<SearchScreen> {
  final _ctrl = TextEditingController();
  Timer? _debounce;
  String? _selectedCategory;
  String? _selectedBrand;
  String? _searchError;

  /// PHASE COS-15: dynamic attribute facet filters
  final Map<String, String> _attrFilters = {};

  // ── Pagination (Phase 2) ──
  // The search API is offset/limit based and returns an accurate `total`, so
  // results page in with a "Load more" footer rather than one fixed 30-item
  // fetch. `_items` accumulates across pages; `_facets`/`_total` track the
  // latest response.
  static const int _pageSize = 24;
  List<Product> _items = [];
  List<FacetEntry> _facets = [];
  int _total = 0;
  int _offset = 0;
  bool _searching = true;
  bool _loadingMore = false;

  void _onChanged(String q) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 300), () => _search(q));
  }

  Future<void> _search(String q, {bool append = false}) async {
    ref.read(searchQueryProvider.notifier).state = q;
    if (append) {
      setState(() => _loadingMore = true);
    } else {
      setState(() {
        _searching = true;
        _searchError = null;
      });
    }
    final offset = append ? _offset : 0;
    try {
      final result = await ref.read(apiServiceProvider).search(
          q: q.isEmpty ? null : q,
          categoryId: _selectedCategory,
          brandId: _selectedBrand,
          limit: _pageSize,
          offset: offset);
      if (!mounted) return;
      setState(() {
        _facets = result.facets;
        _total = result.total;
        _items = append ? [..._items, ...result.products] : result.products;
        _offset = _items.length;
        _searching = false;
        _loadingMore = false;
        _searchError = null;
      });
      ref.read(searchResultsProvider.notifier).state = result;
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _searching = false;
        _loadingMore = false;
        // Route through errorMessage so a failed page never prints a raw
        // Dio/socket string (spec §40).
        _searchError = ApiService.errorMessage(e);
      });
    }
  }

  Future<void> _addToCart(Product p) async {
    // Canonical products (no storeId) require an explicit offer/seller
    // selection — the backend will reject a bare add. Navigate to the PDP
    // where the buyer can pick a merchant offer.
    if (p.storeId.isEmpty) {
      context.push('/products/${p.id}');
      return;
    }
    try {
      // The cart line references a variant, not a product; the service resolves
      // the default one and buys at the MOQ (A5-12 — this used to post `p.id`
      // as the variantId, which the server always rejected).
      await ref.read(apiServiceProvider).addProductToCart(p);
      ref.invalidate(cartProvider);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
            content: Text('✓ Added to cart'), duration: Duration(seconds: 2)));
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(ApiService.errorMessage(e))));
      }
    }
  }

  /// Brand filter bottom sheet. Price / in-stock / verified-seller / sort are
  /// intentionally absent: the search endpoint does not accept them yet
  /// (BG-3 — tracked in docs/production/BACKEND-EXTENSION-SPEC.md). Only real,
  /// server-supported filters are surfaced so no control silently no-ops.
  Future<void> _openFilters() async {
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (_) => _FilterSheet(
        selectedBrand: _selectedBrand,
        onApply: (brandId) {
          setState(() => _selectedBrand = brandId);
          _search(_ctrl.text);
        },
      ),
    );
  }

  @override
  void initState() {
    super.initState();
    // Consume a category handed off from the Home rail (see
    // searchCategoryProvider). Cleared after the frame so re-selecting the
    // same category from Home still registers as a change.
    final initialCat = ref.read(searchCategoryProvider);
    if (initialCat != null) {
      _selectedCategory = initialCat;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) ref.read(searchCategoryProvider.notifier).state = null;
      });
    }
    // Defer the first search a frame so its synchronous setState is safe.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _search('');
    });
  }

  @override
  void dispose() {
    _ctrl.dispose();
    _debounce?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final cats = ref.watch(categoriesProvider);
    // Home → Search category hand-off. The shell keeps this branch alive, so
    // initState does not re-run on a tab switch; listening here applies the
    // category whenever Home sets it.
    ref.listen(searchCategoryProvider, (prev, next) {
      if (next == null || next == _selectedCategory) return;
      setState(() => _selectedCategory = next);
      _search(_ctrl.text);
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) ref.read(searchCategoryProvider.notifier).state = null;
      });
    });
    final activeFilters =
        (_selectedBrand != null ? 1 : 0) + _attrFilters.length;
    final hasMore = !_searching && _items.length < _total;
    return Scaffold(
        appBar: AppBar(
          title: const Text('Search'),
          actions: [
            IconButton(
              tooltip: 'Filters',
              icon: Badge(
                isLabelVisible: activeFilters > 0,
                label: Text('$activeFilters'),
                child: const Icon(Icons.tune),
              ),
              onPressed: _openFilters,
            ),
            IconButton(
              icon: const Icon(Icons.qr_code_scanner),
              tooltip: 'Scan barcode',
              onPressed: _scanBarcode,
            ),
          ],
        ),
        body: Column(children: [
          Padding(
            padding: const EdgeInsets.all(16),
            child: TextField(
                controller: _ctrl,
                onChanged: _onChanged,
                decoration: InputDecoration(
                    hintText: 'Search products, SKU, barcode...',
                    prefixIcon: const Icon(Icons.search),
                    border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(10)))),
          ),
          cats.when(
              data: (list) => SizedBox(
                  height: 40,
                  child: ListView(scrollDirection: Axis.horizontal, children: [
                    _chip('All', _selectedCategory == null, () {
                      setState(() => _selectedCategory = null);
                      _search(_ctrl.text);
                    }),
                    ...list.map(
                        (c) => _chip(c.name, _selectedCategory == c.id, () {
                              setState(() => _selectedCategory = c.id);
                              _search(_ctrl.text);
                            })),
                  ])),
              loading: () => const SizedBox.shrink(),
              error: (_, __) => const SizedBox.shrink()),
          // PHASE COS-15: Dynamic attribute facets
          if (_facets.isNotEmpty)
            SizedBox(
              height: 36,
              child: ListView(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(horizontal: 16),
                children: _facets
                    .expand((facet) => [
                          for (final v in facet.values)
                            Padding(
                              padding: const EdgeInsets.only(right: 6),
                              child: FilterChip(
                                label: Text('${facet.label}: ${v.value}'),
                                selected: _attrFilters[facet.code] == v.value,
                                onSelected: (sel) {
                                  setState(() {
                                    if (sel) {
                                      _attrFilters[facet.code] = v.value;
                                    } else {
                                      _attrFilters.remove(facet.code);
                                    }
                                  });
                                  _search(_ctrl.text);
                                },
                                selectedColor:
                                    TaifTokens.brandPrimary.withAlpha(30),
                              ),
                            ),
                        ])
                    .toList(),
              ),
            ),
          const SizedBox(height: 8),
          if (_searchError != null)
            ErrorBanner(
                message: _searchError!, onRetry: () => _search(_ctrl.text)),
          Expanded(child: _resultsArea(hasMore)),
        ]));
  }

  Widget _resultsArea(bool hasMore) {
    if (_searching) {
      return Padding(
        padding: const EdgeInsets.all(16),
        child: GridView.count(
          crossAxisCount: 2,
          mainAxisSpacing: 12,
          crossAxisSpacing: 12,
          children: const [
            AppSkeletonProductCard(),
            AppSkeletonProductCard(),
            AppSkeletonProductCard(),
            AppSkeletonProductCard(),
            AppSkeletonProductCard(),
            AppSkeletonProductCard(),
          ],
        ),
      );
    }
    if (_items.isEmpty) {
      return const EmptyState(
        title: 'No products found',
        description: 'Try a different search term or clear your filters.',
        icon: Icons.search_off,
      );
    }
    return Column(children: [
      Expanded(
        child: GridView.builder(
          padding: const EdgeInsets.all(16),
          gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: 2,
            mainAxisSpacing: 8,
            crossAxisSpacing: 8,
            // Cards carry price and seller as well; at the default 1.0 the
            // content overflowed the tile.
            childAspectRatio: 0.62,
          ),
          itemCount: _items.length,
          itemBuilder: (_, i) {
            final p = _items[i];
            return ProductCard(
                product: p,
                onTap: () => context.push('/products/${p.id}'),
                onAddToCart: () => _addToCart(p));
          },
        ),
      ),
      if (hasMore)
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 4, 16, 12),
          child: _loadingMore
              ? const Center(child: CircularProgressIndicator())
              : OutlinedButton.icon(
                  onPressed: () => _search(_ctrl.text, append: true),
                  icon: const Icon(Icons.expand_more),
                  label: Text('Load more (${_items.length} of $_total)'),
                ),
        ),
    ]);
  }

  Future<void> _scanBarcode() async {
    // Navigate to scanner — result comes back as search query
    final barcode = await Navigator.of(context).push<String>(
      MaterialPageRoute(
        builder: (_) => _BarcodeScanner(),
      ),
    );
    if (barcode != null && mounted) {
      _ctrl.text = barcode;
      _search(barcode);
    }
  }

  Widget _chip(String label, bool selected, VoidCallback onTap) => Padding(
      padding: const EdgeInsets.only(right: 8),
      child: FilterChip(
          label: Text(label),
          selected: selected,
          onSelected: (_) => onTap(),
          selectedColor: TaifTokens.brandPrimary.withAlpha(30)));
}

/// Brand filter sheet (Phase 2). Single-select brand only — the search endpoint
/// does not yet accept price / in-stock / verified-seller / sort, so those are
/// deliberately omitted rather than rendered as controls that silently do
/// nothing (BG-3, docs/production/BACKEND-EXTENSION-SPEC.md).
class _FilterSheet extends ConsumerStatefulWidget {
  const _FilterSheet({required this.selectedBrand, required this.onApply});
  final String? selectedBrand;
  final ValueChanged<String?> onApply;
  @override
  ConsumerState<_FilterSheet> createState() => _FilterSheetState();
}

class _FilterSheetState extends ConsumerState<_FilterSheet> {
  late String? _brand = widget.selectedBrand;

  @override
  Widget build(BuildContext context) {
    final brands = ref.watch(brandsProvider);
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(children: [
              const Text('Filters',
                  style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
              const Spacer(),
              IconButton(
                icon: const Icon(Icons.close),
                onPressed: () => Navigator.pop(context),
              ),
            ]),
            const Divider(height: 1),
            const SizedBox(height: 12),
            const Text('Brand',
                style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
            const SizedBox(height: 10),
            Flexible(
              child: brands.when(
                data: (list) => list.isEmpty
                    ? const Padding(
                        padding: EdgeInsets.symmetric(vertical: 12),
                        child: Text('No brands available yet',
                            style: TextStyle(color: TaifTokens.muted)),
                      )
                    : SingleChildScrollView(
                        child: Wrap(
                          spacing: 8,
                          runSpacing: 8,
                          children: [
                            ChoiceChip(
                              label: const Text('All brands'),
                              selected: _brand == null,
                              onSelected: (_) => setState(() => _brand = null),
                              selectedColor:
                                  TaifTokens.brandPrimary.withAlpha(30),
                            ),
                            ...list.map((b) => ChoiceChip(
                                  label: Text(b.name),
                                  selected: _brand == b.id,
                                  onSelected: (_) =>
                                      setState(() => _brand = b.id),
                                  selectedColor:
                                      TaifTokens.brandPrimary.withAlpha(30),
                                )),
                          ],
                        ),
                      ),
                loading: () => const Padding(
                  padding: EdgeInsets.symmetric(vertical: 24),
                  child: Center(child: CircularProgressIndicator()),
                ),
                error: (_, __) => const Padding(
                  padding: EdgeInsets.symmetric(vertical: 12),
                  child: Text('Could not load brands',
                      style: TextStyle(color: TaifTokens.err)),
                ),
              ),
            ),
            const SizedBox(height: 16),
            Row(children: [
              Expanded(
                child: OutlinedButton(
                  onPressed: () => setState(() => _brand = null),
                  child: const Text('Clear'),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: ElevatedButton(
                  onPressed: () {
                    widget.onApply(_brand);
                    Navigator.pop(context);
                  },
                  child: const Text('Apply'),
                ),
              ),
            ]),
          ],
        ),
      ),
    );
  }
}

/// Barcode scanner screen using mobile_scanner.
class _BarcodeScanner extends StatefulWidget {
  @override
  State<_BarcodeScanner> createState() => _BarcodeScannerState();
}

class _BarcodeScannerState extends State<_BarcodeScanner> {
  final MobileScannerController _controller = MobileScannerController(
    detectionTimeoutMs: 500,
    formats: const [
      BarcodeFormat.ean13,
      BarcodeFormat.ean8,
      BarcodeFormat.code128,
      BarcodeFormat.qrCode,
    ],
  );
  bool _handled = false;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Scan Barcode'),
        actions: [
          IconButton(
            icon: const Icon(Icons.flash_on),
            onPressed: () => _controller.toggleTorch(),
            tooltip: 'Toggle flash',
          ),
        ],
      ),
      body: Stack(children: [
        MobileScanner(
          controller: _controller,
          onDetect: (capture) {
            if (_handled) return;
            final barcodes = capture.barcodes;
            if (barcodes.isEmpty) return;
            final code = barcodes.first.rawValue;
            if (code == null || code.isEmpty) return;
            _handled = true;
            Navigator.of(context).pop(code);
          },
          errorBuilder: (context, error, child) {
            return Center(
              child: Column(mainAxisSize: MainAxisSize.min, children: [
                const Icon(Icons.error_outline, size: 48, color: Colors.red),
                const SizedBox(height: 12),
                Text('Camera error: $error',
                    style: const TextStyle(color: Colors.white),
                    textAlign: TextAlign.center),
              ]),
            );
          },
        ),
        // Scanner overlay frame
        Center(
          child: Container(
            width: 250,
            height: 250,
            decoration: BoxDecoration(
              border: Border.all(color: Colors.white, width: 3),
              borderRadius: BorderRadius.circular(12),
            ),
          ),
        ),
      ]),
    );
  }
}
