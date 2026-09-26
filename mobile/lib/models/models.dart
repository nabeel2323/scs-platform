/// Data models for the Smart Commerce Platform.
library;

class SearchResult {
  final List<Product> products;
  final int total;
  final String query;
  final List<FacetEntry> facets;
  SearchResult(
      {required this.products,
      required this.total,
      required this.query,
      this.facets = const []});
  factory SearchResult.fromJson(Map<String, dynamic> j) => SearchResult(
        products: (j['items'] as List? ?? [])
            .map((e) => Product.fromJson(e))
            .toList(),
        total: j['total'] as int? ?? 0,
        query: j['query'] as String? ?? '',
        facets: (j['facets'] as List? ?? [])
            .map(
                (e) => FacetEntry.fromJson(Map<String, dynamic>.from(e as Map)))
            .toList(),
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
  final String? productTypeId;
  final List<AttributeValue>? attributeValues;

  /// A5-2: the listing-card enrichment. Null on endpoints that do not enrich
  /// (a merchant's own product list), so every reader must treat it as optional.
  final ListingStore? store;

  /// Server-resolved primary image URL attached by the card-enrichment layer
  /// (`enrichProductCards` → `imageUrl`). Raw `images` entries are often
  /// object-storage keys that Flutter cannot render directly, so every image
  /// widget must prefer this. Null on non-enriched endpoints.
  final String? resolvedImageUrl;

  /// Cheapest active variant price at this product's MOQ, or null when no price
  /// list covers it — which is "Price on request", never a fabricated figure.
  final int? priceFromMinor;
  final String? priceCurrency;

  /// Offer enrichment: number of ACTIVE merchant offers across all stores.
  final int activeOfferCount;

  /// Offer enrichment: lowest base price among active merchant offers.
  final int? lowestOfferPriceMinor;
  final String? lowestOfferCurrency;

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
      this.productTypeId,
      this.attributeValues,
      this.store,
      this.resolvedImageUrl,
      this.priceFromMinor,
      this.priceCurrency,
      this.activeOfferCount = 0,
      this.lowestOfferPriceMinor,
      this.lowestOfferCurrency,
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
      productTypeId: j['productTypeId'] as String?,
      attributeValues: (j['attributeValues'] as List?)
          ?.map((e) =>
              AttributeValue.fromJson(Map<String, dynamic>.from(e as Map)))
          .toList(),
      store: j['store'] is Map
          ? ListingStore.fromJson(Map<String, dynamic>.from(j['store'] as Map))
          : null,
      resolvedImageUrl: j['imageUrl'] as String?,
      priceFromMinor: j['priceFromMinor'] as int?,
      priceCurrency: j['priceCurrency'] as String?,
      activeOfferCount: j['activeOfferCount'] as int? ?? 0,
      lowestOfferPriceMinor: j['lowestOfferPriceMinor'] as int?,
      lowestOfferCurrency: j['lowestOfferCurrency'] as String?,
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

  /// Primary image URL. Prefers the server-resolved [resolvedImageUrl] (card
  /// enrichment), because the raw JSONB `images` entries are frequently
  /// object-storage keys that are not directly renderable. Falls back to the
  /// array for payloads that carry only full URLs and no enrichment, tolerating
  /// both shapes the column has held: bare URL strings and legacy `{url}`
  /// objects (A5-9).
  String? get imageUrl {
    if (resolvedImageUrl != null && resolvedImageUrl!.isNotEmpty) {
      return resolvedImageUrl;
    }
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

/// Canonical product summary returned by GET /v1/canonical/search.
/// Used by the merchant "Existing Product Selector" in the offer create flow.
class CanonicalProduct {
  final String id, title, slug, status;
  final String? titleAr, brandId, categoryId;
  final String? brandName, categoryName;
  final String? gtin, ean, mpn;
  final int variantCount;
  final int activeOfferCount;

  CanonicalProduct({
    required this.id,
    required this.title,
    required this.slug,
    required this.status,
    this.titleAr,
    this.brandId,
    this.categoryId,
    this.brandName,
    this.categoryName,
    this.gtin,
    this.ean,
    this.mpn,
    this.variantCount = 0,
    this.activeOfferCount = 0,
  });

  factory CanonicalProduct.fromJson(Map<String, dynamic> j) => CanonicalProduct(
        id: j['id'],
        title: j['title'] ?? '',
        slug: j['slug'] ?? '',
        status: j['status'] ?? 'ACTIVE',
        titleAr: j['titleAr'],
        brandId: j['brandId'],
        categoryId: j['categoryId'],
        brandName: j['brandName'],
        categoryName: j['categoryName'],
        gtin: j['gtin'],
        ean: j['ean'],
        mpn: j['mpn'],
        variantCount: j['variantCount'] as int? ?? 0,
        activeOfferCount: j['activeOfferCount'] as int? ?? 0,
      );
}

/// Paginated result from GET /v1/canonical/search.
class CanonicalSearchResult {
  final List<CanonicalProduct> items;
  final int total;
  CanonicalSearchResult({required this.items, required this.total});
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
  // PHASE 10: the merchant offer that priced this line (null for legacy).
  final String? offerId;
  // PHASE 14: enriched offer metadata joined from merchant_offers.
  final CartItemOffer? offer;
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
      this.currency,
      this.offerId,
      this.offer});
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
      currency: j['currency'],
      offerId: j['offerId'] as String?,
      offer: j['offer'] == null
          ? null
          : CartItemOffer.fromJson(j['offer'] as Map<String, dynamic>));
}

