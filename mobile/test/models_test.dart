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

  group('Product listing enrichment', () {
    // The seller and price a search or store-grid card shows (A5-2/A5-7 parity).
    Product listed([Map<String, dynamic> extra = const {}]) =>
        Product.fromJson({
          'id': 'p1',
          'storeId': 's1',
          'slug': 'rice',
          'title': 'Rice',
          'status': 'ACTIVE',
          'isAvailable': true,
          'moq': 10,
          'createdAt': '2024-01-01',
          ...extra,
        });

    test('parses the seller and price a search result carries', () {
      final p = listed({
        'store': {
          'id': 's1',
          'name': 'Al Noor Trading',
          'slug': 'al-noor',
          'verificationStatus': 'VERIFIED',
          'currency': 'SAR',
        },
        'priceFromMinor': 850,
        'priceCurrency': 'SAR',
      });
      expect(p.store?.name, 'Al Noor Trading');
      expect(p.store?.isVerified, isTrue);
      expect(p.priceLabel, '8.50 SAR');
    });

    test('reads displayName from the product detail projection', () {
      // GET /v1/products/:id sends both names, a listing only `name`.
      final p = listed({
        'store': {
          'id': 's1',
          'displayName': 'Al Noor Trading',
          'slug': 'al-noor',
          'verificationStatus': 'PENDING',
          'currency': 'AED',
        },
        'priceFromMinor': 990,
        'priceCurrency': 'AED',
      });
      expect(p.store?.name, 'Al Noor Trading');
      expect(p.store?.isVerified, isFalse);
      expect(p.priceLabel, '9.90 AED');
    });

    test('says price on request rather than inventing one', () {
      // Null is what the API returns when no active price list covers the MOQ,
      // and the cart rejects such a line — showing 0.00 would be a false quote.
      expect(listed().priceLabel, 'Price on request');
      expect(listed({'priceFromMinor': null, 'priceCurrency': null}).priceLabel,
          'Price on request');
    });

    test('falls back to the seller currency when the price has none', () {
      final p = listed({
        'store': {
          'id': 's1',
          'name': 'X',
          'slug': 'x',
          'verificationStatus': 'VERIFIED',
          'currency': 'USD',
        },
        'priceFromMinor': 500,
      });
      expect(p.priceLabel, '5.00 USD');
    });

    test('leaves the seller absent on endpoints that do not enrich', () {
      // A merchant's own product list is not enriched; its card must not render
      // an empty seller row.
      final p = listed();
      expect(p.store, isNull);
      expect(p.priceFromMinor, isNull);
    });
  });

  group('Product.imageUrl', () {
    // A5-9: the JSONB column holds URL strings, but nothing constrains it to.
    Product withImages(List<dynamic> images) => Product.fromJson({
          'id': 'p',
          'storeId': 's',
          'slug': '',
          'title': 't',
          'status': 'ACTIVE',
          'isAvailable': true,
          'moq': 1,
          'createdAt': '',
          'images': images,
        });

    test('reads a bare URL string, which is what the contract declares', () {
      expect(withImages(['https://cdn/x.jpg']).imageUrl, 'https://cdn/x.jpg');
    });

    test('still reads a legacy object carrying url', () {
      expect(
          withImages([
            {'url': 'https://cdn/old.jpg'}
          ]).imageUrl,
          'https://cdn/old.jpg');
    });

    test('returns null rather than a src the browser cannot load', () {
      expect(withImages([]).imageUrl, isNull);
      expect(withImages(['']).imageUrl, isNull);
      expect(
          withImages([
            {'url': ''}
          ]).imageUrl,
          isNull);
      expect(
          withImages([
            {'thumb': 'https://cdn/x.jpg'}
          ]).imageUrl,
          isNull);
    });
  });

  group('Product.orderableVariant', () {
    // addProductToCart resolves the line through this, because the cart's
    // variant_id is a foreign key to product_variants (A5-12).
    Product detail(List<Map<String, dynamic>> variants) => Product.fromJson({
          'id': 'p',
          'storeId': 's',
          'slug': '',
          'title': 't',
          'status': 'ACTIVE',
          'isAvailable': true,
          'moq': 2,
          'createdAt': '',
          'variants': variants,
        });

    test('skips variants the seller deactivated', () {
      final p = detail([
        {'id': 'v-off', 'isActive': false, 'sku': 'A'},
        {'id': 'v-on', 'isActive': true, 'sku': 'B', 'priceMinor': 900},
      ]);
      expect(p.orderableVariant?.id, 'v-on');
      expect(p.variants.first.priceMinor, isNull);
    });

    test('is null when nothing is purchasable', () {
      expect(detail([]).orderableVariant, isNull);
      expect(
          detail([
            {'id': 'v-off', 'isActive': false}
          ]).orderableVariant,
          isNull);
    });
  });

  group('ReorderResult', () {
    // A4-7 parity: the endpoint re-adds line by line, so a partial reorder has
    // to say so instead of landing the buyer on a thinner cart.
    test('names the first skip and counts the rest', () {
      final r = ReorderResult.fromJson({
        'masterOrderId': 'm1',
        'added': [
          {'title': 'Rice', 'quantity': 10}
        ],
        'skipped': [
          {'title': 'Oil', 'reason': 'No longer available'},
          {'title': 'Salt', 'reason': 'No price tier'},
        ],
      });
      expect(r.total, 3);
      expect(r.summary, 'Added 1 of 3 — Oil: No longer available (+1 more)');
    });

    test('is explicit when nothing came back', () {
      final r = ReorderResult.fromJson({
        'masterOrderId': 'm1',
        'added': <dynamic>[],
        'skipped': [
          {'title': 'Oil', 'reason': 'Delisted'}
        ],
      });
      expect(r.summary, 'Nothing could be re-ordered — Oil: Delisted');
    });

    test('reads a clean reorder without mentioning skips', () {
      final r = ReorderResult.fromJson({
        'masterOrderId': 'm1',
        'added': [
          {'title': 'Rice', 'quantity': 10},
          {'title': 'Oil', 'quantity': 5},
        ],
        'skipped': <dynamic>[],
      });
      expect(r.summary, 'Added 2 items to your cart');
    });

    test('handles an absent body and a single item', () {
      // `added`/`skipped` default to empty rather than throwing, because a 200
      // with an unexpected shape still has to render something.
      expect(ReorderResult.fromJson({'masterOrderId': 'm'}).summary,
          'That order had no items to re-order');
      final one = ReorderResult.fromJson({
        'masterOrderId': 'm',
        'added': [
          {'title': 'Rice', 'quantity': 10}
        ],
      });
      expect(one.summary, 'Added 1 item to your cart');
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

  group('SearchResult.fromJson', () {
    // A5-7: the search endpoint returns its hits under `items`, never `products`.
    test('reads hits from the items key', () {
      final r = SearchResult.fromJson({
        'items': [
          {
            'id': 'p1',
            'storeId': 's1',
            'slug': 'rice',
            'title': 'Rice',
            'status': 'ACTIVE',
            'isAvailable': true,
            'moq': 10,
            'createdAt': '2024-01-01'
          }
        ],
        'total': 1,
        'matchType': 'fuzzy',
        'query': 'rice',
      });
      expect(r.products.length, 1);
      expect(r.products.first.id, 'p1');
      expect(r.total, 1);
    });

    test('ignores a products key so a contract change cannot pass silently',
        () {
      final r = SearchResult.fromJson({
        'products': [
          {
            'id': 'p1',
            'storeId': 's1',
            'slug': 'rice',
            'title': 'Rice',
            'status': 'ACTIVE',
            'isAvailable': true,
            'moq': 10,
            'createdAt': '2024-01-01'
          }
        ],
        'total': 1,
        'query': 'rice',
      });
      expect(r.products, isEmpty);
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

    test('falls back to SAR only when no currency was reported', () {
      // A2-4: callers forward `order.currency` untouched, so the fallback has to
      // live in the formatter rather than at every call site.
      expect(formatMinor(1050, null), '10.50 SAR');
    });
  });

  group('SubOrder money identity', () {
    test('reads seller, currency and line count from a list response', () {
      // GET /v1/orders returns orders without their lines, so the server ships
      // the count and the identity alongside them (A4-6, A5-16).
      final o = SubOrder.fromJson({
        'id': 'a1b2c3d4-0000-0000-0000-000000000001',
        'storeId': 'store-1',
        'status': 'DELIVERED',
        'totalMinor': 4500,
        'storeName': 'Emirates Fresh',
        'storeSlug': 'emirates-fresh',
        'currency': 'AED',
        'currencyFromSnapshot': true,
        'itemCount': 3,
      });
      expect(o.storeName, 'Emirates Fresh');
      expect(o.storeSlug, 'emirates-fresh');
      expect(o.currency, 'AED');
      expect(o.currencyFromSnapshot, isTrue);
      expect(o.itemCount, 3);
      expect(formatMinor(o.totalMinor, o.currency), '45.00 AED');
    });

    test('counts the embedded lines of a detail response', () {
      final o = SubOrder.fromJson({
        'id': 'a1b2c3d4-0000-0000-0000-000000000002',
        'currency': 'SAR',
        'currencyFromSnapshot': true,
        'items': [
          {'id': 'i1', 'title': 'Flour', 'quantity': 5, 'lineTotalMinor': 1000},
          {'id': 'i2', 'title': 'Rice', 'quantity': 2, 'lineTotalMinor': 900},
        ],
      });
      expect(o.itemCount, 2);
      expect(o.items.length, 2);
    });

    test('a legacy row reports no snapshot instead of inventing one', () {
      final o = SubOrder.fromJson({
        'id': 'a1b2c3d4-0000-0000-0000-000000000003',
        'totalMinor': 1200,
      });
      expect(o.currency, isNull);
      expect(o.currencyFromSnapshot, isFalse);
      expect(o.storeName, isNull);
      expect(o.itemCount, 0);
      // The screen must still print something, and the formatter's documented
      // default is what the platform seeded stores with.
      expect(formatMinor(o.totalMinor, o.currency), '12.00 SAR');
    });
  });

  group('MasterOrder totals by currency', () {
    test('keeps each currency separate when suppliers disagree', () {
      final m = MasterOrder.fromJson({
        'id': 'master-1',
        'status': 'SUBMITTED',
        'createdAt': '2026-09-01T00:00:00Z',
        'currency': null,
        'totalsByCurrency': {'SAR': 1200, 'AED': 4500},
        'subOrders': [
          {'id': 's1', 'currency': 'SAR', 'totalMinor': 1200},
          {'id': 's2', 'currency': 'AED', 'totalMinor': 4500},
        ],
      });
      expect(m.currency, isNull);
      expect(m.totalsByCurrency, {'SAR': 1200, 'AED': 4500});
      expect(m.subOrders[1].currency, 'AED');
    });

    test('parses a sole currency and absent aggregates', () {
      final m = MasterOrder.fromJson({
        'id': 'master-2',
        'status': 'SUBMITTED',
        'currency': 'SAR',
        'totalsByCurrency': {'SAR': 3000},
      });
      expect(m.currency, 'SAR');
      expect(m.totalsByCurrency['SAR'], 3000);
      expect(m.subOrders, isEmpty);
    });

    test('defaults to an empty map when the API sends none', () {
      final m = MasterOrder.fromJson({'id': 'master-3', 'status': 'DRAFT'});
      expect(m.totalsByCurrency, isEmpty);
      expect(m.currency, isNull);
    });
  });

  group('CartItem currency', () {
    test('parses the supplier currency projected onto each line', () {
      final item = CartItem.fromJson({
        'id': 'ci-1',
        'cartId': 'c-1',
        'storeId': 's-1',
        'variantId': 'v-1',
        'quantity': 10,
        'priceMinor': 250,
        'tierMinQty': 10,
        'lineTotalMinor': 2500,
        'storeName': 'Emirates Fresh',
        'currency': 'AED',
      });
      expect(item.currency, 'AED');
      expect(formatMinor(item.lineTotalMinor, item.currency), '25.00 AED');
    });

    test('stays null on an unenriched line', () {
      final item = CartItem.fromJson({
        'id': 'ci-2',
        'cartId': 'c-1',
        'storeId': 's-1',
        'variantId': 'v-1',
      });
      expect(item.currency, isNull);
    });
  });

  group('OfferAnalyticsRow.fromJson', () {
    test('parses the analytics contract, including the id→offerId rename', () {
      final r = OfferAnalyticsRow.fromJson({
        'offerId': 'off-1',
        'storeId': 's-1',
        'productId': 'p-1',
        'variantId': 'v-1',
        'status': 'ACTIVE',
        'currency': 'AED',
        'basePriceMinor': 250,
        'moq': 10,
        'leadTimeDays': 3,
        'createdAt': '2024-01-01T00:00:00.000Z',
        'productTitle': 'Emirates Fresh Dates',
        'variantSku': 'EFD-1KG',
        'variantTitle': '1kg box',
        'ordersCount': 4,
        'unitsSold': 40,
        'revenueMinor': 10000,
      });
      // The server renames the offer's `id` to `offerId`; an `id`-based parse
      // would silently yield an empty offerId, so pin the real field name.
      expect(r.offerId, 'off-1');
      expect(r.variantSku, 'EFD-1KG');
      expect(r.currency, 'AED');
      expect(r.unitsSold, 40);
      expect(r.revenueMinor, 10000);
      expect(formatMinor(r.revenueMinor, r.currency), '100.00 AED');
    });

    test('coerces numeric aggregates and defaults absent optionals to null',
        () {
      final r = OfferAnalyticsRow.fromJson({
        'offerId': 'off-2',
        'storeId': 's-1',
        'productId': 'p-2',
        'status': 'DRAFT',
        'currency': 'SAR',
        // A zero-sale offer: the SQL SUM can surface aggregates as doubles.
        'unitsSold': 0.0,
        'revenueMinor': 0.0,
      });
      expect(r.unitsSold, 0);
      expect(r.revenueMinor, 0);
      expect(r.ordersCount, 0);
      expect(r.variantId, isNull);
      expect(r.productTitle, isNull);
      expect(r.basePriceMinor, isNull);
    });
  });

  group('MerchantOffer.fromJson', () {
    test('parses all fields from backend Drizzle row', () {
      final o = MerchantOffer.fromJson({
        'id': 'offer-1',
        'storeId': 'store-1',
        'productId': 'prod-1',
        'variantId': 'var-1',
        'status': 'DRAFT',
        'currency': 'SAR',
        'basePriceMinor': 350000,
        'compareAtPriceMinor': 400000,
        'moq': 5,
        'orderIncrement': 1,
        'leadTimeDays': 3,
        'isAvailable': true,
        'priceListId': 'pl-1',
        'warehouseId': 'wh-1',
        'externalRef': 'EXT-001',
        'proposedBy': 'user-1',
        'reviewedBy': null,
        'reviewedAt': null,
        'rejectionReason': null,
        'activatedAt': null,
        'createdAt': '2025-01-01T00:00:00Z',
        'updatedAt': '2025-01-01T00:00:00Z',
      });
      expect(o.id, 'offer-1');
      expect(o.storeId, 'store-1');
      expect(o.productId, 'prod-1');
      expect(o.variantId, 'var-1');
      expect(o.status, 'DRAFT');
      expect(o.currency, 'SAR');
      expect(o.basePriceMinor, 350000);
      expect(o.compareAtPriceMinor, 400000);
      expect(o.moq, 5);
      expect(o.leadTimeDays, 3);
      expect(o.isAvailable, true);
    });

    test('handles null optional fields', () {
      final o = MerchantOffer.fromJson({
        'id': 'offer-2',
        'storeId': 'store-1',
        'productId': 'prod-1',
        'status': 'ACTIVE',
        'currency': 'USD',
        'createdAt': '2025-06-01',
        'updatedAt': '2025-06-01',
      });
      expect(o.variantId, isNull);
      expect(o.basePriceMinor, isNull);
      expect(o.leadTimeDays, isNull);
      expect(o.moq, 1); // default
      expect(o.isAvailable, true); // default
    });

    test('handles string-encoded bigint for price fields', () {
      final o = MerchantOffer.fromJson({
        'id': 'offer-3',
        'storeId': 's',
        'productId': 'p',
        'status': 'DRAFT',
        'currency': 'SAR',
        'basePriceMinor': '12345',
        'createdAt': '2025-01-01',
        'updatedAt': '2025-01-01',
      });
      expect(o.basePriceMinor, 12345);
    });

    test('canPropose is true for DRAFT and REJECTED', () {
      expect(
          MerchantOffer.fromJson({
            'id': '1',
            'storeId': 's',
            'productId': 'p',
            'status': 'DRAFT',
            'currency': 'SAR',
            'createdAt': '',
            'updatedAt': '',
          }).canPropose,
          isTrue);
      expect(
          MerchantOffer.fromJson({
            'id': '2',
            'storeId': 's',
            'productId': 'p',
            'status': 'REJECTED',
            'currency': 'SAR',
            'createdAt': '',
            'updatedAt': '',
          }).canPropose,
          isTrue);
      expect(
          MerchantOffer.fromJson({
            'id': '3',
            'storeId': 's',
            'productId': 'p',
            'status': 'ACTIVE',
            'currency': 'SAR',
            'createdAt': '',
            'updatedAt': '',
          }).canPropose,
          isFalse);
    });

    test('canWithdraw is false only for WITHDRAWN', () {
      for (final s in [
        'DRAFT',
        'PROPOSED',
        'ACTIVE',
        'SUSPENDED',
        'REJECTED'
      ]) {
        expect(
            MerchantOffer.fromJson({
              'id': 'x',
              'storeId': 's',
              'productId': 'p',
              'status': s,
              'currency': 'SAR',
              'createdAt': '',
              'updatedAt': '',
            }).canWithdraw,
            isTrue);
      }
      expect(
          MerchantOffer.fromJson({
            'id': 'x',
            'storeId': 's',
            'productId': 'p',
            'status': 'WITHDRAWN',
            'currency': 'SAR',
            'createdAt': '',
            'updatedAt': '',
          }).canWithdraw,
          isFalse);
    });

    test('canUpdatePricing for DRAFT, ACTIVE, SUSPENDED', () {
      expect(
          MerchantOffer.fromJson({
            'id': '1',
            'storeId': 's',
            'productId': 'p',
            'status': 'DRAFT',
            'currency': 'SAR',
            'createdAt': '',
            'updatedAt': '',
          }).canUpdatePricing,
          isTrue);
      expect(
          MerchantOffer.fromJson({
            'id': '2',
            'storeId': 's',
            'productId': 'p',
            'status': 'ACTIVE',
            'currency': 'SAR',
            'createdAt': '',
            'updatedAt': '',
          }).canUpdatePricing,
          isTrue);
      expect(
          MerchantOffer.fromJson({
            'id': '3',
            'storeId': 's',
            'productId': 'p',
            'status': 'PROPOSED',
            'currency': 'SAR',
            'createdAt': '',
            'updatedAt': '',
          }).canUpdatePricing,
          isFalse);
    });
  });

  group('OfferTrendPoint.fromJson', () {
    test('parses bucket and metrics', () {
      final p = OfferTrendPoint.fromJson({
        'bucket': '2025-06-01',
        'ordersCount': 12,
        'unitsSold': 48,
        'revenueMinor': 1680000,
      });
      expect(p.bucket, '2025-06-01');
      expect(p.ordersCount, 12);
      expect(p.unitsSold, 48);
      expect(p.revenueMinor, 1680000);
    });

    test('handles string-encoded numbers', () {
      final p = OfferTrendPoint.fromJson({
        'bucket': '2025-06-01',
        'ordersCount': 5,
        'unitsSold': '20',
        'revenueMinor': '50000',
      });
      expect(p.unitsSold, 20);
      expect(p.revenueMinor, 50000);
    });

    test('defaults to zero for missing fields', () {
      final p = OfferTrendPoint.fromJson({'bucket': '2025-01-01'});
      expect(p.ordersCount, 0);
      expect(p.unitsSold, 0);
      expect(p.revenueMinor, 0);
    });
  });
}
