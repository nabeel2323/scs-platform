import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/theme.dart';
import '../../providers/providers.dart';

class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final unread = ref.watch(unreadCountProvider).valueOrNull ?? 0;
    return Scaffold(
      appBar: AppBar(title: const Text('Smart Commerce'), actions: [
        IconButton(
            icon: Badge(
                label: unread > 0 ? Text('$unread') : null,
                child: const Icon(Icons.notifications_outlined)),
            onPressed: () => context.push('/notifications')),
        IconButton(
            icon: const Icon(Icons.logout),
            onPressed: () async {
              await ref.read(authStorageProvider).clearTokens();
              ref.read(apiClientProvider).clearAccessToken();
              ref.read(isAuthenticatedProvider.notifier).state = false;
              context.go('/login');
            }),
      ]),
      body: ListView(padding: const EdgeInsets.all(16), children: [
        Text('Welcome back',
            style: Theme.of(context)
                .textTheme
                .headlineSmall
                ?.copyWith(fontWeight: FontWeight.w700)),
        const SizedBox(height: 4),
        Text(ref.watch(currentUserPhoneProvider),
            style: TextStyle(color: TaifTokens.muted)),
        const SizedBox(height: 24),
        _sectionTitle(context, 'Browse'),
        const SizedBox(height: 12),
        Row(children: [
          _navCard(context, 'Search Products', Icons.search, '/search',
              TaifTokens.info),
          const SizedBox(width: 12),
          _navCard(
              context, 'Stores', Icons.storefront, '/stores', TaifTokens.ok),
        ]),
        const SizedBox(height: 12),
        Row(children: [
          _navCard(
              context, 'Cart', Icons.shopping_cart, '/cart', TaifTokens.warn),
          const SizedBox(width: 12),
          _navCard(context, 'My Orders', Icons.receipt_long, '/orders',
              TaifTokens.brandPrimary),
        ]),
        const SizedBox(height: 24),
        _sectionTitle(context, 'Manage'),
        const SizedBox(height: 12),
        Row(children: [
          _navCard(context, 'Merchant Orders', Icons.store, '/merchant/orders',
              const Color(0xFF7C3AED)),
          const SizedBox(width: 12),
          _navCard(context, 'Reviews', Icons.star, '/reviews',
              TaifTokens.brandAccent),
        ]),
      ]),
    );
  }

  Widget _sectionTitle(BuildContext context, String title) => Text(title,
      style: Theme.of(context)
          .textTheme
          .titleMedium
          ?.copyWith(fontWeight: FontWeight.w600));
  Widget _navCard(BuildContext context, String label, IconData icon,
          String route, Color color) =>
      Expanded(
          child: GestureDetector(
              onTap: () => context.push(route),
              child: Card(
                  child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Column(children: [
                        Icon(icon, size: 32, color: color),
                        const SizedBox(height: 8),
                        Text(label,
                            textAlign: TextAlign.center,
                            style: const TextStyle(
                                fontSize: 13, fontWeight: FontWeight.w600))
                      ])))));
}