/// PHASE 14: read-only projection of the merchant offer backing a cart line.
class CartItemOffer {
  final String id, status;
  final int? leadTimeDays;
  final int? moq;
  CartItemOffer(
      {required this.id, required this.status, this.leadTimeDays, this.moq});
  factory CartItemOffer.fromJson(Map<String, dynamic> j) => CartItemOffer(
      id: j['id'] as String,
      status: (j['status'] as String?) ?? 'UNKNOWN',
      leadTimeDays: j['leadTimeDays'] as int?,
      moq: j['moq'] as int?);
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
        // Backend listUserOrgs spreads the org row (id/name/type) and adds
        // roleId/membershipStatus. Read the real keys first, keep legacy
        // aliases as fallbacks so tests and mock data still work.
        orgId: (j['id'] ?? j['orgId'] ?? '').toString(),
        role: (j['roleKey'] ?? j['roleId'] ?? j['role'] ?? '').toString(),
        orgName: (j['name'] ?? j['orgName'] ?? '').toString(),
        orgType: (j['type'] ?? j['orgType'] ?? '').toString(),
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
///
/// `url`/`thumbUrl` are the RAW object-storage keys (e.g. `products/{id}/x.jpg`)
/// and are NOT directly renderable. The backend resolves each row into a
/// presigned `displayUrl`/`thumbSrc` (or passes through a full http(s) URL), so
/// image widgets must use [renderUrl], never [url] alone.
class MediaItem {
  final String id, productId, mediaType, url, createdAt;
  final String? variantId, thumbUrl, altText;

  /// Server-resolved, renderable URLs (presigned GET or http passthrough).
  final String? displayUrl, thumbSrc;
  final int sortOrder;
  MediaItem({
    required this.id,
    required this.productId,
    required this.mediaType,
    required this.url,
    this.variantId,
    this.thumbUrl,
    this.altText,
    this.displayUrl,
    this.thumbSrc,
    this.sortOrder = 0,
    required this.createdAt,
  });

  /// The URL an image widget should load: prefer the resolved display URL, then
  /// the resolved thumbnail, then the raw url (which is only loadable when it
  /// already happens to be a full http(s) URL).
  String get renderUrl => displayUrl ?? thumbSrc ?? url;

  bool get isImage => mediaType.toUpperCase() == 'IMAGE';

