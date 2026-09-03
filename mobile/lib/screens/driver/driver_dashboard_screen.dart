import 'package:flutter/material.dart';
import '../../core/theme.dart';

/// Driver screen — duty toggle, job board, POD, earnings summary.
class DriverDashboardScreen extends StatefulWidget {
  const DriverDashboardScreen({super.key});
  @override
  State<DriverDashboardScreen> createState() => _DriverDashboardScreenState();
}

class _DriverDashboardScreenState extends State<DriverDashboardScreen> {
  bool _onDuty = false;
  int _completedToday = 0;
  double _earningsToday = 0;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Driver Dashboard'),
        backgroundColor: TaifTokens.info,
        foregroundColor: Colors.white,
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // Duty toggle
          Card(
            child: SwitchListTile(
              title: const Text('On Duty'),
              subtitle:
                  Text(_onDuty ? 'Accepting deliveries' : 'Currently offline'),
              value: _onDuty,
              onChanged: (v) => setState(() => _onDuty = v),
              activeThumbColor: TaifTokens.ok,
            ),
          ),
          const SizedBox(height: 16),

          // Earnings summary
          Row(
            children: [
              Expanded(
                child: _StatCard(
                  label: 'Completed',
                  value: '$_completedToday',
                  icon: Icons.check_circle_outline,
                  color: TaifTokens.ok,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: _StatCard(
                  label: 'Earnings',
                  value: '${_earningsToday.toStringAsFixed(0)} SAR',
                  icon: Icons.payments_outlined,
                  color: TaifTokens.brandAccent,
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),

          // Job board
          const Text('Delivery Jobs',
              style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
          const SizedBox(height: 8),
          if (_onDuty) ...[
            _JobTile(
                orderId: 'abc12345',
                address: '123 King Fahd Rd',
                distance: '2.3 km'),
            _JobTile(
                orderId: 'def67890',
                address: '456 Olaya St',
                distance: '4.1 km'),
            _JobTile(
                orderId: 'ghi13579',
                address: '789 Tahlia St',
                distance: '1.8 km'),
          ] else
            const Card(
              child: Padding(
                padding: EdgeInsets.all(24),
                child: Center(
                    child: Text('Go on duty to see available deliveries',
                        style: TextStyle(color: TaifTokens.muted))),
              ),
            ),
        ],
      ),
    );
  }
}

class _StatCard extends StatelessWidget {
  final String label;
  final String value;
  final IconData icon;
  final Color color;
  const _StatCard(
      {required this.label,
      required this.value,
      required this.icon,
      required this.color});

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(children: [
          Icon(icon, color: color, size: 28),
          const SizedBox(height: 8),
          Text(value,
              style: TextStyle(
                  fontSize: 20, fontWeight: FontWeight.w700, color: color)),
          Text(label,
              style: const TextStyle(fontSize: 12, color: TaifTokens.muted)),
        ]),
      ),
    );
  }
}

class _JobTile extends StatelessWidget {
  final String orderId;
  final String address;
  final String distance;
  const _JobTile(
      {required this.orderId, required this.address, required this.distance});

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.symmetric(vertical: 4),
      child: ListTile(
        leading: CircleAvatar(
            backgroundColor: TaifTokens.info.withValues(alpha: 0.1),
            child:
                Icon(Icons.local_shipping, color: TaifTokens.info, size: 20)),
        title: Text('Order #$orderId',
            style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
        subtitle: Text('$address · $distance',
            style: const TextStyle(fontSize: 12, color: TaifTokens.muted)),
        trailing: ElevatedButton(
          onPressed: () {},
          style: ElevatedButton.styleFrom(
            backgroundColor: TaifTokens.info,
            foregroundColor: Colors.white,
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
            minimumSize: Size.zero,
          ),
          child: const Text('Accept', style: TextStyle(fontSize: 12)),
        ),
      ),
    );
  }
}
