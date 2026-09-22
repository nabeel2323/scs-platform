/// Data models for the Smart Commerce Platform.
library;

class SearchResult {
  final List<Product> products;
  final int total;
  final String query;
  SearchResult(
      {required this.products, required this.total, required this.query});
  factory SearchResult.fromJson(Map<String, dynamic> j) => SearchResult(
        // A5-7: every path of GET /v1/search returns its hits under `items`. This
        // read `products`, and because the cast below defaults to an empty list,
        // the response parsed "successfully" into zero results — mobile search
        // showed nothing for queries that had matches, with no error anywhere.
        products: (j['items'] as List? ?? [])
            .map((e) => Product.fromJson(e))
            .toList(),
        total: j['total'] as int? ?? 0,
        query: j['query'] as String? ?? '',
      );
}

/// One line of a reorder outcome. Used for both shapes the endpoint returns:
/// re-added lines carry `quantity`, skipped ones carry `reason`.
class ReorderLine {
  final String title, reason;
  final int quantity;
  ReorderLine({required this.title, this.quantity = 0, this.reason = ''});
  factory ReorderLine.fromJson(Map<String, dynamic> j) => ReorderLine(
      title: j['title'] ?? '',
      quantity: j['quantity'] as int? ?? 0,
      reason: j['reason'] ?? '');
}

/// POST /v1/orders/master/:id/reorder (A4-7). The endpoint re-adds each line
/// through the cart, so it reports per-line outcomes: a past order can hold
/// variants that were delisted or lost their price tier since. Discarding the
/// body made a partial reorder look like a complete one.
class ReorderResult {
  final String masterOrderId;
  final List<ReorderLine> added;
  final List<ReorderLine> skipped;
  ReorderResult(
      {required this.masterOrderId,
      this.added = const [],
      this.skipped = const []});
  factory ReorderResult.fromJson(Map<String, dynamic> j) => ReorderResult(
        masterOrderId: j['masterOrderId'] ?? '',
        added: (j['added'] as List? ?? [])
            .map((e) =>
                ReorderLine.fromJson(Map<String, dynamic>.from(e as Map)))
            .toList(),
        skipped: (j['skipped'] as List? ?? [])
            .map((e) =>
                ReorderLine.fromJson(Map<String, dynamic>.from(e as Map)))
            .toList(),
      );

  int get total => added.length + skipped.length;

  /// Snack-bar text. Which lines did not come back matters more than how many
  /// did, so the first reason is named and the rest counted.
  String get summary {
    if (added.isEmpty) {
      return skipped.isEmpty
          ? 'That order had no items to re-order'
          : 'Nothing could be re-ordered — $_reasons';
    }
    if (skipped.isEmpty) {
      return 'Added $total item${total == 1 ? '' : 's'} to your cart';
    }
    return 'Added ${added.length} of $total — $_reasons';
  }

  String get _reasons {
    if (skipped.isEmpty) return '';
    final first = skipped.first;
    final more = skipped.length > 1 ? ' (+${skipped.length - 1} more)' : '';
    return '${first.title}: ${first.reason}$more';
  }
}

/// Seller identity attached to a listing or a product detail response.
///
/// Separate from [Store] because the listing payload is a projection: it carries
/// the five fields a card needs (identity, verification, currency) and none of
/// `Store`'s required columns (`orgId`, `createdAt`), so parsing it as a `Store`
/// would silently fill them with "".
class ListingStore {
  final String id, name, slug, verificationStatus;
  final String? currency;
  ListingStore(
      {required this.id,
      required this.name,
      required this.slug,
      required this.verificationStatus,
      this.currency});
  bool get isVerified => verificationStatus == 'VERIFIED';
  factory ListingStore.fromJson(Map<String, dynamic> j) => ListingStore(
        // Search and store grids send `name`; the product detail endpoint sends
        // both `name` and the underlying `displayName`.
        id: j['id'] ?? '',
        name: j['name'] ?? j['displayName'] ?? '',
        slug: j['slug'] ?? '',
        verificationStatus: j['verificationStatus'] ?? 'PENDING',
        currency: j['currency'],
      );
}

