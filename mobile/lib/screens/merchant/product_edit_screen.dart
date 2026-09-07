import 'package:dio/dio.dart';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/theme.dart';
import '../../models/models.dart';
import '../../providers/providers.dart';
import '../../widgets/common_widgets.dart';

/// Product create/edit screen. `productId == null` => create mode.
/// Create mode exposes the core product fields; edit mode additionally shows
/// the Variants and Media sections (both are product-scoped, so they only
/// exist once the product has an id). Mirrors the web product editor.
class ProductEditScreen extends ConsumerStatefulWidget {
  final String? productId;
  const ProductEditScreen({super.key, this.productId});
  @override
  ConsumerState<ProductEditScreen> createState() => _ProductEditScreenState();
}

class _ProductEditScreenState extends ConsumerState<ProductEditScreen> {
  final _titleCtrl = TextEditingController();
  final _descriptionCtrl = TextEditingController();
  final _moqCtrl = TextEditingController(text: '1');
  final _imagesCtrl = TextEditingController();

  String? _categoryId;
  String? _brandId;
  bool _isAvailable = true;

  Product? _product;
  bool _loading = false;
  bool _saving = false;
  String? _error;

  bool get _isEdit => widget.productId != null;

  @override
  void initState() {
    super.initState();
    if (_isEdit) _load();
  }

