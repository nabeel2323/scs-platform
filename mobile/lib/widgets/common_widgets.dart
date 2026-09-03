import 'package:flutter/material.dart';
import '../core/theme.dart';
import '../models/models.dart';

/// Status badge widget.
class StatusBadge extends StatelessWidget {
  final String status;
  const StatusBadge(this.status, {super.key});
  @override
  Widget build(BuildContext context) {
    final c = _color(status);
    return Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
        decoration: BoxDecoration(
            color: c.withAlpha(25),
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: c.withAlpha(80))),
        child: Text(status.replaceAll('_', ' '),
            style: TextStyle(
                fontSize: 11, fontWeight: FontWeight.w600, color: c)));
  }

  Color _color(String s) => switch (s) {
        'SUBMITTED' => TaifTokens.warn,
        'PENDING_CONFIRMATION' => TaifTokens.info,
        'ACCEPTED' => TaifTokens.ok,
        'PARTIALLY_ACCEPTED' => TaifTokens.warn,
        'PREPARING' => const Color(0xFF7C3AED),
        'READY' => TaifTokens.ok,
        'ASSIGNED' => TaifTokens.info,
        'PICKED_UP' => const Color(0xFF7C3AED),
        'OUT_FOR_DELIVERY' => TaifTokens.info,
        'DELIVERED' => TaifTokens.ok,
        'COMPLETED' => TaifTokens.ok,
        'CANCELLED' => TaifTokens.err,
        'REJECTED' => TaifTokens.err,
        'VERIFIED' => TaifTokens.ok,
        'PENDING' => TaifTokens.warn,
        _ => TaifTokens.muted
      };
}

/// Empty state widget.
class EmptyState extends StatelessWidget {
  final String title, description;
  final IconData icon;
  final VoidCallback? onAction;
  final String? actionLabel;
  const EmptyState(
      {super.key,
      required this.title,
      required this.description,
      this.icon = Icons.inbox_outlined,
      this.onAction,
      this.actionLabel});
  @override
  Widget build(BuildContext context) => Center(
      child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Icon(icon, size: 56, color: TaifTokens.line),
            const SizedBox(height: 16),
            Text(title,
                style: Theme.of(context)
                    .textTheme
                    .titleMedium
                    ?.copyWith(fontWeight: FontWeight.w600)),
            const SizedBox(height: 8),
            Text(description,
                textAlign: TextAlign.center,
                style: Theme.of(context)
                    .textTheme
                    .bodyMedium
                    ?.copyWith(color: TaifTokens.muted)),
            if (onAction != null) ...[
              const SizedBox(height: 16),
              ElevatedButton(
                  onPressed: onAction, child: Text(actionLabel ?? 'Refresh'))
            ]
          ])));
}

/// Loading spinner widget.
class LoadingSpinner extends StatelessWidget {
  const LoadingSpinner({super.key});
  @override
  Widget build(BuildContext context) =>
      const Center(child: CircularProgressIndicator());
}

/// Error banner widget.
class ErrorBanner extends StatelessWidget {
  final String message;
  final VoidCallback? onRetry;
  const ErrorBanner({super.key, required this.message, this.onRetry});
  @override
  Widget build(BuildContext context) => Container(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
          color: TaifTokens.err.withAlpha(20),
          borderRadius: BorderRadius.circular(8),
          border: Border.all(color: TaifTokens.err.withAlpha(60))),
      child: Row(children: [
        const Icon(Icons.error_outline, color: TaifTokens.err, size: 20),
        const SizedBox(width: 8),
        Expanded(
            child: Text(message,
                style: const TextStyle(fontSize: 13, color: TaifTokens.err))),
        if (onRetry != null)
          TextButton(onPressed: onRetry, child: const Text('Retry'))
      ]));
}

/// Product card widget.
class ProductCard extends StatelessWidget {
  final Product product;
  final VoidCallback? onTap;
  final VoidCallback? onAddToCart;
  const ProductCard(
      {super.key, required this.product, this.onTap, this.onAddToCart});
  @override
  Widget build(BuildContext context) => GestureDetector(
        onTap: onTap,
        child: Card(
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  height: 80,
                  width: double.infinity,
                  decoration: BoxDecoration(
                    color: TaifTokens.bg,
                    borderRadius: BorderRadius.circular(6),
                  ),
                  child: const Center(
                    child: Icon(Icons.inventory_2_outlined,
                        color: TaifTokens.muted),
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  product.title,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                      fontSize: 13, fontWeight: FontWeight.w600),
                ),
                const SizedBox(height: 4),
                Text(
                  'MOQ: ${product.moq}',
                  style: const TextStyle(fontSize: 11, color: TaifTokens.muted),
                ),
                if (onAddToCart != null) ...[
                  const SizedBox(height: 8),
                  SizedBox(
                    width: double.infinity,
                    child: ElevatedButton.icon(
                      onPressed: onAddToCart,
                      icon: const Icon(Icons.add, size: 16),
                      label: const Text('Add', style: TextStyle(fontSize: 12)),
                      style: ElevatedButton.styleFrom(
                        padding: const EdgeInsets.symmetric(vertical: 6),
                        minimumSize: Size.zero,
                      ),
                    ),
                  ),
                ],
              ],
            ),
          ),
        ),
      );
}