class Product {
  final String id, storeId, slug, title, status, createdAt;
  final String? categoryId, brandId, titleAr, description;
  final bool isAvailable;
  final int moq;
  final List<dynamic> images;
  final Map<String, dynamic> attributes;

  /// A5-2: the listing-card enrichment. Null on endpoints that do not enrich
  /// (a merchant's own product list), so every reader must treat it as optional.
  final ListingStore? store;

  /// Cheapest active variant price at this product's MOQ, or null when no price
  /// list covers it — which is "Price on request", never a fabricated figure.
  final int? priceFromMinor;
  final String? priceCurrency;

  /// Embedded by GET /v1/products/:id (A5-1) with each variant's effective
  /// `priceMinor`. Empty on list endpoints, which do not carry variants.
  final List<ProductVariant> variants;
  Product(
      {required this.id,
      required this.storeId,
      this.categoryId,
      this.brandId,
      required this.slug,
      required this.title,
      this.titleAr,
      this.description,
      required this.status,
      required this.isAvailable,
      required this.moq,
      this.images = const [],
      this.attributes = const {},
      this.store,
      this.priceFromMinor,
      this.priceCurrency,
      this.variants = const [],
      required this.createdAt});
  factory Product.fromJson(Map<String, dynamic> j) => Product(
      id: j['id'],
      storeId: j['storeId'] ?? '',
      categoryId: j['categoryId'],
      brandId: j['brandId'],
      slug: j['slug'] ?? '',
      title: j['title'] ?? '',
      titleAr: j['titleAr'],
      description: j['description'],
      status: j['status'] ?? 'ACTIVE',
      isAvailable: j['isAvailable'] ?? true,
      moq: j['moq'] as int? ?? 1,
      images: j['images'] as List<dynamic>? ?? [],
      attributes: Map<String, dynamic>.from(j['attributes'] as Map? ?? {}),
      store: j['store'] is Map
          ? ListingStore.fromJson(Map<String, dynamic>.from(j['store'] as Map))
          : null,
      priceFromMinor: j['priceFromMinor'] as int?,
      priceCurrency: j['priceCurrency'] as String?,
      variants: (j['variants'] as List? ?? [])
          .map((e) =>
              ProductVariant.fromJson(Map<String, dynamic>.from(e as Map)))
          .toList(),
      createdAt: j['createdAt'] ?? '');

  /// First variant a buyer can actually order, when the payload embeds them.
  ProductVariant? get orderableVariant {
    for (final v in variants) {
      if (v.isActive) return v;
    }
    return null;
  }

  /// First image URL, tolerating both shapes the JSONB column has held: the
  /// contract declares an array of URL strings, while older writers used
  /// objects carrying `url` (A5-9).
  String? get imageUrl {
    if (images.isEmpty) return null;
    final first = images.first;
    if (first is String) return first.isEmpty ? null : first;
    if (first is Map) {
      final url = first['url'];
      if (url is String && url.isNotEmpty) return url;
    }
    return null;
  }

  /// Display price for a card. `priceCurrency` always arrives with
  /// `priceFromMinor` (the enrichment sets both or neither); the store currency
  /// is a fallback for payloads that carry only the seller.
  String get priceLabel => priceFromMinor == null
      ? 'Price on request'
      : formatMinor(priceFromMinor!, priceCurrency ?? store?.currency ?? 'SAR');
}

class ProductVariant {
  final String id, productId, sku, unit;
  final String? barcode, title, titleAr;
  final int? weightGrams, priceMinor, minQty;
  final bool isActive;
  ProductVariant(
      {required this.id,
      required this.productId,
      required this.sku,
      this.barcode,
      this.title,
      this.titleAr,
      required this.unit,
      this.weightGrams,
      required this.isActive,
      this.priceMinor,
      this.minQty});
  factory ProductVariant.fromJson(Map<String, dynamic> j) => ProductVariant(
      id: j['id'],
      productId: j['productId'] ?? '',
      sku: j['sku'] ?? '',
      barcode: j['barcode'],
      title: j['title'],
      titleAr: j['titleAr'],
      unit: j['unit'] ?? 'piece',
      weightGrams: j['weightGrams'] as int?,
      isActive: j['isActive'] ?? true,
      priceMinor: j['priceMinor'] as int?,
      minQty: j['minQty'] as int?);
}