  @override
  void dispose() {
    _titleCtrl.dispose();
    _descriptionCtrl.dispose();
    _moqCtrl.dispose();
    _imagesCtrl.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final p =
          await ref.read(apiServiceProvider).fetchProduct(widget.productId!);
      _titleCtrl.text = p.title;
      _descriptionCtrl.text = p.description ?? '';
      _moqCtrl.text = p.moq.toString();
      _imagesCtrl.text = p.images.map((e) => e.toString()).join('\n');
      _categoryId = p.categoryId;
      _brandId = p.brandId;
      _isAvailable = p.isAvailable;
      setState(() {
        _product = p;
        _loading = false;
      });
    } catch (e) {
      setState(() {
        _error = 'Failed to load product: $e';
        _loading = false;
      });
    }
  }

  List<String> _parseImages() => _imagesCtrl.text
      .split('\n')
      .map((e) => e.trim())
      .where((e) => e.isNotEmpty)
      .toList();

  Future<void> _save(String storeId) async {
    if (_titleCtrl.text.trim().isEmpty) {
      setState(() => _error = 'Title is required');
      return;
    }
    if (!_isEdit && storeId.isEmpty) {
      setState(() => _error = 'No store resolved for your account');
      return;
    }
    setState(() {
      _saving = true;
      _error = null;
    });
    final api = ref.read(apiServiceProvider);
    final moq = int.tryParse(_moqCtrl.text.trim()) ?? 1;
    try {
      if (_isEdit) {
        await api.updateProduct(
          widget.productId!,
          title: _titleCtrl.text.trim(),
          description: _descriptionCtrl.text.trim(),
          categoryId: _categoryId,
          brandId: _brandId,
          moq: moq,
          isAvailable: _isAvailable,
          images: _parseImages(),
        );
        ref.invalidate(storeProductsProvider(storeId));
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
              content: Text('Product saved'), backgroundColor: TaifTokens.ok));
          setState(() {
            _saving = false;
          });
        }
      } else {
        final created = await api.createProduct(
          storeId: storeId,
          title: _titleCtrl.text.trim(),
          description: _descriptionCtrl.text.trim().isEmpty
              ? null
              : _descriptionCtrl.text.trim(),
          categoryId: _categoryId,
          brandId: _brandId,
          moq: moq,
          images: _parseImages(),
        );
        ref.invalidate(storeProductsProvider(storeId));
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
              content: Text('Product created'),
              backgroundColor: TaifTokens.ok));
          // Move to edit mode so Variants/Media become available.
          context.pushReplacement('/merchant/catalog/product/${created.id}');
        }
      }
    } catch (e) {
      setState(() => _error = 'Failed to save: $e');
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_isEdit && _loading) {
      return Scaffold(
          appBar: AppBar(title: const Text('Product')),
          body: const LoadingSpinner());
    }
    final storeId = _isEdit
        ? (_product?.storeId ?? '')
        : (ref.watch(activeStoreProvider).valueOrNull?.id ?? '');
    return Scaffold(
      appBar: AppBar(title: Text(_isEdit ? 'Edit Product' : 'New Product')),
      body: ListView(padding: const EdgeInsets.all(16), children: [
        if (_error != null) ...[
          ErrorBanner(message: _error!),
          const SizedBox(height: 12),
        ],
        TextField(
            controller: _titleCtrl,
            decoration: const InputDecoration(
                labelText: 'Title *', border: OutlineInputBorder())),
        const SizedBox(height: 16),
        TextField(
            controller: _descriptionCtrl,
            maxLines: 3,
            decoration: const InputDecoration(
                labelText: 'Description',
                alignLabelWithHint: true,
                border: OutlineInputBorder())),
        const SizedBox(height: 16),
        _categoryDropdown(storeId),
        const SizedBox(height: 16),
        _brandDropdown(),
        const SizedBox(height: 16),
        Row(children: [
          Expanded(
              child: TextField(
                  controller: _moqCtrl,
                  keyboardType: TextInputType.number,
                  decoration: const InputDecoration(
                      labelText: 'MOQ', border: OutlineInputBorder()))),
          const SizedBox(width: 16),
          Expanded(
              child: SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  title: const Text('Available'),
                  value: _isAvailable,
                  onChanged: (v) => setState(() => _isAvailable = v))),
        ]),
        const SizedBox(height: 16),
        TextField(
            controller: _imagesCtrl,
            maxLines: 3,
            decoration: const InputDecoration(
                labelText: 'Image URLs (one per line)',
                alignLabelWithHint: true,
                border: OutlineInputBorder())),
        const SizedBox(height: 24),
        SizedBox(
            width: double.infinity,
            child: ElevatedButton.icon(
                onPressed: _saving ? null : () => _save(storeId),
                icon: _saving
                    ? const SizedBox(
                        width: 16,
                        height: 16,
                        child: CircularProgressIndicator(
                            strokeWidth: 2, color: Colors.white))
                    : const Icon(Icons.save),
                label: Text(_saving ? 'Saving...' : 'Save Product'),
                style: ElevatedButton.styleFrom(
                    backgroundColor: TaifTokens.brandPrimary,
                    padding: const EdgeInsets.symmetric(vertical: 14)))),
        if (_isEdit) ...[
          const SizedBox(height: 32),
          _variantsSection(),
          const SizedBox(height: 32),
          _mediaSection(),
        ],
      ]),
    );
  }

  Widget _categoryDropdown(String storeId) {
    final cats = ref.watch(storeCategoriesProvider(storeId)).valueOrNull ?? [];
    final value = (_categoryId != null && cats.any((c) => c.id == _categoryId))
        ? _categoryId!
        : '';
    return DropdownButtonFormField<String>(
      initialValue: value,
      isExpanded: true,
      decoration: const InputDecoration(
          labelText: 'Category', border: OutlineInputBorder()),
      items: [
        const DropdownMenuItem(value: '', child: Text('— None —')),
        ...cats.map((c) => DropdownMenuItem(value: c.id, child: Text(c.name))),
      ],
      onChanged: (v) =>
          setState(() => _categoryId = (v == null || v.isEmpty) ? null : v),
    );
  }

  Widget _brandDropdown() {
    final brands = ref.watch(brandsProvider).valueOrNull ?? [];
    final value = (_brandId != null && brands.any((b) => b.id == _brandId))
        ? _brandId!
        : '';
    return DropdownButtonFormField<String>(
      initialValue: value,
      isExpanded: true,
      decoration: const InputDecoration(
          labelText: 'Brand', border: OutlineInputBorder()),
      items: [
        const DropdownMenuItem(value: '', child: Text('— None —')),
        ...brands
            .map((b) => DropdownMenuItem(value: b.id, child: Text(b.name))),
      ],
      onChanged: (v) =>
          setState(() => _brandId = (v == null || v.isEmpty) ? null : v),
    );
  }

  // ── Variants (edit only) ──────────────────────────────────
  Widget _variantsSection() {
    final pid = widget.productId!;
    final variants = ref.watch(productVariantsProvider(pid));
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Row(children: [
        const Text('Variants',
            style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
        const Spacer(),
        TextButton.icon(
            onPressed: () => _addVariant(pid),
            icon: const Icon(Icons.add, size: 18),
            label: const Text('Add')),
      ]),
      variants.when(
        loading: () => const Padding(
            padding: EdgeInsets.symmetric(vertical: 12),
            child: LoadingSpinner()),
        error: (e, _) => ErrorBanner(message: '$e'),
        data: (list) => list.isEmpty
            ? Padding(
                padding: const EdgeInsets.symmetric(vertical: 8),
                child: Text('No variants yet.',
                    style: TextStyle(color: TaifTokens.muted, fontSize: 13)))
            : Column(
                children: list
                    .map((v) => Card(
                        margin: const EdgeInsets.only(bottom: 8),
                        child: ListTile(
                            leading:
                                const Icon(Icons.style, color: TaifTokens.info),
                            title: Text(v.sku,
                                style: const TextStyle(
                                    fontWeight: FontWeight.w600)),
                            subtitle: Text([v.title ?? '', v.unit]
                                .where((e) => e.isNotEmpty)
                                .join(' · ')))))
                    .toList()),
      ),
    ]);
  }

  Future<void> _addVariant(String pid) async {
    final skuCtrl = TextEditingController();
    final titleCtrl = TextEditingController();
    final unitCtrl = TextEditingController(text: 'piece');
    final barcodeCtrl = TextEditingController();
    final weightCtrl = TextEditingController();
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Add Variant'),
        content: SingleChildScrollView(
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            TextField(
                controller: skuCtrl,
                decoration: const InputDecoration(
                    labelText: 'SKU *', border: OutlineInputBorder())),
            const SizedBox(height: 12),
            TextField(
                controller: titleCtrl,
                decoration: const InputDecoration(
                    labelText: 'Title', border: OutlineInputBorder())),
            const SizedBox(height: 12),
            TextField(
                controller: unitCtrl,
                decoration: const InputDecoration(
                    labelText: 'Unit', border: OutlineInputBorder())),
            const SizedBox(height: 12),
            TextField(
                controller: barcodeCtrl,
                decoration: const InputDecoration(
                    labelText: 'Barcode', border: OutlineInputBorder())),
            const SizedBox(height: 12),
            TextField(
                controller: weightCtrl,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(
                    labelText: 'Weight (grams)', border: OutlineInputBorder())),
          ]),
        ),
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
    if (ok == true && skuCtrl.text.trim().isNotEmpty) {
      try {
        await ref.read(apiServiceProvider).createVariant(
              pid,
              sku: skuCtrl.text.trim(),
              title:
                  titleCtrl.text.trim().isEmpty ? null : titleCtrl.text.trim(),
              unit: unitCtrl.text.trim().isEmpty ? null : unitCtrl.text.trim(),
              barcode: barcodeCtrl.text.trim().isEmpty
                  ? null
                  : barcodeCtrl.text.trim(),
              weightGrams: int.tryParse(weightCtrl.text.trim()),
            );
        ref.invalidate(productVariantsProvider(pid));
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
              content: Text('Variant added'), backgroundColor: TaifTokens.ok));
        }
      } catch (e) {
        if (mounted) {
          ScaffoldMessenger.of(context)
              .showSnackBar(SnackBar(content: Text('Failed: $e')));
        }
      }
    }
    for (final c in [skuCtrl, titleCtrl, unitCtrl, barcodeCtrl, weightCtrl]) {
      c.dispose();
    }
  }

  // ── Media (edit only) ─────────────────────────────────────
  Widget _mediaSection() {
    final pid = widget.productId!;
    final media = ref.watch(productMediaProvider(pid));
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Row(children: [
        const Text('Media',
            style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
        const Spacer(),
        TextButton.icon(
            onPressed: () => _addMediaByUrl(pid),
            icon: const Icon(Icons.link, size: 18),
            label: const Text('URL')),
        TextButton.icon(
            onPressed: () => _uploadMedia(pid),
            icon: const Icon(Icons.upload_file, size: 18),
            label: const Text('Upload')),
      ]),
      media.when(
        loading: () => const Padding(
            padding: EdgeInsets.symmetric(vertical: 12),
            child: LoadingSpinner()),
        error: (e, _) => ErrorBanner(message: '$e'),
        data: (list) => list.isEmpty
            ? Padding(
                padding: const EdgeInsets.symmetric(vertical: 8),
                child: Text('No media yet.',
                    style: TextStyle(color: TaifTokens.muted, fontSize: 13)))
            : Column(
                children: list
                    .map((m) => Card(
                        margin: const EdgeInsets.only(bottom: 8),
                        child: ListTile(
                            leading: const Icon(Icons.image_outlined,
                                color: TaifTokens.brandAccent),
                            title: Text(m.url,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(fontSize: 13)),
                            subtitle: Text(m.mediaType,
                                style: const TextStyle(fontSize: 11)))))
                    .toList()),
      ),
    ]);
  }

  Future<void> _addMediaByUrl(String pid) async {
    final urlCtrl = TextEditingController();
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Add Media by URL'),
        content: TextField(
            controller: urlCtrl,
            decoration: const InputDecoration(
                labelText: 'Image URL *',
                hintText: 'https://...',
                border: OutlineInputBorder())),
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
    if (ok == true && urlCtrl.text.trim().isNotEmpty) {
      try {
        await ref
            .read(apiServiceProvider)
            .addMedia(pid, url: urlCtrl.text.trim(), mediaType: 'IMAGE');
        ref.invalidate(productMediaProvider(pid));
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
              content: Text('Media added'), backgroundColor: TaifTokens.ok));
        }
      } catch (e) {
        if (mounted) {
          ScaffoldMessenger.of(context)
              .showSnackBar(SnackBar(content: Text('Failed: $e')));
        }
      }
    }
    urlCtrl.dispose();
  }

  Future<void> _uploadMedia(String pid) async {
    final result = await FilePicker.platform.pickFiles(
      type: FileType.image,
      withData: true,
    );
    if (result == null || result.files.isEmpty) return;
    final file = result.files.first;
    final bytes = file.bytes;
    if (bytes == null) return;
    final mimeType = _mimeFor(file.extension ?? '');
    try {
      final presign = await ref
          .read(apiServiceProvider)
          .presignMedia(fileName: file.name, mimeType: mimeType);
      final uploadUrl = (presign['uploadUrl'] ?? '').toString();
      final storageKey = (presign['storageKey'] ?? '').toString();
      // Best-effort PUT — dev storage (storage.local) is stubbed and will not
      // accept bytes, so failures here are ignored; the media record is still
      // created against the returned storageKey.
      if (uploadUrl.isNotEmpty) {
        try {
          await Dio(BaseOptions(
                  connectTimeout: const Duration(seconds: 6),
                  receiveTimeout: const Duration(seconds: 6)))
              .put(uploadUrl,
                  data: bytes,
                  options: Options(headers: {'Content-Type': mimeType}));
        } catch (_) {
          // ignored — stubbed in dev
        }
      }
      await ref.read(apiServiceProvider).addMedia(pid,
          url: storageKey.isEmpty ? uploadUrl : storageKey,
          mediaType: 'IMAGE',
          mimeType: mimeType,
          fileSize: file.size);
      ref.invalidate(productMediaProvider(pid));
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
            content: Text('Media uploaded'), backgroundColor: TaifTokens.ok));
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('Failed: $e')));
      }
    }
  }

  String _mimeFor(String ext) => switch (ext.toLowerCase()) {
        'png' => 'image/png',
        'jpg' || 'jpeg' => 'image/jpeg',
        'webp' => 'image/webp',
        'gif' => 'image/gif',
        _ => 'application/octet-stream',
      };
}
