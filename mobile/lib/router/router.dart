import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../providers/providers.dart';
import '../screens/auth/login_screen.dart';
import '../screens/auth/credential_setup_screen.dart';
import '../screens/auth/change_password_screen.dart';
import '../screens/auth/sessions_screen.dart';
import '../screens/home/home_screen.dart';
import '../screens/search/search_screen.dart';
import '../screens/stores/stores_list_screen.dart';
import '../screens/stores/store_detail_screen.dart';
import '../screens/products/product_detail_screen.dart';
import '../screens/cart/cart_screen.dart';
import '../screens/cart/checkout_screen.dart';
import '../screens/orders/orders_list_screen.dart';
import '../screens/orders/order_detail_screen.dart';
import '../screens/notifications/notifications_screen.dart';
import '../screens/merchant/merchant_orders_screen.dart';
import '../screens/merchant/merchant_registration_screen.dart';
import '../screens/merchant/merchant_dashboard_screen.dart';
import '../screens/merchant/store_profile_screen.dart';
import '../screens/merchant/merchant_catalog_screen.dart';
import '../screens/merchant/product_edit_screen.dart';
import '../screens/merchant/category_manage_screen.dart';
import '../screens/merchant/merchant_customers_screen.dart';
import '../screens/reviews/reviews_disputes_screen.dart';
import '../screens/profile/profile_screen.dart';
import '../screens/organizations/organizations_screen.dart';
import '../screens/organizations/org_detail_screen.dart';
import '../screens/driver/driver_dashboard_screen.dart';

final routerProvider = Provider<GoRouter>((ref) {
  final isLoggedIn = ref.watch(isAuthenticatedProvider);
  return GoRouter(
    initialLocation: isLoggedIn ? '/home' : '/login',
    redirect: (context, state) {
      final loggedIn = ref.read(isAuthenticatedProvider);
      final goingToLogin = state.matchedLocation == '/login';
      if (!loggedIn && !goingToLogin) return '/login';
      if (loggedIn && goingToLogin) return '/home';

      // Role-based route protection (GAP-1 remediation).
      // profileProvider is a FutureProvider; during initial load maybeWhen
      // returns null so the redirect does not fire until the profile arrives.
      if (loggedIn) {
        final profileAsync = ref.read(profileProvider);
        final role = profileAsync.maybeWhen(
          data: (p) => p.role,
          orElse: () => null,
        );
        final isMerchant = role == 'MERCHANT_OWNER' || role == 'MERCHANT_STAFF';
        final path = state.matchedLocation;

        // Merchant routes require merchant role, except /merchant/register
        // which is open so any authenticated user can become a merchant.
        if (path.startsWith('/merchant') &&
            path != '/merchant/register' &&
            !isMerchant) {
          return '/home';
        }
        // Driver route hidden until DRIVER role exists (GAP-7).
        if (path.startsWith('/driver')) {
          return '/home';
        }
      }
      return null;
    },
    routes: [
      GoRoute(path: '/login', builder: (_, __) => const LoginScreen()),
      GoRoute(path: '/home', builder: (_, __) => const HomeScreen()),
      GoRoute(path: '/search', builder: (_, __) => const SearchScreen()),
      GoRoute(path: '/stores', builder: (_, __) => const StoresListScreen()),
      GoRoute(
          path: '/stores/:id',
          builder: (_, state) =>
              StoreDetailScreen(storeId: state.pathParameters['id']!)),
      GoRoute(
          path: '/products/:id',
          builder: (_, state) =>
              ProductDetailScreen(productId: state.pathParameters['id']!)),
      GoRoute(path: '/cart', builder: (_, __) => const CartScreen()),
      GoRoute(path: '/checkout', builder: (_, __) => const CheckoutScreen()),
      GoRoute(path: '/orders', builder: (_, __) => const OrdersListScreen()),
      GoRoute(
          path: '/orders/:id',
          builder: (_, state) =>
              OrderDetailScreen(orderId: state.pathParameters['id']!)),
      GoRoute(
          path: '/notifications',
          builder: (_, __) => const NotificationsScreen()),
      GoRoute(
          path: '/merchant/orders',
          builder: (_, __) => const MerchantOrdersScreen()),
      GoRoute(
          path: '/merchant/register',
          builder: (_, __) => const MerchantRegistrationScreen()),
      GoRoute(
          path: '/merchant',
          builder: (_, __) => const MerchantDashboardScreen()),
      GoRoute(
          path: '/merchant/store',
          builder: (_, __) => const StoreProfileScreen()),
      GoRoute(
          path: '/merchant/catalog',
          builder: (_, __) => const MerchantCatalogScreen()),
      GoRoute(
          path: '/merchant/catalog/new',
          builder: (_, __) => const ProductEditScreen()),
      GoRoute(
          path: '/merchant/catalog/product/:id',
          builder: (_, state) =>
              ProductEditScreen(productId: state.pathParameters['id']!)),
      GoRoute(
          path: '/merchant/categories',
          builder: (_, __) => const CategoryManageScreen()),
      GoRoute(
          path: '/merchant/customers',
          builder: (_, __) => const MerchantCustomersScreen()),
      GoRoute(
          path: '/reviews', builder: (_, __) => const ReviewsDisputesScreen()),
      GoRoute(path: '/profile', builder: (_, __) => const ProfileScreen()),
      GoRoute(
          path: '/profile/credentials',
          builder: (_, __) => const CredentialSetupScreen()),
      GoRoute(
          path: '/profile/change-password',
          builder: (_, __) => const ChangePasswordScreen()),
      GoRoute(
          path: '/profile/sessions',
          builder: (_, __) => const SessionsScreen()),
      GoRoute(
          path: '/organizations',
          builder: (_, __) => const OrganizationsScreen()),
      GoRoute(
          path: '/organizations/:id',
          builder: (_, state) =>
              OrgDetailScreen(orgId: state.pathParameters['id']!)),
      GoRoute(
          path: '/driver', builder: (_, __) => const DriverDashboardScreen()),
    ],
  );
});