class Category {
  final String id, name, slug, path;
  final String? nameAr;
  final int productCount;
  final bool isActive;
  Category(
      {required this.id,
      required this.name,
      this.nameAr,
      required this.slug,
      required this.path,
      required this.productCount,
      required this.isActive});
  factory Category.fromJson(Map<String, dynamic> j) => Category(
      id: j['id'],
      name: j['name'] ?? '',
      nameAr: j['nameAr'],
      slug: j['slug'] ?? '',
      path: j['path'] ?? '',
      productCount: j['productCount'] as int? ?? 0,
      isActive: j['isActive'] ?? true);
}

class Brand {
  final String id, name, slug;
  final String? logoUrl;
  Brand(
      {required this.id, required this.name, required this.slug, this.logoUrl});
  factory Brand.fromJson(Map<String, dynamic> j) => Brand(
      id: j['id'],
      name: j['name'] ?? '',
      slug: j['slug'] ?? '',
      logoUrl: j['logoUrl']);
}

class Store {
  final String id,
      orgId,
      slug,
      displayName,
      currency,
      status,
      verificationStatus,
      createdAt;
  final String? description, logoUrl, coverUrl, locale, timezone, updatedAt;
  final Map<String, dynamic> address, metadata;
  Store(
      {required this.id,
      required this.orgId,
      required this.slug,
      required this.displayName,
      this.description,
      this.logoUrl,
      this.coverUrl,
      required this.currency,
      required this.status,
      required this.verificationStatus,
      required this.createdAt,
      this.locale,
      this.timezone,
      this.updatedAt,
      this.address = const {},
      this.metadata = const {}});
  factory Store.fromJson(Map<String, dynamic> j) => Store(
      id: j['id'],
      orgId: j['orgId'] ?? '',
      slug: j['slug'] ?? '',
      displayName: j['displayName'] ?? '',
      description: j['description'],
      logoUrl: j['logoUrl'],
      coverUrl: j['coverUrl'],
      currency: j['currency'] ?? 'SAR',
      status: j['status'] ?? 'ACTIVE',
      verificationStatus: j['verificationStatus'] ?? 'PENDING',
      createdAt: j['createdAt'] ?? '',
      locale: j['locale'],
      timezone: j['timezone'],
      updatedAt: j['updatedAt'],
      address: Map<String, dynamic>.from(j['address'] as Map? ?? {}),
      metadata: Map<String, dynamic>.from(j['metadata'] as Map? ?? {}));
}

class Cart {
  final String id, userId, status;
  final String? promoCode;
  final int totalMinor;
  final List<CartItem> items;
  Cart(
      {required this.id,
      required this.userId,
      required this.status,
      this.promoCode,
      required this.totalMinor,
      required this.items});
  factory Cart.fromJson(Map<String, dynamic> j) => Cart(
      id: j['id'],
      userId: j['userId'] ?? '',
      status: j['status'] ?? 'ACTIVE',
      promoCode: j['promoCode'],
      totalMinor: j['totalMinor'] as int? ?? 0,
      items: (j['items'] as List? ?? [])
          .map((e) => CartItem.fromJson(e))
          .toList());
}

class CartItem {
  final String id, cartId, storeId, variantId;
  final int quantity, priceMinor, tierMinQty, lineTotalMinor;
  final String? title, sku, storeName;
  // A5-3: the supplier's currency for this line, so a cart is not assumed SAR.
  final String? currency;
  CartItem(
      {required this.id,
      required this.cartId,
      required this.storeId,
      required this.variantId,
      required this.quantity,
      required this.priceMinor,
      required this.tierMinQty,
      required this.lineTotalMinor,
      this.title,
      this.sku,
      this.storeName,
      this.currency});
  factory CartItem.fromJson(Map<String, dynamic> j) => CartItem(
      id: j['id'],
      cartId: j['cartId'] ?? '',
      storeId: j['storeId'] ?? '',
      variantId: j['variantId'] ?? '',
      quantity: j['quantity'] as int? ?? 1,
      priceMinor: j['priceMinor'] as int? ?? 0,
      tierMinQty: j['tierMinQty'] as int? ?? 1,
      lineTotalMinor: j['lineTotalMinor'] as int? ?? 0,
      title: j['title'],
      sku: j['sku'],
      storeName: j['storeName'],
      currency: j['currency']);
}