/// QuantityStepper — ± buttons, direct entry, MOQ floor guard.
class QuantityStepper extends StatefulWidget {
  final int value;
  final ValueChanged<int> onChanged;
  final int minQty;
  final String? tierHint;
  const QuantityStepper({
    super.key,
    required this.value,
    required this.onChanged,
    this.minQty = 1,
    this.tierHint,
  });
  @override
  State<QuantityStepper> createState() => _QuantityStepperState();
}

class _QuantityStepperState extends State<QuantityStepper> {
  late TextEditingController _ctrl;
  @override
  void initState() {
    super.initState();
    _ctrl = TextEditingController(text: widget.value.toString());
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  void _commit(String text) {
    final v = int.tryParse(text) ?? widget.minQty;
    final clamped = v < widget.minQty ? widget.minQty : v;
    widget.onChanged(clamped);
    _ctrl.text = clamped.toString();
  }

  @override
  Widget build(BuildContext context) {
    return Column(mainAxisSize: MainAxisSize.min, children: [
      Row(mainAxisSize: MainAxisSize.min, children: [
        IconButton(
          onPressed: widget.value <= widget.minQty
              ? null
              : () {
                  _commit((widget.value - 1).toString());
                },
          icon: const Icon(Icons.remove, size: 18),
          iconSize: 18,
          splashRadius: 18,
        ),
        SizedBox(
          width: 48,
          child: TextField(
            controller: _ctrl,
            textAlign: TextAlign.center,
            keyboardType: TextInputType.number,
            onSubmitted: _commit,
            style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
            decoration: const InputDecoration(
                isDense: true,
                border: OutlineInputBorder(),
                contentPadding: EdgeInsets.symmetric(vertical: 6)),
          ),
        ),
        IconButton(
          onPressed: () {
            _commit((widget.value + 1).toString());
          },
          icon: const Icon(Icons.add, size: 18),
          iconSize: 18,
          splashRadius: 18,
        ),
      ]),
      if (widget.tierHint != null)
        Padding(
          padding: const EdgeInsets.only(top: 2),
          child: Text(widget.tierHint!,
              style: TextStyle(
                  fontSize: 11,
                  color: TaifTokens.ok,
                  fontStyle: FontStyle.italic)),
        ),
    ]);
  }
}

/// TierLadder — visual quantity-price ladder widget.
class TierLadder extends StatelessWidget {
  final List<TierEntry> tiers;
  final int currentQty;
  const TierLadder({super.key, required this.tiers, this.currentQty = 0});
  @override
  Widget build(BuildContext context) {
    final sorted = List<TierEntry>.from(tiers)
      ..sort((a, b) => a.minQty.compareTo(b.minQty));
    int activeIdx = 0;
    for (var i = 0; i < sorted.length; i++) {
      if (currentQty >= sorted[i].minQty) activeIdx = i;
    }
    return Container(
      decoration: BoxDecoration(
          border: Border.all(color: TaifTokens.muted.withValues(alpha: 0.3)),
          borderRadius: BorderRadius.circular(8)),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
          decoration: BoxDecoration(
              color: TaifTokens.muted.withValues(alpha: 0.08),
              borderRadius:
                  const BorderRadius.vertical(top: Radius.circular(7))),
          child: Text('QUANTITY TIERS',
              style: TextStyle(
                  fontSize: 10,
                  fontWeight: FontWeight.w600,
                  color: TaifTokens.muted,
                  letterSpacing: 0.3)),
        ),
        ...sorted.asMap().entries.map((e) {
          final isActive = e.key == activeIdx;
          final price = (e.value.unitPriceMinor / 100).toStringAsFixed(2);
          return Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
            decoration: BoxDecoration(
              color: isActive ? TaifTokens.info.withValues(alpha: 0.06) : null,
              border: Border(
                  left: BorderSide(
                      color: isActive ? TaifTokens.info : Colors.transparent,
                      width: 3)),
            ),
            child: Row(children: [
              Text('\u2265 ${e.value.minQty}',
                  style: TextStyle(
                      fontSize: 13,
                      fontWeight: isActive ? FontWeight.w600 : FontWeight.w400,
                      color: TaifTokens.ink)),
              const Spacer(),
              Text('$price SAR',
                  style: TextStyle(
                      fontSize: 13,
                      fontWeight: isActive ? FontWeight.w600 : FontWeight.w400,
                      color: isActive ? TaifTokens.ink : TaifTokens.muted)),
            ]),
          );
        }),
      ]),
    );
  }
}

/// Simple tier entry for TierLadder.
class TierEntry {
  final int minQty;
  final int unitPriceMinor;
  const TierEntry({required this.minQty, required this.unitPriceMinor});
}
