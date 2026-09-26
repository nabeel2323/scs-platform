import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/theme.dart';
import '../../models/models.dart';
import '../../providers/providers.dart';
import '../../services/api_service.dart';
import '../../widgets/common_widgets.dart';

/// Merchant category management — list/create/edit/delete categories scoped to
/// the store. Mirrors the web /merchant/catalog categories tab.
class CategoryManageScreen extends ConsumerWidget {
  const CategoryManageScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final storeAsync = ref.watch(activeStoreProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Categories'), actions: [
        IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: () => ref.invalidate(myStoresProvider)),
      ]),
      floatingActionButton: storeAsync.maybeWhen(
        data: (store) => store == null
            ? null
            : FloatingActionButton.extended(
                onPressed: () => _showDialog(context, ref, store.id, null),
                icon: const Icon(Icons.add),
                label: const Text('New Category'),
                backgroundColor: TaifTokens.brandPrimary,
              ),
        orElse: () => null,
      ),
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
          return _list(context, ref, store.id);
        },
      ),
    );
  }

  Widget _list(BuildContext context, WidgetRef ref, String storeId) {
    final cats = ref.watch(storeCategoriesProvider(storeId));
    return cats.when(
      loading: () => const LoadingSpinner(),
      error: (e, _) => EmptyState(
          title: 'Error',
          description: ApiService.errorMessage(e),
          onAction: () => ref.invalidate(storeCategoriesProvider(storeId))),
      data: (list) => list.isEmpty
          ? const EmptyState(
              title: 'No categories',
              description: 'Tap "New Category" to create one.',
              icon: Icons.category_outlined)
          : ListView.builder(
              padding: const EdgeInsets.all(12),
              itemCount: list.length,
              itemBuilder: (_, i) {
                final c = list[i];
                return Card(
                  margin: const EdgeInsets.only(bottom: 8),
                  child: ListTile(
                    leading: const Icon(Icons.category, color: TaifTokens.warn),
                    title: Text(c.name,
                        style: const TextStyle(fontWeight: FontWeight.w600)),
                    subtitle: c.nameAr != null && c.nameAr!.isNotEmpty
                        ? Text(c.nameAr!)
                        : null,
                    trailing: Row(mainAxisSize: MainAxisSize.min, children: [
                      IconButton(
                          icon: const Icon(Icons.edit_outlined,
                              color: TaifTokens.brandPrimary),
                          onPressed: () =>
                              _showDialog(context, ref, storeId, c)),
                      IconButton(
                          icon: const Icon(Icons.delete_outline,
                              color: TaifTokens.err),
                          onPressed: () =>
                              _confirmDelete(context, ref, storeId, c)),
                    ]),
                  ),
                );
              },
            ),
    );
  }

  Future<void> _showDialog(BuildContext context, WidgetRef ref, String storeId,
      Category? existing) async {
    final nameCtrl = TextEditingController(text: existing?.name ?? '');
    final nameArCtrl = TextEditingController(text: existing?.nameAr ?? '');
    final descCtrl = TextEditingController();
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(existing == null ? 'New Category' : 'Edit Category'),
        content: SingleChildScrollView(
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            TextField(
                controller: nameCtrl,
                decoration: const InputDecoration(
                    labelText: 'Name *', border: OutlineInputBorder())),
            const SizedBox(height: 12),
            TextField(
                controller: nameArCtrl,
                decoration: const InputDecoration(
                    labelText: 'Name (Arabic)', border: OutlineInputBorder())),
            const SizedBox(height: 12),
            TextField(
                controller: descCtrl,
                maxLines: 2,
                decoration: const InputDecoration(
                    labelText: 'Description',
                    alignLabelWithHint: true,
                    border: OutlineInputBorder())),
          ]),
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Cancel')),
          ElevatedButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: Text(existing == null ? 'Create' : 'Save')),
        ],
      ),
    );
    if (ok == true && nameCtrl.text.trim().isNotEmpty) {
      final api = ref.read(apiServiceProvider);
      try {
        if (existing == null) {
          await api.createCategory(
            name: nameCtrl.text.trim(),
            nameAr:
                nameArCtrl.text.trim().isEmpty ? null : nameArCtrl.text.trim(),
            description:
                descCtrl.text.trim().isEmpty ? null : descCtrl.text.trim(),
            storeId: storeId,
          );
        } else {
          await api.updateCategory(
            existing.id,
            name: nameCtrl.text.trim(),
            nameAr:
                nameArCtrl.text.trim().isEmpty ? null : nameArCtrl.text.trim(),
            description:
                descCtrl.text.trim().isEmpty ? null : descCtrl.text.trim(),
          );
        }
        ref.invalidate(storeCategoriesProvider(storeId));
        if (context.mounted) {
          ScaffoldMessenger.of(context).showSnackBar(SnackBar(
              content: Text(
                  existing == null ? 'Category created' : 'Category updated'),
              backgroundColor: TaifTokens.ok));
        }
      } catch (e) {
        if (context.mounted) {
          ScaffoldMessenger.of(context)
              .showSnackBar(SnackBar(content: Text('Failed: $e')));
        }
      }
    }
    for (final c in [nameCtrl, nameArCtrl, descCtrl]) {
      c.dispose();
    }
  }

  Future<void> _confirmDelete(
      BuildContext context, WidgetRef ref, String storeId, Category c) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete category'),
        content: Text('Delete "${c.name}"? This cannot be undone.'),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Cancel')),
          ElevatedButton(
              onPressed: () => Navigator.pop(ctx, true),
              style: ElevatedButton.styleFrom(backgroundColor: TaifTokens.err),
              child: const Text('Delete')),
        ],
      ),
    );
    if (ok != true) return;
    try {
      await ref.read(apiServiceProvider).deleteCategory(c.id);
      ref.invalidate(storeCategoriesProvider(storeId));
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
            content: Text('Category deleted'), backgroundColor: TaifTokens.ok));
      }
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('Failed: $e')));
      }
    }
  }
}