class MasterOrder {
  final String id, buyerId, status, createdAt;
  final Map<String, dynamic> deliveryAddress;
  final String? notes;
  final List<SubOrder> subOrders;
  // A2-4: null when the checkout's suppliers do not share a currency, in which
  // case no single total is payable and `totalsByCurrency` is the answer.
  final String? currency;
  final Map<String, int> totalsByCurrency;
  MasterOrder(
      {required this.id,
      required this.buyerId,
      required this.status,
      required this.deliveryAddress,
      this.notes,
      required this.createdAt,
      required this.subOrders,
      this.currency,
      this.totalsByCurrency = const {}});
  factory MasterOrder.fromJson(Map<String, dynamic> j) => MasterOrder(
      id: j['id'],
      buyerId: j['buyerId'] ?? '',
      status: j['status'] ?? '',
      deliveryAddress:
          Map<String, dynamic>.from(j['deliveryAddress'] as Map? ?? {}),
      notes: j['notes'],
      createdAt: j['createdAt'] ?? '',
      currency: j['currency'],
      totalsByCurrency: (j['totalsByCurrency'] as Map? ?? {}).map(
          (key, value) => MapEntry(key.toString(), (value as num).toInt())),
      subOrders: (j['subOrders'] as List? ?? [])
          .map((e) => SubOrder.fromJson(e))
          .toList());
}

class SubOrder {
  final String id,
      masterOrderId,
      storeId,
      buyerId,
      status,
      fulfillmentMethod,
      createdAt;
  final int subtotalMinor,
      discountMinor,
      deliveryFeeMinor,
      taxMinor,
      totalMinor;
  final List<OrderItem> items;
  // A2-4: every *_Minor above is expressed in this currency.
  final String? currency;

  /// False when the API inferred it from the seller instead of reading the
  /// snapshot taken at checkout — a legacy order, not a record.
  final bool currencyFromSnapshot;
  // A4-6: which supplier this sub-order belongs to, named.
  final String? storeName, storeSlug;

  /// Lines in the order. `listOrders` returns orders without `items`, so the
  /// server ships a count instead (A5-16).
  final int itemCount;
  SubOrder(
      {required this.id,
      required this.masterOrderId,
      required this.storeId,
      required this.buyerId,
      required this.status,
      required this.fulfillmentMethod,
      required this.subtotalMinor,
      required this.discountMinor,
      required this.deliveryFeeMinor,
      required this.taxMinor,
      required this.totalMinor,
      required this.createdAt,
      this.items = const [],
      this.currency,
      this.currencyFromSnapshot = false,
      this.storeName,
      this.storeSlug,
      this.itemCount = 0});
  factory SubOrder.fromJson(Map<String, dynamic> j) => SubOrder(
      id: j['id'],
      masterOrderId: j['masterOrderId'] ?? '',
      storeId: j['storeId'] ?? '',
      buyerId: j['buyerId'] ?? '',
      status: j['status'] ?? '',
      fulfillmentMethod: j['fulfillmentMethod'] ?? 'PICKUP',
      subtotalMinor: j['subtotalMinor'] as int? ?? 0,
      discountMinor: j['discountMinor'] as int? ?? 0,
      deliveryFeeMinor: j['deliveryFeeMinor'] as int? ?? 0,
      taxMinor: j['taxMinor'] as int? ?? 0,
      totalMinor: j['totalMinor'] as int? ?? 0,
      createdAt: j['createdAt'] ?? '',
      items: (j['items'] as List? ?? [])
          .map((e) => OrderItem.fromJson(e))
          .toList(),
      currency: j['currency'],
      currencyFromSnapshot: j['currencyFromSnapshot'] == true,
      storeName: j['storeName'],
      storeSlug: j['storeSlug'],
      // A detail response embeds the lines but no count; a list response is the
      // other way round. Either way the screen has a real number to show.
      itemCount: j['itemCount'] as int? ?? (j['items'] as List? ?? []).length);
}

