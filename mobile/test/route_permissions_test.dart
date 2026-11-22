import 'package:flutter_test/flutter_test.dart';
import 'package:scs_platform/models/models.dart';
import 'package:scs_platform/router/route_permissions.dart';

void main() {
  group('UserProfile permission projection', () {
    test('parses server permissions and exposes exact/any/all helpers', () {
      final profile = UserProfile.fromJson({
        'id': 'user-1',
        'status': 'ACTIVE',
        'createdAt': '2026-11-22T00:00:00.000Z',
        'role': 'MERCHANT_STAFF',
        'perms': ['merchant:orders:read', 'merchant:orders:write'],
      });
      expect(profile.hasPermission('merchant:orders:read'), isTrue);
      expect(profile.hasPermission('admin:returns:write'), isFalse);
      expect(profile.hasAnyPermission(['merchant:stores:read', 'merchant:orders:read']), isTrue);
      expect(profile.hasAllPermissions(['merchant:orders:read', 'merchant:orders:write']), isTrue);
      expect(profile.hasAllPermissions(['merchant:orders:read', 'admin:users:write']), isFalse);
    });

    test('defaults missing permission lists to empty', () {
      final profile = UserProfile.fromJson({
        'id': 'user-2',
        'status': 'ACTIVE',
        'createdAt': '2026-11-22T00:00:00.000Z',
      });
      expect(profile.perms, isEmpty);
      expect(profile.hasPermission('orders:write'), isFalse);
    });
  });

  group('Mobile route permission policy', () {
    test('protects product and search routes with catalog read access', () {
      expect(permissionRuleForRoute(Uri.parse('/search'))?.allows(['catalog:products:read']), isTrue);
      expect(permissionRuleForRoute(Uri.parse('/products/product-1'))?.allows(['orders:read']), isFalse);
      expect(permissionRuleForRoute(Uri.parse('/products/product-1'))?.missingRequirements([]), ['catalog:products:read']);
    });

    test('protects cart and checkout with order write access', () {
      expect(permissionRuleForRoute(Uri.parse('/cart'))?.allows(['orders:write']), isTrue);
      expect(permissionRuleForRoute(Uri.parse('/checkout'))?.allows(['orders:read']), isFalse);
    });

    test('merchant deep links use the selected tab permission', () {
      expect(permissionRuleForRoute(Uri.parse('/merchant?tab=orders'))?.allows(['merchant:orders:read']), isTrue);
      expect(permissionRuleForRoute(Uri.parse('/merchant?tab=inventory'))?.allows(['merchant:orders:read']), isFalse);
      expect(permissionRuleForRoute(Uri.parse('/merchant'))?.allows(['merchant:stores:read']), isTrue);
    });

    test('merchant category directory is read-only for merchant roles', () {
      expect(
        permissionRuleForRoute(Uri.parse('/merchant/categories'))
            ?.allows(['catalog:categories:read']),
        isTrue,
      );
      expect(
        permissionRuleForRoute(Uri.parse('/merchant/categories'))
            ?.allows(['catalog:categories:write']),
        isFalse,
      );
      expect(
        canManageMerchantCategories('MERCHANT_OWNER', ['catalog:categories:write']),
        isFalse,
      );
      expect(
        canManageMerchantCategories('MERCHANT_STAFF', ['catalog:categories:write']),
        isFalse,
      );
      expect(
        canManageMerchantCategories('MODERATOR', ['catalog:categories:write']),
        isTrue,
      );
    });

    test('driver route requires shipment read access', () {
      expect(permissionRuleForRoute(Uri.parse('/driver/shipments'))?.allows(['fulfillment:shipments:read']), isTrue);
      expect(permissionRuleForRoute(Uri.parse('/driver/shipments'))?.allows(['orders:read']), isFalse);
    });

    test('self-service and onboarding routes remain membership/auth scoped', () {
      expect(permissionRuleForRoute(Uri.parse('/profile')), isNull);
      expect(permissionRuleForRoute(Uri.parse('/organizations')), isNull);
      expect(permissionRuleForRoute(Uri.parse('/merchant/register')), isNull);
    });
  });
}
