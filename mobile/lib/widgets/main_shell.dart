import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../core/theme.dart';
import '../providers/providers.dart';

/// Persistent buyer navigation shell (spec §1.3 / §4 — the buyer model
/// Home / Search / Cart / Orders / Account that the audit flagged as missing).
///
/// Wraps a go_router [StatefulShellRoute.indexedStack]: each tab keeps its own
/// navigation stack and state, so switching tabs never rebuilds or loses the
/// previous one. Detail routes (`/products/:id`, `/stores/:id`, `/orders/:id`,
/// `/checkout`, …) are declared *outside* the shell and push full-screen on top.
///
/// The merchant tab-shell is intentionally NOT built here; merchant screens are
/// converted in the Phase 4 merchant pass so their AppBars/back-handling can be
/// made tab-coherent at the same time. Merchants still reach their dashboard
/// from the role-gated Home "Manage" section and the Account tab.
class MainShell extends ConsumerWidget {
  const MainShell({super.key, required this.navigationShell});

  final StatefulNavigationShell navigationShell;

  /// Switch to a branch. Tapping the already-active tab pops it to its root
  /// (standard bottom-nav behaviour) via `initialLocation`.
  void _goBranch(int index) {
    navigationShell.goBranch(
      index,
      initialLocation: index == navigationShell.currentIndex,
    );
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // Live item count for the Cart tab badge. cartProvider is autoDispose, so
    // watching it here also keeps it alive for as long as the shell is mounted.
    final cartCount = ref.watch(cartProvider).valueOrNull?.items.length ?? 0;

    return Scaffold(
      body: navigationShell,
      bottomNavigationBar: NavigationBar(
        selectedIndex: navigationShell.currentIndex,
        onDestinationSelected: _goBranch,
        backgroundColor: TaifTokens.surface,
        indicatorColor: TaifTokens.brandPrimary.withValues(alpha: 0.12),
        destinations: [
          const NavigationDestination(
            icon: Icon(Icons.home_outlined),
            selectedIcon: Icon(Icons.home),
            label: 'Home',
          ),
          const NavigationDestination(
            icon: Icon(Icons.search),
            label: 'Search',
          ),
          NavigationDestination(
            icon: Badge(
              isLabelVisible: cartCount > 0,
              label: Text(cartCount > 99 ? '99+' : '$cartCount'),
              backgroundColor: TaifTokens.brandAccent,
              child: const Icon(Icons.shopping_cart_outlined),
            ),
            selectedIcon: Badge(
              isLabelVisible: cartCount > 0,
              label: Text(cartCount > 99 ? '99+' : '$cartCount'),
              backgroundColor: TaifTokens.brandAccent,
              child: const Icon(Icons.shopping_cart),
            ),
            label: 'Cart',
          ),
          const NavigationDestination(
            icon: Icon(Icons.receipt_long_outlined),
            selectedIcon: Icon(Icons.receipt_long),
            label: 'Orders',
          ),
          const NavigationDestination(
            icon: Icon(Icons.person_outline),
            selectedIcon: Icon(Icons.person),
            label: 'Account',
          ),
        ],
      ),
    );
  }
}
