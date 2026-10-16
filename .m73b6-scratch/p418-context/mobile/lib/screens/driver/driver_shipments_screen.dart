import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/theme.dart';
import '../../models/models.dart';
import '../../providers/providers.dart';
import '../../services/api_service.dart';
import '../../widgets/common_widgets.dart';

/// M7.1: Minimal driver workflow screen.
///
/// Shows the driver's assigned shipments and lets them progress through:
///   ASSIGNED → Pickup → OUT_FOR_DELIVERY → Deliver → DELIVERED
///
/// Does NOT implement GPS, maps, photo proof, or signature (those are M7.2+).
class DriverShipmentsScreen extends ConsumerStatefulWidget {
  const DriverShipmentsScreen({super.key});
  @override
  ConsumerState<DriverShipmentsScreen> createState() =>
      _DriverShipmentsScreenState();
}

class _DriverShipmentsScreenState extends ConsumerState<DriverShipmentsScreen> {
  String? _busyId;

  ApiService get _api => ref.read(apiServiceProvider);

  void _snack(String message, Color color) {
    if (!mounted) return;
    ScaffoldMessenger.of(context)
        .showSnackBar(SnackBar(content: Text(message), backgroundColor: color));
  }

  Future<void> _runAction(
      String shipmentId, String orderId, Future<void> Function() action,
      {required String success}) async {
    setState(() => _busyId = orderId);
    try {
      await action();
      ref.invalidate(driverShipmentsProvider);
      _snack(success, TaifTokens.ok);
    } catch (e) {
      _snack(ApiService.errorMessage(e), TaifTokens.err);
    } finally {
      if (mounted) setState(() => _busyId = null);
    }
  }

