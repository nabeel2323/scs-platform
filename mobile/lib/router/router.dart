import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../providers/providers.dart';
import '../screens/auth/otp_request_screen.dart';
import '../screens/auth/otp_verify_screen.dart';
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
      return null;
    },
    routes: [
      GoRoute(path: '/login', builder: (_, __) => const OtpRequestScreen()),
      GoRoute(
          path: '/verify/:phone',
          builder: (_, state) =>
              OtpVerifyScreen(phone: state.pathParameters['phone']!)),
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
          path: '/reviews', builder: (_, __) => const ReviewsDisputesScreen()),
      GoRoute(path: '/profile', builder: (_, __) => const ProfileScreen()),
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
