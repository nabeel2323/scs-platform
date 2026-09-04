import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/theme.dart';
import '../../providers/providers.dart';

/// Screen for viewing and managing active sessions
class SessionsScreen extends ConsumerStatefulWidget {
  const SessionsScreen({super.key});

  @override
  ConsumerState<SessionsScreen> createState() => _SessionsScreenState();
}

class _SessionsScreenState extends ConsumerState<SessionsScreen> {
  List<Map<String, dynamic>> _sessions = [];
  bool _isLoading = true;
  String? _error;
  String? _success;

  @override
  void initState() {
    super.initState();
    _loadSessions();
  }

  Future<void> _loadSessions() async {
    setState(() {
      _isLoading = true;
      _error = null;
    });

    try {
      final api = ref.read(apiServiceProvider);
      final sessions = await api.fetchSessions();
      setState(() {
        _sessions = sessions;
        _isLoading = false;
      });
    } catch (e) {
      setState(() {
        _error = e.toString().replaceAll('Exception: ', '');
        _isLoading = false;
      });
    }
  }

  Future<void> _handleRevokeDevice(String deviceId, String deviceName) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Revoke Sessions'),
        content: Text(
            'Revoke all sessions for $deviceName? This will log you out on that device.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            style: TextButton.styleFrom(foregroundColor: Colors.red),
            child: const Text('Revoke'),
          ),
        ],
      ),
    );

    if (confirmed != true) return;

    setState(() {
      _error = null;
      _success = null;
    });

    try {
      final api = ref.read(apiServiceProvider);
      await api.revokeSessionsByDevice(deviceId);

      setState(() {
        _success = 'Sessions revoked successfully';
      });

      // Reload sessions
      await _loadSessions();
    } catch (e) {
      setState(() {
        _error = e.toString().replaceAll('Exception: ', '');
      });
    }
  }

  String _getDeviceName(Map<String, dynamic> session) {
    final device = session['device'] as String?;
    if (device == null) return 'Unknown Device';

    if (device.contains('Chrome')) return 'Chrome Browser';
    if (device.contains('Firefox')) return 'Firefox Browser';
    if (device.contains('Safari')) return 'Safari Browser';
    if (device.contains('Edge')) return 'Edge Browser';
    if (device.contains('Android')) return 'Android Device';
    if (device.contains('iOS')) return 'iOS Device';

    return device.length > 50 ? '${device.substring(0, 50)}...' : device;
  }

  String _formatDate(String dateStr) {
    final date = DateTime.parse(dateStr);
    final now = DateTime.now();
    final diff = now.difference(date);

    if (diff.inDays > 0) {
      return '${diff.inDays} day${diff.inDays > 1 ? 's' : ''} ago';
    } else if (diff.inHours > 0) {
      return '${diff.inHours} hour${diff.inHours > 1 ? 's' : ''} ago';
    } else if (diff.inMinutes > 0) {
      return '${diff.inMinutes} minute${diff.inMinutes > 1 ? 's' : ''} ago';
    } else {
      return 'Just now';
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Active Sessions'),
        backgroundColor: TaifTokens.brandPrimary,
        foregroundColor: Colors.white,
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: _isLoading ? null : _loadSessions,
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _loadSessions,
        child: _buildBody(),
      ),
    );
  }

  Widget _buildBody() {
    if (_isLoading) {
      return const Center(
        child: CircularProgressIndicator(),
      );
    }

    if (_error != null) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.error_outline, size: 64, color: TaifTokens.err),
            const SizedBox(height: 16),
            Text(
              'Error loading sessions',
              style: Theme.of(context).textTheme.titleLarge,
            ),
            const SizedBox(height: 8),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 32),
              child: Text(
                _error!,
                textAlign: TextAlign.center,
                style: TextStyle(color: TaifTokens.muted),
              ),
            ),
            const SizedBox(height: 24),
            ElevatedButton(
              onPressed: _loadSessions,
              child: const Text('Retry'),
            ),
          ],
        ),
      );
    }

    if (_sessions.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.devices, size: 64, color: TaifTokens.muted),
            const SizedBox(height: 16),
            Text(
              'No active sessions',
              style: Theme.of(context).textTheme.titleLarge,
            ),
          ],
        ),
      );
    }

    return ListView(
      padding: const EdgeInsets.all(TaifTokens.sp16),
      children: [
        if (_success != null)
          Container(
            margin: const EdgeInsets.only(bottom: 16),
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: Colors.green.shade50,
              border: Border.all(color: Colors.green.shade200),
              borderRadius: BorderRadius.circular(TaifTokens.radiusMd),
            ),
            child: Row(
              children: [
                Icon(Icons.check_circle, color: Colors.green.shade700),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    _success!,
                    style: TextStyle(color: Colors.green.shade700),
                  ),
                ),
              ],
            ),
          ),
        Text(
          'Active Sessions (${_sessions.length})',
          style: Theme.of(context).textTheme.titleMedium?.copyWith(
                fontWeight: FontWeight.bold,
                color: TaifTokens.ink,
              ),
        ),
        const SizedBox(height: 8),
        Text(
          'Sessions track where you\'re logged in. Revoke sessions to log out on other devices.',
          style: Theme.of(context).textTheme.bodySmall?.copyWith(
                color: TaifTokens.muted,
              ),
        ),
        const SizedBox(height: 16),
        ..._sessions.map((session) => _buildSessionCard(session)),
        const SizedBox(height: 16),
        Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: TaifTokens.bg,
            borderRadius: BorderRadius.circular(TaifTokens.radiusMd),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'About Sessions',
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      fontWeight: FontWeight.bold,
                      color: TaifTokens.ink,
                    ),
              ),
              const SizedBox(height: 8),
              _buildInfoItem(
                  'Sessions track where you\'re logged in across devices'),
              _buildInfoItem(
                  'Revoking a session will log you out on that device'),
              _buildInfoItem(
                  'The "Current" session is the one you\'re using now'),
              _buildInfoItem(
                  'Sessions automatically expire after 30 days of inactivity'),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildSessionCard(Map<String, dynamic> session) {
    final isCurrent = session['isCurrent'] as bool? ?? false;
    final isRevoked = session['isRevoked'] as bool? ?? false;
    final deviceId = session['deviceId'] as String?;
    final deviceName = _getDeviceName(session);
    final createdAt = session['createdAt'] as String;
    final ip = session['ip'] as String?;

    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      color: isRevoked ? Colors.grey.shade100 : null,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(
                  isCurrent ? Icons.phone_android : Icons.devices,
                  color: isCurrent ? TaifTokens.brandPrimary : TaifTokens.muted,
                  size: 32,
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Expanded(
                            child: Text(
                              deviceName,
                              style: Theme.of(context)
                                  .textTheme
                                  .titleMedium
                                  ?.copyWith(
                                    fontWeight: FontWeight.bold,
                                    color: isRevoked
                                        ? TaifTokens.muted
                                        : TaifTokens.ink,
                                  ),
                            ),
                          ),
                          if (isCurrent)
                            Container(
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 8, vertical: 4),
                              decoration: BoxDecoration(
                                color: TaifTokens.ok.withValues(alpha: 0.1),
                                borderRadius: BorderRadius.circular(12),
                              ),
                              child: Text(
                                'Current',
                                style: TextStyle(
                                  color: TaifTokens.ok,
                                  fontSize: 12,
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                            ),
                          if (isRevoked)
                            Container(
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 8, vertical: 4),
                              decoration: BoxDecoration(
                                color: TaifTokens.err.withValues(alpha: 0.1),
                                borderRadius: BorderRadius.circular(12),
                              ),
                              child: Text(
                                'Revoked',
                                style: TextStyle(
                                  color: TaifTokens.err,
                                  fontSize: 12,
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                            ),
                        ],
                      ),
                      if (deviceId != null)
                        Text(
                          'ID: ${deviceId.substring(0, 8)}...',
                          style:
                              Theme.of(context).textTheme.bodySmall?.copyWith(
                                    color: TaifTokens.muted,
                                  ),
                        ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Icon(Icons.access_time, size: 16, color: TaifTokens.muted),
                const SizedBox(width: 4),
                Text(
                  _formatDate(createdAt),
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: TaifTokens.muted,
                      ),
                ),
                if (ip != null) ...[
                  const SizedBox(width: 16),
                  Icon(Icons.location_on, size: 16, color: TaifTokens.muted),
                  const SizedBox(width: 4),
                  Text(
                    ip,
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(
                          color: TaifTokens.muted,
                        ),
                  ),
                ],
              ],
            ),
            if (!isCurrent && !isRevoked && deviceId != null) ...[
              const SizedBox(height: 12),
              const Divider(),
              const SizedBox(height: 12),
              TextButton.icon(
                onPressed: () => _handleRevokeDevice(deviceId, deviceName),
                icon: const Icon(Icons.logout, color: Colors.red),
                label: const Text(
                  'Revoke Session',
                  style: TextStyle(color: Colors.red),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildInfoItem(String text) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 2),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(Icons.info_outline, size: 16, color: TaifTokens.info),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              text,
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: TaifTokens.muted,
                  ),
            ),
          ),
        ],
      ),
    );
  }
}