  factory MediaItem.fromJson(Map<String, dynamic> j) => MediaItem(
        id: j['id'] ?? '',
        productId: j['productId'] ?? '',
        mediaType: j['mediaType'] ?? 'IMAGE',
        url: j['url'] ?? '',
        variantId: j['variantId'],
        thumbUrl: j['thumbUrl'],
        altText: j['altText'],
        displayUrl: j['displayUrl'] as String?,
        thumbSrc: j['thumbSrc'] as String?,
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

/// Per-offer sales performance row returned by
/// GET /v1/merchant/offers/analytics?storeId=… (backend `listOfferAnalytics`).
/// Field names mirror the API response exactly — note the server renames the
/// offer's `id` to `offerId` and merges zero-sale offers with aggregate counts.
class OfferAnalyticsRow {
  final String offerId, storeId, productId, status, currency;
  final String? variantId, productTitle, variantSku, variantTitle, createdAt;
  final int? basePriceMinor, moq, leadTimeDays;
  final int ordersCount, unitsSold, revenueMinor;
  OfferAnalyticsRow({
    required this.offerId,
    required this.storeId,
    required this.productId,
    required this.status,
    required this.currency,
    this.variantId,
    this.productTitle,
    this.variantSku,
    this.variantTitle,
    this.createdAt,
    this.basePriceMinor,
    this.moq,
    this.leadTimeDays,
    this.ordersCount = 0,
    this.unitsSold = 0,
    this.revenueMinor = 0,
  });
  factory OfferAnalyticsRow.fromJson(Map<String, dynamic> j) =>
      OfferAnalyticsRow(
        offerId: j['offerId'] ?? '',
        storeId: j['storeId'] ?? '',
        productId: j['productId'] ?? '',
        status: j['status'] ?? '',
        currency: j['currency'] ?? 'SAR',
        variantId: j['variantId'] as String?,
        productTitle: j['productTitle'] as String?,
        variantSku: j['variantSku'] as String?,
        variantTitle: j['variantTitle'] as String?,
        createdAt: j['createdAt']?.toString(),
        basePriceMinor: (j['basePriceMinor'] as num?)?.toInt(),
        moq: (j['moq'] as num?)?.toInt(),
        leadTimeDays: (j['leadTimeDays'] as num?)?.toInt(),
        ordersCount: (j['ordersCount'] as num?)?.toInt() ?? 0,
        unitsSold: (j['unitsSold'] as num?)?.toInt() ?? 0,
        revenueMinor: (j['revenueMinor'] as num?)?.toInt() ?? 0,
      );
}

/// Aggregated merchant dashboard KPIs (audit row 190 / spec §29). Every figure
/// is derived from a real API response. A `null` value means the backing
/// endpoint was unavailable, so the UI renders "—" instead of a fabricated zero
/// — a degraded KPI must never read as a genuine "0 sales".
class MerchantKpis {
  final int? revenueMinor; // null ⇒ offer-analytics unavailable
  final int? unitsSold; // null ⇒ offer-analytics unavailable
  final String currency;
  final int ordersCount; // distinct store sub-orders (real list length)
  final int pendingCount; // SUBMITTED + PENDING_CONFIRMATION
  final int? lowStockCount; // null ⇒ low-stock endpoint unavailable
  const MerchantKpis({
    this.revenueMinor,
    this.unitsSold,
    this.currency = 'SAR',
    this.ordersCount = 0,
    this.pendingCount = 0,
    this.lowStockCount,
  });
  static const empty = MerchantKpis();
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

// ── PHASE COS-15: Catalog Operating System mobile models ────────

/// Dynamic search facet returned by GET /v1/search.
class FacetEntry {
  final String code, label, type;
  final List<FacetValue> values;
  FacetEntry(
      {required this.code,
      required this.label,
      required this.type,
      this.values = const []});
  factory FacetEntry.fromJson(Map<String, dynamic> j) => FacetEntry(
        code: j['code'] ?? '',
        label: j['label'] ?? '',
        type: j['type'] ?? 'string',
        values: (j['values'] as List? ?? [])
            .map(
                (e) => FacetValue.fromJson(Map<String, dynamic>.from(e as Map)))
            .toList(),
      );
}

class FacetValue {
  final String value;
  final int count;
  FacetValue({required this.value, this.count = 0});
  factory FacetValue.fromJson(Map<String, dynamic> j) => FacetValue(
        value: j['value'] ?? '',
        count: j['count'] as int? ?? 0,
      );
}

/// Structured attribute value on a product detail response.
class AttributeValue {
  final String code, label;
  final dynamic value;
  AttributeValue({required this.code, required this.label, this.value});
  factory AttributeValue.fromJson(Map<String, dynamic> j) => AttributeValue(
        code: j['code'] ?? '',
        label: j['label'] ?? '',
        value: j['value'],
      );
}

/// Variant matrix dimension returned by GET /v1/products/:id/variant-matrix.
class VariantMatrix {
  final List<VariantDimension> dimensions;
  final List<VariantCombination> combinations;
  VariantMatrix({this.dimensions = const [], this.combinations = const []});
  factory VariantMatrix.fromJson(Map<String, dynamic> j) => VariantMatrix(
        dimensions: (j['dimensions'] as List? ?? [])
            .map((e) =>
                VariantDimension.fromJson(Map<String, dynamic>.from(e as Map)))
            .toList(),
        combinations: (j['combinations'] as List? ?? [])
            .map((e) => VariantCombination.fromJson(
                Map<String, dynamic>.from(e as Map)))
            .toList(),
      );

  /// Active combinations only — what the selector resolves against.
  List<VariantCombination> get activeCombinations =>
      combinations.where((c) => c.isActive).toList();
}

/// One selectable variant in the matrix, keyed by its per-dimension option
/// `values` (attributeDefinitionId -> option) and enriched with the winning
/// price and aggregated stock. Mirrors the backend `VariantMatrixCombination`.
class VariantCombination {
  final String variantId, sku;
  final String? title;
  final bool isActive;
  final Map<String, String> values;
  final int? unitPriceMinor;
  final String? currency;
  final int? stockAvailable, stockOnHand;
  VariantCombination({
    required this.variantId,
    required this.sku,
    this.title,
    required this.isActive,
    this.values = const <String, String>{},
    this.unitPriceMinor,
    this.currency,
    this.stockAvailable,
    this.stockOnHand,
  });
  factory VariantCombination.fromJson(Map<String, dynamic> j) {
    final pricing = j['pricing'] is Map
        ? Map<String, dynamic>.from(j['pricing'] as Map)
        : null;
    final stock =
        j['stock'] is Map ? Map<String, dynamic>.from(j['stock'] as Map) : null;
    final rawValues = j['values'];
    return VariantCombination(
      variantId: j['variantId'] ?? '',
      sku: j['sku'] ?? '',
      title: j['title'] as String?,
      isActive: j['isActive'] as bool? ?? true,
      values: rawValues is Map
          ? rawValues.map((k, v) => MapEntry(k.toString(), v.toString()))
          : const <String, String>{},
      unitPriceMinor: (pricing?['unitPriceMinor'] as num?)?.toInt(),
      currency: pricing?['currency'] as String?,
      stockAvailable: (stock?['totalAvailable'] as num?)?.toInt(),
      stockOnHand: (stock?['totalOnHand'] as num?)?.toInt(),
    );
  }

  /// Null stock means "not published" — treated as on-request, not out-of-stock.
  bool get inStock => stockAvailable == null || stockAvailable! > 0;
}

class VariantDimension {
  final String attributeDefinitionId, name;
  final String? unit;
  final List<String> options;
  VariantDimension(
      {required this.attributeDefinitionId,
      required this.name,
      this.unit,
      this.options = const []});
  factory VariantDimension.fromJson(Map<String, dynamic> j) => VariantDimension(
        attributeDefinitionId: j['attributeDefinitionId'] ?? '',
        name: j['name'] ?? '',
        unit: j['unit'] as String?,
        options:
            (j['options'] as List? ?? []).map((e) => e.toString()).toList(),
      );
}

/// Merchant offer for a product (GET /v1/products/:id/offers).
class Offer {
  final String id, productId, storeId, storeName;
  final int basePriceMinor;
  final String currency;
  final int moq;
  final int? leadTimeDays;
  final bool isActive;
  final String? variantId;
  final bool storeVerified;
  Offer(
      {required this.id,
      required this.productId,
      required this.storeId,
      required this.storeName,
      required this.basePriceMinor,
      required this.currency,
      this.moq = 1,
      this.leadTimeDays,
      required this.isActive,
      this.variantId,
      this.storeVerified = false});
  factory Offer.fromJson(Map<String, dynamic> j) => Offer(
        id: j['id'] ?? '',
        productId: j['productId'] ?? '',
        storeId: j['storeId'] ?? '',
        storeName: j['storeName'] ?? '',
        basePriceMinor: j['basePriceMinor'] as int? ?? 0,
        currency: j['currency'] ?? 'SAR',
        moq: j['moq'] as int? ?? 1,
        leadTimeDays: j['leadTimeDays'] as int?,
        isActive: j['isActive'] ?? true,
        variantId: j['variantId'] as String?,
        storeVerified: j['storeVerified'] as bool? ?? false,
      );
}

/// Ranked offer with popularity data (GET /v1/products/:id/offers/ranked).
class RankedProductOffer {
  final String offerId;
  final int? rank;
  final int ordersCount;
  final int unitsSold;
  final bool isMostPopular;
  final bool disclosureHidden;
  RankedProductOffer(
      {required this.offerId,
      this.rank,
      this.ordersCount = 0,
      this.unitsSold = 0,
      this.isMostPopular = false,
      this.disclosureHidden = false});
  factory RankedProductOffer.fromJson(Map<String, dynamic> j) =>
      RankedProductOffer(
        offerId: j['offerId'] ?? '',
        rank: j['rank'] as int?,
        ordersCount: j['ordersCount'] as int? ?? 0,
        unitsSold: j['unitsSold'] as int? ?? 0,
        isMostPopular: j['isMostPopular'] as bool? ?? false,
        disclosureHidden: j['disclosureHidden'] as bool? ?? false,
      );
}

/// Merchant-side offer with full lifecycle status (DRAFT → PROPOSED → ACTIVE
/// etc.). Separate from the buyer-oriented [Offer] which only carries
/// display-friendly fields (storeName, isActive). The merchant model maps
/// directly to the Drizzle row returned by GET /v1/merchant/offers and
/// GET /v1/offers/:id.
class MerchantOffer {
  final String id, storeId, productId, status, currency;
  final String? variantId;
  final int? basePriceMinor, compareAtPriceMinor;
  final int moq;
  final int? orderIncrement, leadTimeDays;
  final bool isAvailable;
  final String? priceListId, warehouseId, externalRef;
  final String? proposedBy, reviewedBy;
  final String? reviewedAt, rejectionReason, activatedAt;
  final String createdAt, updatedAt;

  MerchantOffer({
    required this.id,
    required this.storeId,
    required this.productId,
    required this.status,
    required this.currency,
    this.variantId,
    this.basePriceMinor,
    this.compareAtPriceMinor,
    this.moq = 1,
    this.orderIncrement,
    this.leadTimeDays,
    this.isAvailable = true,
    this.priceListId,
    this.warehouseId,
    this.externalRef,
    this.proposedBy,
    this.reviewedBy,
    this.reviewedAt,
    this.rejectionReason,
    this.activatedAt,
    required this.createdAt,
    required this.updatedAt,
  });

  factory MerchantOffer.fromJson(Map<String, dynamic> j) => MerchantOffer(
        id: j['id'] ?? '',
        storeId: j['storeId'] ?? '',
        productId: j['productId'] ?? '',
        status: j['status'] ?? 'DRAFT',
        currency: j['currency'] ?? 'SAR',
        variantId: j['variantId'] as String?,
        basePriceMinor: j['basePriceMinor'] is int
            ? j['basePriceMinor'] as int
            : int.tryParse(j['basePriceMinor']?.toString() ?? ''),
        compareAtPriceMinor: j['compareAtPriceMinor'] is int
            ? j['compareAtPriceMinor'] as int
            : int.tryParse(j['compareAtPriceMinor']?.toString() ?? ''),
        moq: j['moq'] as int? ?? 1,
        orderIncrement: j['orderIncrement'] as int?,
        leadTimeDays: j['leadTimeDays'] as int?,
        isAvailable: j['isAvailable'] as bool? ?? true,
        priceListId: j['priceListId'] as String?,
        warehouseId: j['warehouseId'] as String?,
        externalRef: j['externalRef'] as String?,
        proposedBy: j['proposedBy'] as String?,
        reviewedBy: j['reviewedBy'] as String?,
        reviewedAt: j['reviewedAt']?.toString(),
        rejectionReason: j['rejectionReason'] as String?,
        activatedAt: j['activatedAt']?.toString(),
        createdAt: j['createdAt']?.toString() ?? '',
        updatedAt: j['updatedAt']?.toString() ?? '',
      );

  /// Whether this offer can be proposed (DRAFT or REJECTED).
  bool get canPropose => status == 'DRAFT' || status == 'REJECTED';

  /// Whether this offer can be withdrawn (anything except WITHDRAWN).
  bool get canWithdraw => status != 'WITHDRAWN';

  /// Whether pricing can be updated (not terminal).
  bool get canUpdatePricing =>
      status == 'DRAFT' || status == 'ACTIVE' || status == 'SUSPENDED';
}

/// Time-series trend bucket returned by
/// GET /v1/merchant/offers/analytics/trend.
class OfferTrendPoint {
  final String bucket;
  final int ordersCount, unitsSold, revenueMinor;
  OfferTrendPoint({
    required this.bucket,
    this.ordersCount = 0,
    this.unitsSold = 0,
    this.revenueMinor = 0,
  });
  factory OfferTrendPoint.fromJson(Map<String, dynamic> j) => OfferTrendPoint(
        bucket: j['bucket']?.toString() ?? '',
        ordersCount: j['ordersCount'] as int? ?? 0,
        unitsSold: j['unitsSold'] is int
            ? j['unitsSold'] as int
            : int.tryParse(j['unitsSold']?.toString() ?? '') ?? 0,
        revenueMinor: j['revenueMinor'] is int
            ? j['revenueMinor'] as int
            : int.tryParse(j['revenueMinor']?.toString() ?? '') ?? 0,
      );
}
