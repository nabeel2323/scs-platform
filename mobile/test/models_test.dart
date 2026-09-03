import 'package:flutter_test/flutter_test.dart';
import 'package:scs_platform/models/models.dart';

/// Model parsing tests — verify fromJson handles all fields, nulls, and defaults.
void main() {
  group('Product.fromJson', () {
    test('parses all fields correctly', () {
      final p = Product.fromJson({
        'id': 'p1',
        'storeId': 's1',
        'slug': 'test-product',
        'title': 'Test',
        'status': 'ACTIVE',
        'isAvailable': true,
        'moq': 5,
        'createdAt': '2024-01-01',
        'categoryId': 'c1',
        'brandId': 'b1',
        'titleAr': 'اختبار',
        'description': 'A test product',
        'images': ['img1.jpg'],
        'attributes': {'color': 'red'},
      });
      expect(p.id, 'p1');
      expect(p.storeId, 's1');
      expect(p.moq, 5);
      expect(p.titleAr, 'اختبار');
      expect(p.images, ['img1.jpg']);
      expect(p.attributes['color'], 'red');
    });

    test('handles missing optional fields with defaults', () {
      final p = Product.fromJson({
        'id': 'p2',
        'storeId': '',
        'slug': '',
        'title': '',
        'status': '',
        'isAvailable': false,
        'moq': 0,
        'createdAt': '',
      });
      expect(p.categoryId, isNull);
      expect(p.titleAr, isNull);
      expect(p.images, isEmpty);
      expect(p.attributes, isEmpty);
    });
  });

  group('Store.fromJson', () {
    test('parses orgId correctly', () {
      final s = Store.fromJson({
        'id': 's1',
        'orgId': 'org-1',
        'slug': 'test-store',
        'displayName': 'Test Store',
        'currency': 'SAR',
        'status': 'ACTIVE',
        'verificationStatus': 'VERIFIED',
        'createdAt': '2024-01-01',
      });
      expect(s.orgId, 'org-1');
      expect(s.verificationStatus, 'VERIFIED');
    });
  });

  group('Cart.fromJson', () {
    test('parses cart with items', () {
      final c = Cart.fromJson({
        'id': 'c1',
        'userId': 'u1',
        'status': 'ACTIVE',
        'totalMinor': 5000,
        'items': [
          {
            'id': 'ci1',
            'cartId': 'c1',
            'storeId': 's1',
            'variantId': 'v1',
            'quantity': 3,
            'priceMinor': 1000,
            'tierMinQty': 1,
            'lineTotalMinor': 3000
          },
        ],
      });
      expect(c.items.length, 1);
      expect(c.items[0].quantity, 3);
      expect(c.items[0].lineTotalMinor, 3000);
    });

    test('handles empty items list', () {
      final c = Cart.fromJson(
          {'id': 'c1', 'userId': 'u1', 'status': 'ACTIVE', 'totalMinor': 0});
      expect(c.items, isEmpty);
    });
  });

  group('MasterOrder.fromJson', () {
    test('parses master order with sub-orders', () {
      final mo = MasterOrder.fromJson({
        'id': 'mo1',
        'buyerId': 'b1',
        'status': 'SUBMITTED',
        'deliveryAddress': {'city': 'Riyadh'},
        'createdAt': '2024-01-01',
        'subOrders': [
          {
            'id': 'so1',
            'masterOrderId': 'mo1',
            'storeId': 's1',
            'buyerId': 'b1',
            'status': 'SUBMITTED',
            'fulfillmentMethod': 'PLATFORM_DELIVERY',
            'subtotalMinor': 5000,
            'discountMinor': 0,
            'deliveryFeeMinor': 500,
            'taxMinor': 750,
            'totalMinor': 6250,
            'createdAt': '2024-01-01'
          },
        ],
      });
      expect(mo.subOrders.length, 1);
      expect(mo.subOrders[0].totalMinor, 6250);
      expect(mo.deliveryAddress['city'], 'Riyadh');
    });
  });

  group('UserProfile.fromJson', () {
    test('parses profile with organizations', () {
      final p = UserProfile.fromJson({
        'id': 'u1',
        'phone': '+966500000000',
        'status': 'ACTIVE',
        'createdAt': '2024-01-01',
        'email': 'test@example.com',
        'fullName': 'Ahmed Test',
        'locale': 'ar',
        'activeOrgId': 'org-1',
        'organizations': [
          {
            'orgId': 'org-1',
            'role': 'OWNER',
            'orgName': 'Test Org',
            'orgType': 'MERCHANT'
          },
        ],
      });
      expect(p.fullName, 'Ahmed Test');
      expect(p.activeOrgId, 'org-1');
      expect(p.organizations.length, 1);
      expect(p.organizations[0].orgName, 'Test Org');
      expect(p.organizations[0].role, 'OWNER');
    });

    test('handles missing optional fields', () {
      final p = UserProfile.fromJson({
        'id': 'u2',
        'phone': '+966500000001',
        'status': 'ACTIVE',
        'createdAt': '',
      });
      expect(p.email, isNull);
      expect(p.fullName, isNull);
      expect(p.organizations, isEmpty);
    });
  });

  group('Organization.fromJson', () {
    test('parses all fields', () {
      final o = Organization.fromJson({
        'id': 'org-1',
        'name': 'Test Org',
        'type': 'MERCHANT',
        'country': 'SA',
        'createdAt': '2024-01-01',
        'legalName': 'Test LLC',
        'taxId': '123456',
      });
      expect(o.name, 'Test Org');
      expect(o.legalName, 'Test LLC');
      expect(o.taxId, '123456');
    });
  });

  group('OrgMember.fromJson', () {
    test('parses member correctly', () {
      final m = OrgMember.fromJson({
        'userId': 'u1',
        'orgId': 'org-1',
        'roleId': 'OWNER',
        'userName': 'Ahmed',
        'userEmail': 'ahmed@test.com',
      });
      expect(m.userName, 'Ahmed');
      expect(m.roleId, 'OWNER');
      expect(m.userEmail, 'ahmed@test.com');
    });
  });

  group('formatMinor', () {
    test('formats SAR correctly', () {
      expect(formatMinor(1050), '10.50 SAR');
      expect(formatMinor(0), '0.00 SAR');
      expect(formatMinor(100), '1.00 SAR');
    });

    test('supports custom currency', () {
      expect(formatMinor(1050, 'USD'), '10.50 USD');
    });
  });
}
