import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/theme.dart';
import '../../models/models.dart';
import '../../providers/providers.dart';
import '../../services/api_service.dart';
import '../../widgets/app_widgets.dart';
import '../../widgets/common_widgets.dart';
import '../../widgets/trend_chart.dart';

/// Offer detail screen — shows full offer information enriched with analytics,
/// plus lifecycle action buttons (propose, withdraw, update pricing).
///
/// Route: `/merchant/offers/:id`. Receives [offerId] as a path parameter.
class OfferDetailScreen extends ConsumerStatefulWidget {
  final String offerId;
  const OfferDetailScreen({super.key, required this.offerId});
  @override
  ConsumerState<OfferDetailScreen> createState() => _OfferDetailScreenState();
}

class _OfferDetailScreenState extends ConsumerState<OfferDetailScreen> {
  bool _busy = false;
  String _trendGranularity = 'day';
  int _trendDays = 30;
  String _trendMetric = 'revenue';

  @override
  Widget build(BuildContext context) {
    final offerAsync = ref.watch(merchantOfferDetailProvider(widget.offerId));
    final analyticsAsync = ref.watch(merchantOfferAnalyticsProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Offer Detail'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: () {
              ref.invalidate(merchantOfferDetailProvider(widget.offerId));
              ref.invalidate(merchantOfferAnalyticsProvider);
            },
          ),
        ],
      ),
      body: offerAsync.when(
        loading: () => const LoadingSpinner(),
        error: (e, _) => AppErrorState(
          title: 'Could not load offer',
          message: ApiService.errorMessage(e),
          onRetry: () =>
              ref.invalidate(merchantOfferDetailProvider(widget.offerId)),
        ),
        data: (offer) {
          // Find matching analytics row for this offer.
          OfferAnalyticsRow? analytics;
          analyticsAsync.whenData((rows) {
            for (final r in rows) {
              if (r.offerId == offer.id) {
                analytics = r;
                return;
              }
            }
          });

          return RefreshIndicator(
            onRefresh: () async {
              ref.invalidate(merchantOfferDetailProvider(widget.offerId));
              ref.invalidate(merchantOfferAnalyticsProvider);
              await ref
                  .read(merchantOfferDetailProvider(widget.offerId).future);
            },
            child: ListView(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
              children: [
                // Status + product header
                _header(offer, analytics),
                const SizedBox(height: 16),

                // Pricing card
                _pricingCard(offer),
                const SizedBox(height: 12),

                // Commercial terms
                _termsCard(offer),
                const SizedBox(height: 12),

                // Analytics card
                _analyticsCard(offer, analytics),
                const SizedBox(height: 12),

                // Trend chart
                _trendCard(offer),
                const SizedBox(height: 12),

                // Lifecycle metadata
                _lifecycleCard(offer),
                const SizedBox(height: 16),

                // Action buttons
                _actionBar(offer),
              ],
            ),
          );
        },
      ),
    );
  }

  // ── Header ──────────────────────────────────────────────────────

  Widget _header(MerchantOffer offer, OfferAnalyticsRow? analytics) {
    final productName = analytics?.productTitle;
    final variantInfo = analytics?.variantTitle ?? analytics?.variantSku;
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: TaifTokens.surface,
        borderRadius: BorderRadius.circular(TaifTokens.radiusMd),
        border: Border.all(color: TaifTokens.line),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(children: [
            StatusBadge(offer.status),
            const Spacer(),
            if (offer.isAvailable)
              const _AvailabilityTag(available: true)
            else
              const _AvailabilityTag(available: false),
          ]),
          const SizedBox(height: 10),
          Text(
            productName ?? 'Product ${offer.productId.substring(0, 8)}…',
            style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700),
          ),
          if (variantInfo != null) ...[
            const SizedBox(height: 4),
            Text(variantInfo,
                style: const TextStyle(fontSize: 13, color: TaifTokens.muted)),
          ],
          const SizedBox(height: 6),
          Text('ID: ${offer.id}',
              style: const TextStyle(
                  fontSize: 11,
                  color: TaifTokens.muted,
                  fontFamily: 'monospace')),
        ],
      ),
    );
  }

  // ── Pricing ─────────────────────────────────────────────────────

  Widget _pricingCard(MerchantOffer offer) {
    final hasBase = offer.basePriceMinor != null;
    final hasCompare =
        offer.compareAtPriceMinor != null && offer.compareAtPriceMinor! > 0;
    final hasDiscount = hasBase &&
        hasCompare &&
        offer.compareAtPriceMinor! > offer.basePriceMinor!;

    return _sectionCard(
      title: 'PRICING',
      icon: Icons.attach_money,
      children: [
        if (hasBase)
          _row('Base Price', formatMinor(offer.basePriceMinor!, offer.currency),
              valueStyle: const TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.w700,
                  color: TaifTokens.brandPrimary)),
        if (!hasBase)
          _row('Base Price', 'Not set',
              valueStyle:
                  const TextStyle(fontSize: 14, color: TaifTokens.muted)),
        if (hasCompare)
          _row(
            'Compare-at',
            formatMinor(offer.compareAtPriceMinor!, offer.currency),
            valueStyle: TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.w600,
              color: hasDiscount ? TaifTokens.ok : TaifTokens.ink,
              decoration: hasDiscount ? TextDecoration.lineThrough : null,
            ),
          ),
        if (hasDiscount)
          Padding(
            padding: const EdgeInsets.only(top: 4),
            child: Text(
              'Discounted from ${formatMinor(offer.compareAtPriceMinor!, offer.currency)}',
              style: const TextStyle(
                  fontSize: 12,
                  color: TaifTokens.ok,
                  fontStyle: FontStyle.italic),
            ),
          ),
        _row('Currency', offer.currency),
      ],
    );
  }

  // ── Commercial Terms ────────────────────────────────────────────

  Widget _termsCard(MerchantOffer offer) => _sectionCard(
        title: 'COMMERCIAL TERMS',
        icon: Icons.handshake_outlined,
        children: [
          _row('MOQ', '${offer.moq}'),
          if (offer.orderIncrement != null)
            _row('Order Increment', '${offer.orderIncrement}'),
          if (offer.leadTimeDays != null)
            _row('Lead Time', '${offer.leadTimeDays} days'),
          if (offer.warehouseId != null)
            _row('Warehouse', offer.warehouseId!.substring(0, 8)),
          if (offer.priceListId != null)
            _row('Price List', offer.priceListId!.substring(0, 8)),
          if (offer.externalRef != null)
            _row('External Ref', offer.externalRef!),
        ],
      );

  // ── Analytics ───────────────────────────────────────────────────

  Widget _analyticsCard(MerchantOffer offer, OfferAnalyticsRow? analytics) {
    final orders = analytics?.ordersCount ?? 0;
    final units = analytics?.unitsSold ?? 0;
    final revenue = analytics?.revenueMinor ?? 0;
    final hasData = orders > 0 || units > 0 || revenue > 0;

    return _sectionCard(
      title: 'PERFORMANCE',
      icon: Icons.analytics_outlined,
      children: [
        if (!hasData)
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 8),
            child: Text('No sales data yet',
                style: TextStyle(fontSize: 13, color: TaifTokens.muted)),
          ),
        if (hasData) ...[
          _analyticsRow(
              Icons.shopping_cart, '$orders', 'Orders', TaifTokens.info),
          const SizedBox(height: 8),
          _analyticsRow(
              Icons.inventory_2, '$units', 'Units Sold', TaifTokens.ok),
          const SizedBox(height: 8),
          _analyticsRow(Icons.trending_up, formatMinor(revenue, offer.currency),
              'Revenue', TaifTokens.brandPrimary),
        ],
      ],
    );
  }

  // ── Trend Chart ─────────────────────────────────────────────────

  Widget _trendCard(MerchantOffer offer) {
    final trendAsync = ref.watch(merchantOfferTrendProvider((
      offerId: offer.id,
      granularity: _trendGranularity,
      days: _trendDays,
    )));

    return _sectionCard(
      title: 'TREND',
      icon: Icons.show_chart,
      children: [
        // Granularity + range selectors
        Row(children: [
          _segmented(_trendGranularity, 'day', 'Day'),
          const SizedBox(width: 4),
          _segmented(_trendGranularity, 'week', 'Week'),
          const SizedBox(width: 12),
          _segmentedDays(30),
          const SizedBox(width: 4),
          _segmentedDays(90),
        ]),
        const SizedBox(height: 12),
        // Metric selector
        Row(children: [
          _metricChip('orders', 'Orders'),
          const SizedBox(width: 4),
          _metricChip('units', 'Units'),
          const SizedBox(width: 4),
          _metricChip('revenue', 'Revenue'),
        ]),
        const SizedBox(height: 12),
        // Chart
        trendAsync.when(
          loading: () => const SizedBox(
            height: 160,
            child: Center(child: CircularProgressIndicator(strokeWidth: 2)),
          ),
          error: (e, _) => const Text('Trend unavailable',
              style: TextStyle(fontSize: 13, color: TaifTokens.muted)),
          data: (points) => TrendChart(
            points: points,
            metric: _trendMetric,
            currency: offer.currency,
          ),
        ),
      ],
    );
  }

  Widget _segmented(String current, String value, String label) {
    final active = current == value;
    return GestureDetector(
      onTap: () => setState(() => _trendGranularity = value),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
        decoration: BoxDecoration(
          color: active ? TaifTokens.brandPrimary : TaifTokens.surface,
          borderRadius: BorderRadius.circular(TaifTokens.radiusSm),
          border: Border.all(
              color: active ? TaifTokens.brandPrimary : TaifTokens.line),
        ),
        child: Text(label,
            style: TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w600,
                color: active ? Colors.white : TaifTokens.ink)),
      ),
    );
  }

  Widget _segmentedDays(int days) {
    final active = _trendDays == days;
    return GestureDetector(
      onTap: () => setState(() => _trendDays = days),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
        decoration: BoxDecoration(
          color: active ? TaifTokens.brandPrimary : TaifTokens.surface,
          borderRadius: BorderRadius.circular(TaifTokens.radiusSm),
          border: Border.all(
              color: active ? TaifTokens.brandPrimary : TaifTokens.line),
        ),
        child: Text('${days}d',
            style: TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w600,
                color: active ? Colors.white : TaifTokens.ink)),
      ),
    );
  }

  Widget _metricChip(String value, String label) {
    final active = _trendMetric == value;
    return GestureDetector(
      onTap: () => setState(() => _trendMetric = value),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
        decoration: BoxDecoration(
          color: active
              ? TaifTokens.brandPrimary.withValues(alpha: 0.1)
              : TaifTokens.surface,
          borderRadius: BorderRadius.circular(TaifTokens.radiusSm),
          border: Border.all(
              color: active ? TaifTokens.brandPrimary : TaifTokens.line),
        ),
        child: Text(label,
            style: TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w600,
                color: active ? TaifTokens.brandPrimary : TaifTokens.ink)),
      ),
    );
  }

  Widget _analyticsRow(
          IconData icon, String value, String label, Color color) =>
      Row(children: [
        Icon(icon, size: 18, color: color),
        const SizedBox(width: 8),
        Expanded(
          child: Text(label,
              style: const TextStyle(fontSize: 13, color: TaifTokens.muted)),
        ),
        Text(value,
            style: TextStyle(
                fontSize: 15, fontWeight: FontWeight.w700, color: color)),
      ]);

  // ── Lifecycle Metadata ──────────────────────────────────────────

  Widget _lifecycleCard(MerchantOffer offer) {
    final rows = <Widget>[
      _row('Created', _fmtDate(offer.createdAt)),
      _row('Updated', _fmtDate(offer.updatedAt)),
    ];
    if (offer.proposedBy != null) {
      rows.add(_row('Proposed By', offer.proposedBy!.substring(0, 8)));
    }
    if (offer.reviewedBy != null) {
      rows.add(_row('Reviewed By', offer.reviewedBy!.substring(0, 8)));
    }
    if (offer.reviewedAt != null) {
      rows.add(_row('Reviewed At', _fmtDate(offer.reviewedAt)));
    }
    if (offer.activatedAt != null) {
      rows.add(_row('Activated At', _fmtDate(offer.activatedAt)));
    }
    if (offer.rejectionReason != null) {
      rows.add(Padding(
        padding: const EdgeInsets.only(top: 8),
        child: Container(
          width: double.infinity,
          padding: const EdgeInsets.all(10),
          decoration: BoxDecoration(
            color: TaifTokens.err.withValues(alpha: 0.06),
            borderRadius: BorderRadius.circular(TaifTokens.radiusSm),
            border: Border.all(color: TaifTokens.err.withValues(alpha: 0.2)),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('Rejection Reason',
                  style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w600,
                      color: TaifTokens.err)),
              const SizedBox(height: 4),
              Text(offer.rejectionReason!,
                  style: const TextStyle(fontSize: 13)),
            ],
          ),
        ),
      ));
    }
    return _sectionCard(
      title: 'LIFECYCLE',
      icon: Icons.history,
      children: rows,
    );
  }

  // ── Action Bar ──────────────────────────────────────────────────

  Widget _actionBar(MerchantOffer offer) {
    final actions = <Widget>[];

    if (offer.canPropose) {
      actions.add(AppButton(
        label: 'Propose for Approval',
        icon: Icons.send,
        variant: AppButtonVariant.primary,
        expanded: true,
        loading: _busy,
        onPressed: _busy ? null : () => _propose(offer),
      ));
    }

    if (offer.canWithdraw) {
      actions.add(const SizedBox(height: 8));
      actions.add(AppButton(
        label: 'Withdraw Offer',
        icon: Icons.cancel_outlined,
        variant: AppButtonVariant.danger,
        expanded: true,
        loading: _busy,
        onPressed: _busy ? null : () => _withdraw(offer),
      ));
    }

    if (offer.canUpdatePricing) {
      actions.add(const SizedBox(height: 8));
      actions.add(AppButton(
        label: 'Update Pricing',
        icon: Icons.edit,
        variant: AppButtonVariant.secondary,
        expanded: true,
        loading: _busy,
        onPressed: _busy ? null : () => _updatePricing(offer),
      ));
    }

    if (actions.isEmpty) {
      return Container(
        width: double.infinity,
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: TaifTokens.muted.withValues(alpha: 0.06),
          borderRadius: BorderRadius.circular(TaifTokens.radiusMd),
        ),
        child: const Center(
          child: Text('No actions available for this offer status',
              style: TextStyle(fontSize: 13, color: TaifTokens.muted)),
        ),
      );
    }

    return Column(children: actions);
  }

  // ── Actions ─────────────────────────────────────────────────────

  Future<void> _propose(MerchantOffer offer) async {
    final confirmed = await _confirmDialog(
      title: 'Propose Offer',
      message:
          'Submit this offer for admin approval? The status will change to PROPOSED.',
      confirmLabel: 'Propose',
      confirmColor: TaifTokens.brandPrimary,
    );
    if (!confirmed) return;
    _setBusy(true);
    try {
      await ref.read(apiServiceProvider).proposeOffer(offer.id);
      ref.invalidate(merchantOfferDetailProvider(widget.offerId));
      ref.invalidate(merchantOffersProvider);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Offer proposed for approval')),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(ApiService.errorMessage(e))),
        );
      }
    } finally {
      _setBusy(false);
    }
  }

  Future<void> _withdraw(MerchantOffer offer) async {
    final confirmed = await _confirmDialog(
      title: 'Withdraw Offer',
      message:
          'Withdraw this offer? It will no longer be visible to buyers. This action cannot be undone.',
      confirmLabel: 'Withdraw',
      confirmColor: TaifTokens.err,
    );
    if (!confirmed) return;
    _setBusy(true);
    try {
      await ref.read(apiServiceProvider).withdrawOffer(offer.id);
      ref.invalidate(merchantOfferDetailProvider(widget.offerId));
      ref.invalidate(merchantOffersProvider);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Offer withdrawn')),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(ApiService.errorMessage(e))),
        );
      }
    } finally {
      _setBusy(false);
    }
  }

  Future<void> _updatePricing(MerchantOffer offer) async {
    // Navigate to pricing update form (Phase 5 will provide the full form).
    // For now, show a simple dialog with the key pricing fields.
    final priceCtrl = TextEditingController(
      text: offer.basePriceMinor != null
          ? (offer.basePriceMinor! / 100).toStringAsFixed(2)
          : '',
    );
    final moqCtrl = TextEditingController(text: '${offer.moq}');
    final leadCtrl = TextEditingController(
      text: offer.leadTimeDays?.toString() ?? '',
    );

    final result = await showDialog<Map<String, dynamic>>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Update Pricing'),
        content: SingleChildScrollView(
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            TextField(
              controller: priceCtrl,
              decoration: const InputDecoration(
                labelText: 'Base Price',
                hintText: '0.00',
                prefixText: '',
              ),
              keyboardType:
                  const TextInputType.numberWithOptions(decimal: true),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: moqCtrl,
              decoration: const InputDecoration(labelText: 'MOQ'),
              keyboardType: TextInputType.number,
            ),
            const SizedBox(height: 12),
            TextField(
              controller: leadCtrl,
              decoration: const InputDecoration(labelText: 'Lead Time (days)'),
              keyboardType: TextInputType.number,
            ),
          ]),
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
          ElevatedButton(
            onPressed: () => Navigator.pop(ctx, {
              'price': priceCtrl.text,
              'moq': moqCtrl.text,
              'lead': leadCtrl.text,
            }),
            style: ElevatedButton.styleFrom(
                backgroundColor: TaifTokens.brandPrimary),
            child: const Text('Save'),
          ),
        ],
      ),
    );

    if (result == null) return;

    final newPrice = double.tryParse(result['price'] ?? '');
    final newMoq = int.tryParse(result['moq'] ?? '');
    final newLead = int.tryParse(result['lead'] ?? '');

    _setBusy(true);
    try {
      await ref.read(apiServiceProvider).updateOfferPricing(
            offer.id,
            basePriceMinor: newPrice != null ? (newPrice * 100).round() : null,
            moq: newMoq,
            leadTimeDays: newLead,
          );
      ref.invalidate(merchantOfferDetailProvider(widget.offerId));
      ref.invalidate(merchantOffersProvider);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Pricing updated')),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(ApiService.errorMessage(e))),
        );
      }
    } finally {
      _setBusy(false);
    }
  }

  Future<bool> _confirmDialog({
    required String title,
    required String message,
    required String confirmLabel,
    required Color confirmColor,
  }) async {
    final result = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(title),
        content: Text(message),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Cancel')),
          ElevatedButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: ElevatedButton.styleFrom(backgroundColor: confirmColor),
            child: Text(confirmLabel),
          ),
        ],
      ),
    );
    return result ?? false;
  }

  void _setBusy(bool v) => setState(() => _busy = v);

  // ── Helpers ─────────────────────────────────────────────────────

  Widget _sectionCard({
    required String title,
    required IconData icon,
    required List<Widget> children,
  }) =>
      Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: TaifTokens.surface,
          borderRadius: BorderRadius.circular(TaifTokens.radiusMd),
          border: Border.all(color: TaifTokens.line),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(children: [
              Icon(icon, size: 16, color: TaifTokens.muted),
              const SizedBox(width: 6),
              Text(title.toUpperCase(),
                  style: const TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w600,
                      color: TaifTokens.muted,
                      letterSpacing: 0.4)),
            ]),
            const SizedBox(height: 12),
            ...children,
          ],
        ),
      );

  Widget _row(String label, String value, {TextStyle? valueStyle}) => Padding(
        padding: const EdgeInsets.only(bottom: 8),
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
                style: valueStyle ??
                    const TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
          ),
        ]),
      );

  String _fmtDate(String? iso) {
    if (iso == null || iso.isEmpty) return '—';
    final d = DateTime.tryParse(iso);
    if (d == null) return iso.length >= 10 ? iso.substring(0, 10) : iso;
    return '${d.year.toString().padLeft(4, '0')}-'
        '${d.month.toString().padLeft(2, '0')}-'
        '${d.day.toString().padLeft(2, '0')}';
  }
}

/// Small availability indicator shown in the offer header.
class _AvailabilityTag extends StatelessWidget {
  final bool available;
  const _AvailabilityTag({required this.available});

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
        decoration: BoxDecoration(
          color: available
              ? TaifTokens.ok.withValues(alpha: 0.1)
              : TaifTokens.muted.withValues(alpha: 0.1),
          borderRadius: BorderRadius.circular(10),
        ),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          Icon(
            available ? Icons.check_circle : Icons.pause_circle,
            size: 12,
            color: available ? TaifTokens.ok : TaifTokens.muted,
          ),
          const SizedBox(width: 4),
          Text(available ? 'Available' : 'Unavailable',
              style: TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w600,
                  color: available ? TaifTokens.ok : TaifTokens.muted)),
        ]),
      );
}
