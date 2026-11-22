import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/theme.dart';
import '../../models/models.dart';
import '../../providers/providers.dart';
import '../profile/profile_screen.dart';
import 'inventory_screen.dart';
import 'merchant_catalog_screen.dart';
import 'merchant_dashboard_screen.dart';
import 'merchant_orders_screen.dart';

enum MerchantTab { dashboard, orders, catalog, inventory, account }

class MerchantShellScreen extends ConsumerStatefulWidget {
  const MerchantShellScreen({super.key, this.initialTab = MerchantTab.dashboard});
  final MerchantTab initialTab;

  static MerchantTab tabFromKey(String? key) => switch (key) {
        'orders' => MerchantTab.orders,
        'catalog' => MerchantTab.catalog,
        'inventory' => MerchantTab.inventory,
        'account' => MerchantTab.account,
        _ => MerchantTab.dashboard,
      };

  @override
  ConsumerState<MerchantShellScreen> createState() => _MerchantShellScreenState();
}

class _MerchantShellScreenState extends ConsumerState<MerchantShellScreen> {
  late MerchantTab _selectedTab = widget.initialTab;

  List<MerchantTab> _visibleTabs(UserProfile profile) => [
        if (profile.hasPermission('merchant:stores:read')) MerchantTab.dashboard,
        if (profile.hasPermission('merchant:orders:read')) MerchantTab.orders,
        if (profile.hasPermission('catalog:products:read')) MerchantTab.catalog,
        if (profile.hasPermission('merchant:inventory:read')) MerchantTab.inventory,
        MerchantTab.account,
      ];

  NavigationDestination _destination(MerchantTab tab) => switch (tab) {
        MerchantTab.dashboard => const NavigationDestination(icon: Icon(Icons.dashboard_outlined), selectedIcon: Icon(Icons.dashboard), label: 'Dashboard'),
        MerchantTab.orders => const NavigationDestination(icon: Icon(Icons.receipt_long_outlined), selectedIcon: Icon(Icons.receipt_long), label: 'Orders'),
        MerchantTab.catalog => const NavigationDestination(icon: Icon(Icons.inventory_2_outlined), selectedIcon: Icon(Icons.inventory_2), label: 'Catalog'),
        MerchantTab.inventory => const NavigationDestination(icon: Icon(Icons.warehouse_outlined), selectedIcon: Icon(Icons.warehouse), label: 'Inventory'),
        MerchantTab.account => const NavigationDestination(icon: Icon(Icons.person_outline), selectedIcon: Icon(Icons.person), label: 'Account'),
      };

  Widget _screen(MerchantTab tab, List<MerchantTab> visibleTabs) => switch (tab) {
        MerchantTab.dashboard => MerchantDashboardScreen(
            onOpenSection: (key) {
              final target = MerchantShellScreen.tabFromKey(key);
              if (visibleTabs.contains(target)) setState(() => _selectedTab = target);
            },
          ),
        MerchantTab.orders => const MerchantOrdersScreen(),
        MerchantTab.catalog => const MerchantCatalogScreen(),
        MerchantTab.inventory => const InventoryScreen(),
        MerchantTab.account => const ProfileScreen(hideMerchantEntry: true),
      };

  @override
  Widget build(BuildContext context) {
    final activeOrgId = ref.watch(activeOrgIdProvider);
    ref.listen(activeOrgIdProvider, (previous, next) {
      if (previous != next) setState(() => _selectedTab = widget.initialTab);
    });
    final profile = ref.watch(profileProvider).valueOrNull;
    if (profile == null) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }
    final tabs = _visibleTabs(profile);
    final selectedTab = tabs.contains(_selectedTab) ? _selectedTab : tabs.first;
    final selectedIndex = tabs.indexOf(selectedTab);
    final permissionKey = (profile.perms.toList()..sort()).join(',');
    final scopeKey = '${activeOrgId ?? 'none'}:$permissionKey';
    return Scaffold(
      body: KeyedSubtree(
        key: ValueKey(scopeKey),
        child: IndexedStack(
          index: selectedIndex,
          children: tabs.map((tab) => _screen(tab, tabs)).toList(),
        ),
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: selectedIndex,
        onDestinationSelected: (index) => setState(() => _selectedTab = tabs[index]),
        backgroundColor: TaifTokens.surface,
        indicatorColor: TaifTokens.brandPrimary.withValues(alpha: 0.12),
        destinations: tabs.map(_destination).toList(),
      ),
    );
  }
}
