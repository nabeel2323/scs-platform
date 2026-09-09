import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/theme.dart';
import '../../models/models.dart';
import '../../providers/providers.dart';
import '../../widgets/common_widgets.dart';

/// Merchant customers — buyers who have ordered from the store, with revenue
/// and order-count stats. Mirrors the web /merchant/customers page.
class MerchantCustomersScreen extends ConsumerStatefulWidget {
  const MerchantCustomersScreen({super.key});
  @override
  ConsumerState<MerchantCustomersScreen> createState() =>
      _MerchantCustomersScreenState();
}

class _MerchantCustomersScreenState
    extends ConsumerState<MerchantCustomersScreen> {
  String _search = '';
  String _sortBy = 'recent';

  @override
  Widget build(BuildContext context) {
    final customers = ref.watch(merchantCustomersProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Customers'), actions: [
        IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: () => ref.invalidate(merchantCustomersProvider)),
      ]),
      body: Column(children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
          child: Row(children: [
            Expanded(
              child: TextField(
                onChanged: (v) => setState(() => _search = v),
                decoration: const InputDecoration(
                    hintText: 'Search by name or phone...',
                    prefixIcon: Icon(Icons.search),
                    isDense: true,
                    border: OutlineInputBorder()),
              ),
            ),
            const SizedBox(width: 12),
            DropdownButton<String>(
              value: _sortBy,
              underline: const SizedBox.shrink(),
              items: const [
                DropdownMenuItem(value: 'recent', child: Text('Recent')),
                DropdownMenuItem(value: 'total', child: Text('Top Spent')),
                DropdownMenuItem(value: 'orders', child: Text('Most Orders')),
              ],
              onChanged: (v) {
                if (v != null) setState(() => _sortBy = v);
              },
            ),
          ]),
        ),
        Expanded(
          child: customers.when(
            loading: () => const LoadingSpinner(),
            error: (e, _) => EmptyState(
                title: 'Error',
                description: '$e',
                onAction: () => ref.invalidate(merchantCustomersProvider)),
            data: (list) {
              final filtered = _applyFilter(list);
              if (filtered.isEmpty) {
                return EmptyState(
                    title: _search.isEmpty
                        ? 'No customers yet'
                        : 'No customers match your search',
                    description: _search.isEmpty
                        ? 'Customers appear here once buyers order from your store'
                        : 'Try a different search term',
                    icon: Icons.people_outline);
              }
              return ListView(padding: const EdgeInsets.all(16), children: [
                _statsGrid(filtered),
                const SizedBox(height: 16),
                ...filtered.map(_customerCard),
              ]);
            },
          ),
        ),
      ]),
    );
  }

  List<CustomerSummary> _applyFilter(List<CustomerSummary> list) {
    final filtered = list.where((c) {
      if (_search.trim().isEmpty) return true;
      final q = _search.trim().toLowerCase();
      return (c.buyerName?.toLowerCase().contains(q) ?? false) ||
          (c.buyerPhone?.contains(_search.trim()) ?? false) ||
          (c.buyerEmail?.toLowerCase().contains(q) ?? false);
    }).toList();
    filtered.sort((a, b) {
      switch (_sortBy) {
        case 'total':
          return b.totalSpentMinor.compareTo(a.totalSpentMinor);
        case 'orders':
          return b.orderCount.compareTo(a.orderCount);
        default:
          final at =
              DateTime.tryParse(a.lastOrderAt ?? '')?.millisecondsSinceEpoch ??
                  0;
          final bt =
              DateTime.tryParse(b.lastOrderAt ?? '')?.millisecondsSinceEpoch ??
                  0;
          return bt.compareTo(at);
      }
    });
    return filtered;
  }

  Widget _statsGrid(List<CustomerSummary> list) {
    final revenue = list.fold<int>(0, (s, c) => s + c.totalSpentMinor);
    final orders = list.fold<int>(0, (s, c) => s + c.orderCount);
    final avg = orders > 0 ? (revenue / orders).round() : 0;
    return GridView.count(
      crossAxisCount: 2,
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      mainAxisSpacing: 12,
      crossAxisSpacing: 12,
      childAspectRatio: 1.6,
      children: [
        _statCard('Customers', '${list.length}'),
        _statCard('Revenue', formatMinor(revenue)),
        _statCard('Orders', '$orders'),
        _statCard('Avg Order', formatMinor(avg)),
      ],
    );
  }

  Widget _statCard(String label, String value) => Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
          color: TaifTokens.surface,
          borderRadius: BorderRadius.circular(TaifTokens.radiusMd),
          border: Border.all(color: TaifTokens.line)),
      child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text(label.toUpperCase(),
                style: const TextStyle(
                    fontSize: 10,
                    fontWeight: FontWeight.w600,
                    color: TaifTokens.muted,
                    letterSpacing: 0.4)),
            const SizedBox(height: 6),
            Text(value,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style:
                    const TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
          ]));

  Widget _customerCard(CustomerSummary c) {
    final avg =
        c.orderCount > 0 ? (c.totalSpentMinor / c.orderCount).round() : 0;
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: ListTile(
        leading: CircleAvatar(
            backgroundColor: TaifTokens.brandPrimary.withValues(alpha: 0.15),
            child: Text(
                (c.buyerName?.isNotEmpty ?? false)
                    ? c.buyerName!.substring(0, 1).toUpperCase()
                    : '?',
                style: const TextStyle(color: TaifTokens.brandPrimary))),
        title: Text(c.buyerName ?? 'Unknown',
            style: const TextStyle(fontWeight: FontWeight.w600)),
        subtitle: Text(
            '${c.buyerPhone ?? '—'} · ${c.orderCount} orders · last ${_fmtDate(c.lastOrderAt)}'),
        trailing: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(formatMinor(c.totalSpentMinor),
                  style: const TextStyle(
                      fontWeight: FontWeight.w700, color: TaifTokens.ok)),
              Text('avg ${formatMinor(avg)}',
                  style:
                      const TextStyle(fontSize: 11, color: TaifTokens.muted)),
            ]),
      ),
    );
  }

  String _fmtDate(String? iso) {
    if (iso == null || iso.isEmpty) return '—';
    final d = DateTime.tryParse(iso);
    if (d == null) return iso.length >= 10 ? iso.substring(0, 10) : iso;
    return '${d.year.toString().padLeft(4, '0')}-'
        '${d.month.toString().padLeft(2, '0')}-'
        '${d.day.toString().padLeft(2, '0')}';
  }
}