class OrderItem {
  final String id, orderId, variantId, sku, title;
  final int quantity, unitPriceMinor, tierMinQty, lineTotalMinor;
  final int? qtyConfirmed;
  OrderItem(
      {required this.id,
      required this.orderId,
      required this.variantId,
      required this.sku,
      required this.title,
      required this.quantity,
      this.qtyConfirmed,
      required this.unitPriceMinor,
      required this.tierMinQty,
      required this.lineTotalMinor});
  factory OrderItem.fromJson(Map<String, dynamic> j) => OrderItem(
      id: j['id'],
      orderId: j['orderId'] ?? '',
      variantId: j['variantId'] ?? '',
      sku: j['sku'] ?? '',
      title: j['title'] ?? '',
      quantity: j['quantity'] as int? ?? 1,
      qtyConfirmed: j['qtyConfirmed'] as int?,
      unitPriceMinor: j['unitPriceMinor'] as int? ?? 0,
      tierMinQty: j['tierMinQty'] as int? ?? 1,
      lineTotalMinor: j['lineTotalMinor'] as int? ?? 0);
}

class StatusHistoryEntry {
  final String id, orderId, toStatus, actorType, createdAt;
  final String? fromStatus, changedBy, reason;
  StatusHistoryEntry(
      {required this.id,
      required this.orderId,
      this.fromStatus,
      required this.toStatus,
      this.changedBy,
      required this.actorType,
      this.reason,
      required this.createdAt});
  factory StatusHistoryEntry.fromJson(Map<String, dynamic> j) =>
      StatusHistoryEntry(
          id: j['id'],
          orderId: j['orderId'] ?? '',
          fromStatus: j['fromStatus'],
          toStatus: j['toStatus'] ?? '',
          changedBy: j['changedBy'],
          actorType: j['actorType'] ?? '',
          reason: j['reason'],
          createdAt: j['createdAt'] ?? '');
}

class AppNotification {
  final String id, userId, type, channel, template, body, status, createdAt;
  final String? title, readAt;
  AppNotification(
      {required this.id,
      required this.userId,
      required this.type,
      required this.channel,
      required this.template,
      this.title,
      required this.body,
      required this.status,
      this.readAt,
      required this.createdAt});
  factory AppNotification.fromJson(Map<String, dynamic> j) => AppNotification(
      id: j['id'],
      userId: j['userId'] ?? '',
      type: j['type'] ?? '',
      channel: j['channel'] ?? '',
      template: j['template'] ?? '',
      title: j['title'],
      body: j['body'] ?? '',
      status: j['status'] ?? '',
      readAt: j['readAt'],
      createdAt: j['createdAt'] ?? '');
  bool get isRead => readAt != null;
}

class Review {
  final String id, orderId, reviewerId, subjectId, subjectType, createdAt;
  final int rating;
  final String? comment;
  Review(
      {required this.id,
      required this.orderId,
      required this.reviewerId,
      required this.subjectId,
      required this.subjectType,
      required this.rating,
      this.comment,
      required this.createdAt});
  factory Review.fromJson(Map<String, dynamic> j) => Review(
      id: j['id'],
      orderId: j['orderId'] ?? '',
      reviewerId: j['reviewerId'] ?? '',
      subjectId: j['subjectId'] ?? '',
      subjectType: j['subjectType'] ?? 'STORE',
      rating: j['rating'] as int? ?? 5,
      comment: j['comment'],
      createdAt: j['createdAt'] ?? '');
}

class Dispute {
  final String id, orderId, reason, status, createdAt;
  final String? description;
  Dispute(
      {required this.id,
      required this.orderId,
      required this.reason,
      this.description,
      required this.status,
      required this.createdAt});
  factory Dispute.fromJson(Map<String, dynamic> j) => Dispute(
      id: j['id'],
      orderId: j['orderId'] ?? '',
      reason: j['reason'] ?? '',
      description: j['description'],
      status: j['status'] ?? 'OPEN',
      createdAt: j['createdAt'] ?? '');
}

