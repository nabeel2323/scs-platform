import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:uuid/uuid.dart';
import '../../providers/providers.dart';
import '../../widgets/common_widgets.dart';

class CheckoutScreen extends ConsumerStatefulWidget {
  const CheckoutScreen({super.key});
  @override
  ConsumerState<CheckoutScreen> createState() => _CheckoutScreenState();
}

class _CheckoutScreenState extends ConsumerState<CheckoutScreen> {
  final _addressCtrl = TextEditingController(text: '123 Main St');
  final _cityCtrl = TextEditingController(text: 'Riyadh');
  final _notesCtrl = TextEditingController();
  String _fulfillment = 'PLATFORM_DELIVERY';
  bool _submitting = false;
  String? _error;

  Future<void> _checkout() async {
    setState(() {
      _submitting = true;
      _error = null;
    });
    try {
      await ref.read(apiServiceProvider).checkout(
        deliveryAddress: {'street': _addressCtrl.text, 'city': _cityCtrl.text},
        notes: _notesCtrl.text.isEmpty ? null : _notesCtrl.text,
        idempotencyKey: Uuid().v4(),
        fulfillmentMethod: _fulfillment,
      );
      ref.invalidate(cartProvider);
      ref.invalidate(ordersProvider);
      if (mounted) {
        context.go('/orders');
        ScaffoldMessenger.of(context)
            .showSnackBar(const SnackBar(content: Text('Order placed!')));
      }
    } catch (e) {
      setState(() => _error = '$e');
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  void dispose() {
    _addressCtrl.dispose();
    _cityCtrl.dispose();
    _notesCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
        appBar: AppBar(title: const Text('Checkout')),
        body: SingleChildScrollView(
            padding: const EdgeInsets.all(16),
            child: Column(children: [
              if (_error != null) ErrorBanner(message: _error!),
              TextField(
                  controller: _addressCtrl,
                  decoration: const InputDecoration(
                      labelText: 'Delivery Address',
                      prefixIcon: Icon(Icons.location_on)),
                  enabled: !_submitting),
              const SizedBox(height: 12),
              TextField(
                  controller: _cityCtrl,
                  decoration: const InputDecoration(
                      labelText: 'City', prefixIcon: Icon(Icons.location_city)),
                  enabled: !_submitting),
              const SizedBox(height: 12),
              TextField(
                  controller: _notesCtrl,
                  decoration:
                      const InputDecoration(labelText: 'Notes (optional)'),
                  maxLines: 2,
                  enabled: !_submitting),
              const SizedBox(height: 16),
              const Align(
                  alignment: Alignment.centerLeft,
                  child: Text('Fulfillment Method',
                      style: TextStyle(fontWeight: FontWeight.w600))),
              const SizedBox(height: 8),
              RadioGroup<String>(
                groupValue: _fulfillment,
                onChanged: (v) {
                  if (!_submitting && v != null)
                    setState(() => _fulfillment = v);
                },
                child: Column(children: [
                  ...['PLATFORM_DELIVERY', 'MERCHANT_DELIVERY', 'PICKUP'].map(
                      (m) => RadioListTile<String>(
                          title: Text(m.replaceAll('_', ' ')), value: m)),
                ]),
              ),
              const SizedBox(height: 24),
              SizedBox(
                  width: double.infinity,
                  height: 48,
                  child: ElevatedButton(
                      onPressed: _submitting ? null : _checkout,
                      child: _submitting
                          ? const SizedBox(
                              width: 20,
                              height: 20,
                              child: CircularProgressIndicator(strokeWidth: 2))
                          : const Text('Place Order'))),
            ])));
  }
}
