import 'package:flutter/material.dart';
import '../../core/theme.dart';
import '../../models/models.dart';

/// Lightweight bar chart for offer trend data — drawn with [CustomPaint] to
/// avoid a chart-library dependency (mirrors the web's inline SVG approach).
///
/// Renders one bar per [OfferTrendPoint] bucket, sized by the selected metric.
/// Supports tap-to-inspect (highlights the tapped bar and shows a tooltip).
class TrendChart extends StatefulWidget {
  final List<OfferTrendPoint> points;

  /// Which metric to visualise: 'orders' | 'units' | 'revenue'.
  final String metric;

  /// Currency label for revenue formatting.
  final String currency;

  /// Chart height in logical pixels.
  final double height;

  /// Bar colour override; defaults to [TaifTokens.brandPrimary].
  final Color? barColor;

  const TrendChart({
    super.key,
    required this.points,
    this.metric = 'orders',
    this.currency = 'SAR',
    this.height = 160,
    this.barColor,
  });

  @override
  State<TrendChart> createState() => _TrendChartState();
}

class _TrendChartState extends State<TrendChart> {
  int? _selectedIdx;

  int _value(OfferTrendPoint p) => switch (widget.metric) {
        'units' => p.unitsSold,
        'revenue' => p.revenueMinor,
        _ => p.ordersCount,
      };

  String _formatValue(int v) => widget.metric == 'revenue'
      ? '${(v / 100).toStringAsFixed(0)} ${widget.currency}'
      : '$v';

  @override
  Widget build(BuildContext context) {
    final pts = widget.points;
    if (pts.isEmpty) {
      return SizedBox(
        height: widget.height,
        child: const Center(
          child: Text('No trend data',
              style: TextStyle(fontSize: 13, color: TaifTokens.muted)),
        ),
      );
    }

    final values = pts.map(_value).toList();
    final maxVal = values.reduce((a, b) => a > b ? a : b);
    if (maxVal == 0) {
      return SizedBox(
        height: widget.height,
        child: const Center(
          child: Text('No activity in this period',
              style: TextStyle(fontSize: 13, color: TaifTokens.muted)),
        ),
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Chart area
        Semantics(
          label: '${widget.metric} trend chart, ${pts.length} data points',
          child: SizedBox(
            height: widget.height,
            child: GestureDetector(
              onTapUp: (d) {
                final box = context.findRenderObject() as RenderBox?;
                if (box == null) return;
                final barWidth = box.size.width / pts.length;
                final idx = (d.localPosition.dx / barWidth).floor();
                if (idx >= 0 && idx < pts.length) {
                  setState(
                      () => _selectedIdx = _selectedIdx == idx ? null : idx);
                }
              },
              child: CustomPaint(
                size: Size.infinite,
                painter: _BarPainter(
                  values: values,
                  maxVal: maxVal,
                  selectedIdx: _selectedIdx,
                  barColor: widget.barColor ?? TaifTokens.brandPrimary,
                ),
              ),
            ),
          ),
        ),
        // X-axis labels (first, middle, last bucket)
        if (pts.length >= 2)
          Padding(
            padding: const EdgeInsets.only(top: 4),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                _axisLabel(_shortBucket(pts.first.bucket)),
                if (pts.length > 2)
                  _axisLabel(_shortBucket(pts[pts.length ~/ 2].bucket)),
                _axisLabel(_shortBucket(pts.last.bucket)),
              ],
            ),
          ),
        // Selection tooltip
        if (_selectedIdx != null && _selectedIdx! < pts.length)
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
              decoration: BoxDecoration(
                color: TaifTokens.brandPrimary.withValues(alpha: 0.08),
                borderRadius: BorderRadius.circular(TaifTokens.radiusSm),
              ),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(
                    pts[_selectedIdx!].bucket.length >= 10
                        ? pts[_selectedIdx!].bucket.substring(0, 10)
                        : pts[_selectedIdx!].bucket,
                    style:
                        const TextStyle(fontSize: 12, color: TaifTokens.muted),
                  ),
                  Text(
                    _formatValue(values[_selectedIdx!]),
                    style: const TextStyle(
                        fontSize: 13, fontWeight: FontWeight.w700),
                  ),
                ],
              ),
            ),
          ),
      ],
    );
  }

  Widget _axisLabel(String text) =>
      Text(text, style: const TextStyle(fontSize: 10, color: TaifTokens.muted));

  String _shortBucket(String b) {
    if (b.length >= 10) return b.substring(5, 10); // MM-DD
    return b;
  }
}

class _BarPainter extends CustomPainter {
  final List<int> values;
  final int maxVal;
  final int? selectedIdx;
  final Color barColor;

  _BarPainter({
    required this.values,
    required this.maxVal,
    this.selectedIdx,
    required this.barColor,
  });

  @override
  void paint(Canvas canvas, Size size) {
    if (values.isEmpty || maxVal == 0) return;

    final n = values.length;
    const gap = 2.0;
    final barW = (size.width - gap * (n - 1)) / n;
    const radius = 3.0;

    for (var i = 0; i < n; i++) {
      final frac = values[i] / maxVal;
      final barH = frac * (size.height - 4); // 4px top padding
      final left = i * (barW + gap);
      final top = size.height - barH;
      final rect = RRect.fromRectAndRadius(
        Rect.fromLTWH(left, top, barW, barH),
        const Radius.circular(radius),
      );

      final isSelected = i == selectedIdx;
      final paint = Paint()
        ..color = isSelected ? barColor : barColor.withValues(alpha: 0.6);
      canvas.drawRRect(rect, paint);
    }
  }

  @override
  bool shouldRepaint(_BarPainter old) =>
      old.values != values ||
      old.maxVal != maxVal ||
      old.selectedIdx != selectedIdx;
}