/// User profile returned by GET /v1/me.
class UserProfile {
  final String id, phone, status, createdAt;
  final String? email, fullName, locale, activeOrgId, role;
  final List<OrgMembership> organizations;
  UserProfile({
    required this.id,
    required this.phone,
    required this.status,
    required this.createdAt,
    this.email,
    this.fullName,
    this.locale,
    this.activeOrgId,
    this.role,
    this.organizations = const [],
  });
  factory UserProfile.fromJson(Map<String, dynamic> j) => UserProfile(
        id: j['id'] ?? '',
        phone: j['phone'] ?? '',
        status: j['status'] ?? '',
        createdAt: j['createdAt'] ?? '',
        email: j['email'],
        fullName: j['fullName'],
        locale: j['locale'],
        activeOrgId: j['activeOrgId'],
        role: j['role'] as String?,
        organizations: (j['organizations'] as List? ?? [])
            .map((e) => OrgMembership.fromJson(e))
            .toList(),
      );
}

/// Membership entry inside UserProfile.
class OrgMembership {
  final String orgId, role, orgName, orgType;
  OrgMembership({
    required this.orgId,
    required this.role,
    required this.orgName,
    required this.orgType,
  });
  factory OrgMembership.fromJson(Map<String, dynamic> j) => OrgMembership(
        orgId: j['orgId'] ?? '',
        role: j['role'] ?? '',
        orgName: j['orgName'] ?? '',
        orgType: j['orgType'] ?? '',
      );
}

/// Organization returned by organization endpoints.
class Organization {
  final String id, name, type, country, createdAt;
  final String? legalName, taxId, inviteCode;
  Organization({
    required this.id,
    required this.name,
    required this.type,
    required this.country,
    required this.createdAt,
    this.legalName,
    this.taxId,
    this.inviteCode,
  });
  factory Organization.fromJson(Map<String, dynamic> j) => Organization(
        id: j['id'] ?? '',
        name: j['name'] ?? '',
        type: j['type'] ?? '',
        country: j['country'] ?? '',
        createdAt: j['createdAt'] ?? '',
        legalName: j['legalName'],
        taxId: j['taxId'],
        inviteCode: j['inviteCode'],
      );
}

/// Member of an organization.
class OrgMember {
  final String userId, orgId, roleId, userName;
  final String? userEmail;
  OrgMember({
    required this.userId,
    required this.orgId,
    required this.roleId,
    required this.userName,
    this.userEmail,
  });
  factory OrgMember.fromJson(Map<String, dynamic> j) => OrgMember(
        userId: j['userId'] ?? '',
        orgId: j['orgId'] ?? '',
        // API returns `roleKey`; legacy `roleId` key kept for compatibility.
        roleId: (j['roleKey'] ?? j['roleId'] ?? '').toString(),
        // API returns `fullName`; legacy `userName` key kept for compatibility.
        userName: (j['fullName'] ?? j['userName'] ?? '').toString(),
        // API returns `phone`; legacy `userEmail`/`email` keys kept as fallback.
        userEmail: (j['userEmail'] ?? j['email'] ?? j['phone'])?.toString(),
      );
}

/// Minor units → `"12.50 AED"`.
///
/// [currency] is nullable on purpose: orders and cart lines now report the
/// currency their amounts are actually in (A2-4), and callers should forward it
/// untouched instead of repeating an inline `?? 'SAR'`. The fallback stays here
/// as the single visible place that assumption lives.
String formatMinor(int minor, [String? currency]) =>
    '${(minor / 100).toStringAsFixed(2)} ${currency ?? 'SAR'}';

/// Product media row returned by GET /v1/products/:id/media.
class MediaItem {
  final String id, productId, mediaType, url, createdAt;
  final String? variantId, thumbUrl, altText;
  final int sortOrder;
  MediaItem({
    required this.id,
    required this.productId,
    required this.mediaType,
    required this.url,
    this.variantId,
    this.thumbUrl,
    this.altText,
    this.sortOrder = 0,
    required this.createdAt,
  });
  factory MediaItem.fromJson(Map<String, dynamic> j) => MediaItem(
        id: j['id'] ?? '',
        productId: j['productId'] ?? '',
        mediaType: j['mediaType'] ?? 'IMAGE',
        url: j['url'] ?? '',
        variantId: j['variantId'],
        thumbUrl: j['thumbUrl'],
        altText: j['altText'],
        sortOrder: j['sortOrder'] as int? ?? 0,
        createdAt: j['createdAt'] ?? '',
      );
}

