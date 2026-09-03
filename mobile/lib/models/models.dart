/// Data models for the Smart Commerce Platform.

class SearchResult {
  final List<Product> products;
  final int total;
  final String query;
  SearchResult(
      {required this.products, required this.total, required this.query});
  factory SearchResult.fromJson(Map<String, dynamic> j) => SearchResult(
        products: (j['products'] as List? ?? [])
            .map((e) => Product.fromJson(e))
            .toList(),
        total: j['total'] as int? ?? 0,
        query: j['query'] as String? ?? '',
      );
}

class Product {
  final String id, storeId, slug, title, status, createdAt;
  final String? categoryId, brandId, titleAr, description;
  final bool isAvailable;
  final int moq;
  final List<dynamic> images;
  final Map<String, dynamic> attributes;
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
      createdAt: j['createdAt'] ?? '');
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
  final String? description, logoUrl, coverUrl;
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
      required this.createdAt});
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
      createdAt: j['createdAt'] ?? '');
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
      this.storeName});
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
      storeName: j['storeName']);
}

class MasterOrder {
  final String id, buyerId, status, createdAt;
  final Map<String, dynamic> deliveryAddress;
  final String? notes;
  final List<SubOrder> subOrders;
  MasterOrder(
      {required this.id,
      required this.buyerId,
      required this.status,
      required this.deliveryAddress,
      this.notes,
      required this.createdAt,
      required this.subOrders});
  factory MasterOrder.fromJson(Map<String, dynamic> j) => MasterOrder(
      id: j['id'],
      buyerId: j['buyerId'] ?? '',
      status: j['status'] ?? '',
      deliveryAddress:
          Map<String, dynamic>.from(j['deliveryAddress'] as Map? ?? {}),
      notes: j['notes'],
      createdAt: j['createdAt'] ?? '',
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
  final String? currency;
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
      this.currency});
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
      currency: j['currency']);
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

String formatMinor(int minor, [String currency = 'SAR']) =>
    '${(minor / 100).toStringAsFixed(2)} $currency';
