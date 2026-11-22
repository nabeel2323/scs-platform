import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/theme.dart';
import '../../providers/providers.dart';
import '../../services/api_service.dart';
import '../../services/realtime_service.dart';
import '../../widgets/common_widgets.dart';

Future<void> _refreshNotifications(WidgetRef ref) async {
  try {
    await ref.refresh(notificationsProvider.future);
  } catch (_) {
    // The provider retains the last successful list and exposes the error.
  }
}

class NotificationsScreen extends ConsumerStatefulWidget {
  const NotificationsScreen({super.key});

  @override
  ConsumerState<NotificationsScreen> createState() =>
      _NotificationsScreenState();
}

class _NotificationsScreenState extends ConsumerState<NotificationsScreen> {
  StreamSubscription<NotificationEvent>? _sub;
  bool _markingAllRead = false;
  final Set<String> _markingIds = {};

  @override
  void initState() {
    super.initState();
    // Live in-app notifications over the realtime gateway (WEB-B6) — new items
    // appear without a manual refresh or poll.
    final realtime = ref.read(realtimeServiceProvider);
    realtime.connect();
    _sub = realtime.notifications.listen((_) {
      if (!mounted) return;
      ref.invalidate(notificationsProvider);
      ref.invalidate(unreadCountProvider);
    });
  }

  @override
  void dispose() {
    _sub?.cancel();
    super.dispose();
  }

  Future<void> _markAllRead() async {
    setState(() => _markingAllRead = true);
    try {
      await ref.read(apiServiceProvider).markAllNotificationsRead();
      ref.invalidate(notificationsProvider);
      ref.invalidate(unreadCountProvider);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('All notifications marked as read')),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content:
                Text('Mark all read failed: ${ApiService.errorMessage(e)}'),
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _markingAllRead = false);
    }
  }

  Future<void> _markOneRead(String notificationId) async {
    if (_markingIds.contains(notificationId)) return;
    setState(() => _markingIds.add(notificationId));
    try {
      await ref.read(apiServiceProvider).markNotificationRead(notificationId);
      ref.invalidate(notificationsProvider);
      ref.invalidate(unreadCountProvider);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content:
                Text('Could not mark notification as read: ${ApiService.errorMessage(e)}'),
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _markingIds.remove(notificationId));
    }
  }

  @override
  Widget build(BuildContext context) {
    final notifs = ref.watch(notificationsProvider);
    return Scaffold(
      appBar: AppBar(
        title: const Text('Notifications'),
        actions: [
          IconButton(
            tooltip: 'Refresh notifications',
            icon: const Icon(Icons.refresh),
            onPressed: () => ref.invalidate(notificationsProvider),
          ),
          TextButton(
            onPressed: _markingAllRead ? null : _markAllRead,
            child: Text(_markingAllRead ? 'Marking...' : 'Mark All Read'),
          ),
        ],
      ),
      body: notifs.when(
        skipLoadingOnRefresh: true,
        skipError: true,
        data: (list) {
          final showRefreshNotice = notifs.isRefreshing || notifs.hasError;
          final children = <Widget>[
            if (showRefreshNotice)
              _refreshNotice(
                notifs.isRefreshing
                    ? 'Refreshing notifications… showing the last successfully loaded list.'
                    : 'Could not refresh notifications: ${ApiService.errorMessage(notifs.error!)}. Showing the last successfully loaded list.',
                () => ref.invalidate(notificationsProvider),
              ),
            if (list.isEmpty)
              const SizedBox(
                height: 320,
                child: EmptyState(
                  title: 'No notifications',
                  description: "You're all caught up!",
                  icon: Icons.notifications_outlined,
                ),
              )
            else
              ...list.map((notification) => Card(
                    color: notification.isRead
                        ? null
                        : const Color(0xFFF0F7FF),
                    child: ListTile(
                      title: Text(
                        notification.title ?? notification.template,
                        style: const TextStyle(
                          fontWeight: FontWeight.w600,
                          fontSize: 13,
                        ),
                      ),
                      subtitle: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            notification.body,
                            style: const TextStyle(fontSize: 12),
                          ),
                          const SizedBox(height: 4),
                          Row(
                            children: [
                              Text(
                                notification.channel,
                                style: const TextStyle(
                                  fontSize: 10,
                                  color: TaifTokens.muted,
                                ),
                              ),
                              const SizedBox(width: 8),
                              Text(
                                notification.type,
                                style: const TextStyle(
                                  fontSize: 10,
                                  color: TaifTokens.muted,
                                ),
                              ),
                            ],
                          ),
                        ],
                      ),
                      trailing: _markingIds.contains(notification.id)
                          ? const SizedBox(
                              width: 18,
                              height: 18,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : Text(
                              DateTime.tryParse(notification.createdAt)
                                      ?.toLocal()
                                      .toString()
                                      .substring(0, 10) ??
                                  '',
                              style: const TextStyle(
                                fontSize: 10,
                                color: TaifTokens.muted,
                              ),
                            ),
                      onTap: notification.isRead
                          ? null
                          : () => _markOneRead(notification.id),
                    ),
                  )),
          ];

          return RefreshIndicator(
            onRefresh: () => _refreshNotifications(ref),
            child: ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.all(16),
              children: children,
            ),
          );
        },
        loading: () => const LoadingSpinner(),
        error: (e, _) => EmptyState(
          title: 'Error',
          description: ApiService.errorMessage(e),
          onAction: () => ref.invalidate(notificationsProvider),
        ),
      ),
    );
  }

  Widget _refreshNotice(String message, VoidCallback onRetry) => Container(
        margin: const EdgeInsets.only(bottom: 12),
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: TaifTokens.err.withValues(alpha: 0.06),
          border: Border.all(color: TaifTokens.err.withValues(alpha: 0.3)),
          borderRadius: BorderRadius.circular(TaifTokens.radiusMd),
        ),
        child: Row(
          children: [
            Expanded(
              child: Text(
                message,
                style: const TextStyle(fontSize: 12, color: TaifTokens.err),
              ),
            ),
            TextButton(onPressed: onRetry, child: const Text('Retry')),
          ],
        ),
      );
}