/// Customer aggregate returned by GET /v1/merchant/customers.
class CustomerSummary {
  final String buyerId;
  final String? buyerName, buyerPhone, buyerEmail, lastOrderAt;
  final int orderCount, totalSpentMinor;
  CustomerSummary({
    required this.buyerId,
    this.buyerName,
    this.buyerPhone,
    this.buyerEmail,
    this.orderCount = 0,
    this.totalSpentMinor = 0,
    this.lastOrderAt,
  });
  factory CustomerSummary.fromJson(Map<String, dynamic> j) => CustomerSummary(
        buyerId: j['buyerId'] ?? '',
        buyerName: j['buyerName'],
        buyerPhone: j['buyerPhone'],
        buyerEmail: j['buyerEmail'],
        orderCount: j['orderCount'] as int? ?? 0,
        totalSpentMinor: j['totalSpentMinor'] as int? ?? 0,
        lastOrderAt: j['lastOrderAt'],
      );
}

/// Inventory row returned by GET /v1/inventory/warehouse/:id.
class InventoryItem {
  final String id, variantId, warehouseId;
  final int qtyOnHand, qtyReserved, reorderPoint;
  final int? maxStock;
  final bool lowStockAlert;
  InventoryItem({
    required this.id,
    required this.variantId,
    required this.warehouseId,
    this.qtyOnHand = 0,
    this.qtyReserved = 0,
    this.reorderPoint = 0,
    this.maxStock,
    this.lowStockAlert = true,
  });
  factory InventoryItem.fromJson(Map<String, dynamic> j) => InventoryItem(
        id: j['id'] ?? '',
        variantId: j['variantId'] ?? '',
        warehouseId: j['warehouseId'] ?? '',
        qtyOnHand: j['qtyOnHand'] as int? ?? 0,
        qtyReserved: j['qtyReserved'] as int? ?? 0,
        reorderPoint: j['reorderPoint'] as int? ?? 0,
        maxStock: j['maxStock'] as int?,
        lowStockAlert: j['lowStockAlert'] ?? true,
      );
  int get available => qtyOnHand - qtyReserved;
  bool get isLow => qtyOnHand <= reorderPoint;
}

/// Paginated envelope for store inventory listings.
class PaginatedInventory {
  final List<InventoryItem> data;
  final int total;
  PaginatedInventory({required this.data, required this.total});
  factory PaginatedInventory.fromJson(Map<String, dynamic> j) =>
      PaginatedInventory(
        data: (j['data'] as List)
            .map((e) =>
                InventoryItem.fromJson(Map<String, dynamic>.from(e as Map)))
            .toList(),
        total: j['total'] as int? ?? 0,
      );
}

/// Price list row returned by GET /v1/stores/:id/price-lists.
class PriceList {
  final String id, storeId, name, currency;
  final bool isActive;
  PriceList({
    required this.id,
    required this.storeId,
    required this.name,
    this.currency = 'SAR',
    this.isActive = true,
  });
  factory PriceList.fromJson(Map<String, dynamic> j) => PriceList(
        id: j['id'] ?? '',
        storeId: j['storeId'] ?? '',
        name: j['name'] ?? '',
        currency: j['currency'] ?? 'SAR',
        isActive: j['isActive'] ?? true,
      );
}

/// Price tier row returned by GET /v1/price-lists/:id/tiers.
class PriceTier {
  final String id, priceListId, variantId;
  final int minQty, unitPriceMinor;
  final int? maxQty;
  PriceTier({
    required this.id,
    required this.priceListId,
    required this.variantId,
    this.minQty = 1,
    this.maxQty,
    required this.unitPriceMinor,
  });
  factory PriceTier.fromJson(Map<String, dynamic> j) => PriceTier(
        id: j['id'] ?? '',
        priceListId: j['priceListId'] ?? '',
        variantId: j['variantId'] ?? '',
        minQty: j['minQty'] as int? ?? 1,
        maxQty: j['maxQty'] as int?,
        unitPriceMinor: j['unitPriceMinor'] as int? ?? 0,
      );
}

