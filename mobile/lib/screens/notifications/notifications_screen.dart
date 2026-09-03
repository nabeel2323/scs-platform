import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/theme.dart';
import '../../providers/providers.dart';
import '../../widgets/common_widgets.dart';

class NotificationsScreen extends ConsumerWidget {
  const NotificationsScreen({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final notifs = ref.watch(notificationsProvider);
    return Scaffold(
        appBar: AppBar(title: const Text('Notifications'), actions: [
          TextButton(
              onPressed: () async {
                await ref.read(apiServiceProvider).markAllNotificationsRead();
                ref.invalidate(notificationsProvider);
                ref.invalidate(unreadCountProvider);
              },
              child: const Text('Mark All Read')),
        ]),
        body: notifs.when(
          data: (list) => list.isEmpty
              ? const EmptyState(
                  title: 'No notifications',
                  description: "You're all caught up!",
                  icon: Icons.notifications_outlined)
              : ListView.builder(
                  padding: const EdgeInsets.all(16),
                  itemCount: list.length,
                  itemBuilder: (_, i) {
                    final n = list[i];
                    return Card(
                        color: n.isRead ? null : const Color(0xFFF0F7FF),
                        child: ListTile(
                            title: Text(n.title ?? n.template,
                                style: const TextStyle(
                                    fontWeight: FontWeight.w600, fontSize: 13)),
                            subtitle: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(n.body,
                                      style: const TextStyle(fontSize: 12)),
                                  const SizedBox(height: 4),
                                  Row(children: [
                                    Text(n.channel,
                                        style: const TextStyle(
                                            fontSize: 10,
                                            color: TaifTokens.muted)),
                                    const SizedBox(width: 8),
                                    Text(n.type,
                                        style: const TextStyle(
                                            fontSize: 10,
                                            color: TaifTokens.muted))
                                  ])
                                ]),
                            trailing: Text(
                                DateTime.tryParse(n.createdAt)
                                        ?.toLocal()
                                        .toString()
                                        .substring(0, 10) ??
                                    '',
                                style: const TextStyle(
                                    fontSize: 10, color: TaifTokens.muted)),
                            onTap: n.isRead
                                ? null
                                : () async {
                                    await ref
                                        .read(apiServiceProvider)
                                        .markNotificationRead(n.id);
                                    ref.invalidate(notificationsProvider);
                                    ref.invalidate(unreadCountProvider);
                                  }));
                  }),
          loading: () => const LoadingSpinner(),
          error: (e, _) => EmptyState(
              title: 'Error',
              description: '$e',
              onAction: () => ref.invalidate(notificationsProvider)),
        ));
  }
}
