import 'package:flutter/material.dart';
import '../../core/theme.dart';
import '../profile/profile_screen.dart';
import 'inventory_screen.dart';
import 'merchant_catalog_screen.dart';
import 'merchant_dashboard_screen.dart';
import 'merchant_orders_screen.dart';

/// The five merchant console tabs. Declaration order == NavigationBar order ==
/// IndexedStack child order, so [MerchantTab.index] is the stack index.
enum MerchantTab { dashboard, orders, catalog, inventory, account }

/// Merchant console shell (audit row 64 / spec §4.5 — the merchant tab-shell
/// deferred from the buyer navigation pass). A single `/merchant` route hosts an
/// [IndexedStack] of the five management screens under a [NavigationBar], so a
/// merchant moves between Dashboard / Orders / Catalog / Inventory / Account
/// without re-pushing routes or losing each tab's scroll + filter state.
///
/// Deliberately an internal IndexedStack, NOT a go_router StatefulShellRoute:
/// the merchant area is entered by *pushing* `/merchant` on top of the buyer
/// shell, and nesting a second stateful shell inside the first is fragile and
/// cannot be UI-verified here. Each child keeps its own Scaffold + AppBar (so
/// the title tracks the active tab); this shell supplies only the bottom bar.
/// Sections that are not tabs (store profile, categories, customers, product
/// editor, registration) still push full-screen from the dashboard grid.
///
/// Caveat: like the buyer IndexedStack shell, all five tabs build eagerly on
/// mount, so their store-scoped providers (orders, catalog, inventory, KPIs)
/// fire together the first time the console opens. That is acceptable for a
/// merchant console — the data is related and Riverpod caches it — but it is
/// not lazy.
class MerchantShellScreen extends StatefulWidget {
  const MerchantShellScreen(
      {super.key, this.initialTab = MerchantTab.dashboard});

  final MerchantTab initialTab;

  /// Maps a `/merchant?tab=<key>` deep-link value to a tab; unknown or absent
  /// keys fall back to the dashboard. Lets the buyer Home launchers and any
  /// notification deep link open a specific tab without adding new routes.
  static MerchantTab tabFromKey(String? key) => switch (key) {
        'orders' => MerchantTab.orders,
        'catalog' => MerchantTab.catalog,
        'inventory' => MerchantTab.inventory,
        'account' => MerchantTab.account,
        _ => MerchantTab.dashboard,
      };

  @override
  State<MerchantShellScreen> createState() => _MerchantShellScreenState();
}

class _MerchantShellScreenState extends State<MerchantShellScreen> {
  late int _index = widget.initialTab.index;

  void _select(int i) {
    if (i != _index) setState(() => _index = i);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: IndexedStack(
        index: _index,
        children: [
          // The dashboard switches tabs (Catalog / Inventory / Orders) through
          // this callback instead of pushing standalone routes.
          MerchantDashboardScreen(
              onOpenSection: (key) =>
                  _select(MerchantShellScreen.tabFromKey(key).index)),
          const MerchantOrdersScreen(),
          const MerchantCatalogScreen(),
          const InventoryScreen(),
          // Reuse the buyer Account screen, minus its "Merchant Dashboard"
          // entry, which would otherwise recursively push this same shell.
          const ProfileScreen(hideMerchantEntry: true),
        ],
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _index,
        onDestinationSelected: _select,
        backgroundColor: TaifTokens.surface,
        indicatorColor: TaifTokens.brandPrimary.withValues(alpha: 0.12),
        destinations: const [
          NavigationDestination(
            icon: Icon(Icons.dashboard_outlined),
            selectedIcon: Icon(Icons.dashboard),
            label: 'Dashboard',
          ),
          NavigationDestination(
            icon: Icon(Icons.receipt_long_outlined),
            selectedIcon: Icon(Icons.receipt_long),
            label: 'Orders',
          ),
          NavigationDestination(
            icon: Icon(Icons.inventory_2_outlined),
            selectedIcon: Icon(Icons.inventory_2),
            label: 'Catalog',
          ),
          NavigationDestination(
            icon: Icon(Icons.warehouse_outlined),
            selectedIcon: Icon(Icons.warehouse),
            label: 'Inventory',
          ),
          NavigationDestination(
            icon: Icon(Icons.person_outline),
            selectedIcon: Icon(Icons.person),
            label: 'Account',
          ),
        ],
      ),
    );
  }
}