// ── Auth & Session ───────────────────────────────────────────
// Typed mirrors of the @scs/contracts auth/session schemas so the auth endpoints
// stop leaking raw `Map<String, dynamic>` into the UI. Field names + nullability
// match the wire contract; `fromJson` is defensive (missing keys never throw).

/// Response of POST /v1/auth/otp/verify — a fresh access/refresh token pair.
class AuthTokens {
  final String accessToken, refreshToken;
  AuthTokens({required this.accessToken, required this.refreshToken});
  factory AuthTokens.fromJson(Map<String, dynamic> j) => AuthTokens(
        accessToken: j['accessToken'] ?? '',
        refreshToken: j['refreshToken'] ?? '',
      );
}

/// Response of POST /v1/auth/login/password. A trusted device yields a token
/// pair; a new device instead returns `requiresOtp` with the `otpPhone` the code
/// was sent to (tokens absent in that branch — hence nullable).
class LoginPasswordResponse {
  final String? accessToken, refreshToken, otpPhone;
  final bool requiresOtp;
  LoginPasswordResponse({
    this.accessToken,
    this.refreshToken,
    this.otpPhone,
    this.requiresOtp = false,
  });
  factory LoginPasswordResponse.fromJson(Map<String, dynamic> j) =>
      LoginPasswordResponse(
        accessToken: j['accessToken'] as String?,
        refreshToken: j['refreshToken'] as String?,
        otpPhone: j['otpPhone'] as String?,
        requiresOtp: j['requiresOtp'] as bool? ?? false,
      );

  /// True when the response carried a usable token pair (device was trusted).
  bool get hasSession => accessToken != null && refreshToken != null;

  /// Project the token pair for session persistence; null when OTP is required.
  AuthTokens? toAuthTokens() => hasSession
      ? AuthTokens(accessToken: accessToken!, refreshToken: refreshToken!)
      : null;
}

/// Response of POST /v1/auth/login/device-check (pre-flight for password login).
class DeviceCheckResponse {
  final bool canAutoLogin, requiresOtp, hasPassword;
  DeviceCheckResponse({
    this.canAutoLogin = false,
    this.requiresOtp = false,
    this.hasPassword = false,
  });
  factory DeviceCheckResponse.fromJson(Map<String, dynamic> j) =>
      DeviceCheckResponse(
        canAutoLogin: j['canAutoLogin'] as bool? ?? false,
        requiresOtp: j['requiresOtp'] as bool? ?? false,
        hasPassword: j['hasPassword'] as bool? ?? false,
      );
}

/// Response of POST /v1/auth/switch-org — a re-minted access token scoped to the
/// new active org. The prior access token is denylisted server-side (API-B9), so
/// callers MUST persist this replacement immediately or subsequent calls 401.
class SwitchOrgResponse {
  final String accessToken;
  SwitchOrgResponse({required this.accessToken});
  factory SwitchOrgResponse.fromJson(Map<String, dynamic> j) =>
      SwitchOrgResponse(accessToken: j['accessToken'] ?? '');
}

/// A single active session from GET /v1/me/sessions. `isCurrent` is set
/// server-side from the caller's `sid` claim (WEB-B3); clients must not compute it.
class SessionInfo {
  final String id, device, createdAt, expiresAt;
  final String? deviceId, ip;
  final bool isCurrent, isRevoked;
  SessionInfo({
    required this.id,
    required this.device,
    required this.createdAt,
    required this.expiresAt,
    this.deviceId,
    this.ip,
    this.isCurrent = false,
    this.isRevoked = false,
  });
  factory SessionInfo.fromJson(Map<String, dynamic> j) => SessionInfo(
        id: j['id'] ?? '',
        device: j['device'] ?? '',
        createdAt: j['createdAt'] ?? '',
        expiresAt: j['expiresAt'] ?? '',
        deviceId: j['deviceId'] as String?,
        ip: j['ip'] as String?,
        isCurrent: j['isCurrent'] as bool? ?? false,
        isRevoked: j['isRevoked'] as bool? ?? false,
      );
}