  Future<void> _confirmAndRun(
    String orderId,
    String title,
    String message,
    Future<void> Function() action, {
    required String success,
    IconData icon = Icons.check_circle,
  }) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        icon: Icon(icon, color: TaifTokens.brandPrimary, size: 32),
        title: Text(title),
        content: Text(message),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Cancel')),
          ElevatedButton(
              onPressed: () => Navigator.pop(ctx, true),
              style: ElevatedButton.styleFrom(backgroundColor: TaifTokens.ok),
              child: const Text('Confirm')),
        ],
      ),
    );
    if (ok != true) return;
    await _runAction('', orderId, action, success: success);
  }

  @override
  Widget build(BuildContext context) {
    final shipments = ref.watch(driverShipmentsProvider);
    return Scaffold(
      appBar: AppBar(
        title: const Text('My Shipments'),
        actions: [
          IconButton(
              tooltip: 'Refresh',
              icon: const Icon(Icons.refresh),
              onPressed: () => ref.invalidate(driverShipmentsProvider)),
        ],
      ),
      body: shipments.when(
        data: (list) {
          if (list.isEmpty) {
            return const EmptyState(
              title: 'No shipments',
              description: 'Assigned shipments will appear here',
              icon: Icons.local_shipping_outlined,
            );
          }
          // Group by status for clarity.
          final active = list
              .where((s) =>
                  s.status == 'ASSIGNED' ||
                  s.status == 'PICKED_UP' ||
                  s.status == 'OUT_FOR_DELIVERY')
              .toList();
          final done = list.where((s) => s.status == 'DELIVERED').toList();

          return RefreshIndicator(
            onRefresh: () async => ref.invalidate(driverShipmentsProvider),
            child: ListView(
              children: [
                if (active.isNotEmpty) ...[
                  _sectionHeader('Active (${active.length})', TaifTokens.info),
                  ...active.map(_shipmentCard),
                ],
                if (done.isNotEmpty) ...[
                  _sectionHeader('Delivered (${done.length})', TaifTokens.ok),
                  ...done.map(_shipmentCard),
                ],
                // If there are other statuses not shown above.
                if (active.isEmpty && done.isEmpty) ...list.map(_shipmentCard),
                const SizedBox(height: 24),
              ],
            ),
          );
        },
        loading: () => const LoadingSpinner(),
        error: (e, _) => EmptyState(
          title: 'Error',
          description: ApiService.errorMessage(e),
          onAction: () => ref.invalidate(driverShipmentsProvider),
        ),
      ),
    );
  }

  Widget _sectionHeader(String title, Color color) => Padding(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
        child: Text(title,
            style: TextStyle(
                fontWeight: FontWeight.w600, color: color, fontSize: 14)),
      );

  Widget _shipmentCard(DriverShipment s) {
    final busy = _busyId == s.orderId;
    return Card(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(children: [
              const Icon(Icons.local_shipping,
                  size: 18, color: TaifTokens.info),
              const SizedBox(width: 8),
              Expanded(
                child: Text('Order #${s.orderId.substring(0, 8)}',
                    style: const TextStyle(
                        fontWeight: FontWeight.w600, fontSize: 15)),
              ),
              StatusBadge(s.status),
            ]),
            const SizedBox(height: 8),
            // Timestamp info.
            if (s.assignedAt != null)
              _infoRow('Assigned', _formatTime(s.assignedAt!)),
            if (s.pickedUpAt != null)
              _infoRow('Picked up', _formatTime(s.pickedUpAt!)),
            if (s.outForDeliveryAt != null)
              _infoRow('Out for delivery', _formatTime(s.outForDeliveryAt!)),
            if (s.deliveredAt != null)
              _infoRow('Delivered', _formatTime(s.deliveredAt!)),
            const SizedBox(height: 12),
            // Action buttons based on current status.
            _driverActions(s, busy),
          ],
        ),
      ),
    );
  }

  Widget _driverActions(DriverShipment s, bool busy) {
    switch (s.status) {
      case 'ASSIGNED':
        return SizedBox(
          width: double.infinity,
          child: ElevatedButton.icon(
            onPressed: busy
                ? null
                : () => _confirmAndRun(
                      s.orderId,
                      'Confirm Pickup',
                      'Mark order #${s.orderId.substring(0, 8)} as picked up?',
                      () => _api.pickupOrder(s.orderId),
                      success: 'Picked up',
                      icon: Icons.inventory,
                    ),
            style: ElevatedButton.styleFrom(backgroundColor: TaifTokens.ok),
            icon: _busyIcon(busy, Icons.inventory, Colors.white),
            label: const Text('Pickup'),
          ),
        );
      case 'PICKED_UP':
        return SizedBox(
          width: double.infinity,
          child: ElevatedButton.icon(
            onPressed: busy
                ? null
                : () => _confirmAndRun(
                      s.orderId,
                      'Out for Delivery',
                      'Mark order #${s.orderId.substring(0, 8)} as out for delivery?',
                      () => _api.outForDelivery(s.orderId),
                      success: 'Out for delivery',
                      icon: Icons.directions_car,
                    ),
            style: ElevatedButton.styleFrom(backgroundColor: TaifTokens.info),
            icon: _busyIcon(busy, Icons.directions_car, Colors.white),
            label: const Text('Out for Delivery'),
          ),
        );
      case 'OUT_FOR_DELIVERY':
        return SizedBox(
          width: double.infinity,
          child: ElevatedButton.icon(
            onPressed: busy
                ? null
                : () => _confirmAndRun(
                      s.orderId,
                      'Confirm Delivery',
                      'Mark order #${s.orderId.substring(0, 8)} as delivered?',
                      () => _api.deliverOrder(s.orderId),
                      success: 'Delivered',
                      icon: Icons.check_circle,
                    ),
            style: ElevatedButton.styleFrom(backgroundColor: TaifTokens.ok),
            icon: _busyIcon(busy, Icons.check_circle, Colors.white),
            label: const Text('Deliver'),
          ),
        );
      case 'DELIVERED':
        return const Padding(
          padding: EdgeInsets.symmetric(vertical: 4),
          child: Row(children: [
            Icon(Icons.check_circle, color: TaifTokens.ok, size: 16),
            SizedBox(width: 8),
            Text('Delivered successfully',
                style: TextStyle(color: TaifTokens.ok, fontSize: 13)),
          ]),
        );
      default:
        return const SizedBox.shrink();
    }
  }

  Widget _infoRow(String label, String value) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 1),
        child: Row(children: [
          Text(label,
              style: const TextStyle(fontSize: 12, color: TaifTokens.muted)),
          const Spacer(),
          Text(value,
              style: const TextStyle(fontSize: 12, color: TaifTokens.ink)),
        ]),
      );

  Widget _busyIcon(bool busy, IconData icon, Color color) => busy
      ? const SizedBox(
          width: 14,
          height: 14,
          child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
      : Icon(icon, size: 18, color: color);

  String _formatTime(String iso) {
    final dt = DateTime.tryParse(iso)?.toLocal();
    if (dt == null) return iso;
    return '${dt.month}/${dt.day} ${dt.hour.toString().padLeft(2, '0')}:${dt.minute.toString().padLeft(2, '0')}';
  }
}
