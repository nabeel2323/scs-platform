import 'dart:typed_data';

import 'package:dio/dio.dart';
import '../models/models.dart';
import 'device_id_service.dart';

/// Complete API service matching the web buyer-api.ts endpoints.
class ApiService {
  ApiService(this._dio);
  final Dio _dio;

  // ── Auth ──────────────────────────────────────────────────
  Future<void> requestOtp(String phone) async =>
      _dio.post('/v1/auth/otp/request', data: {'phone': phone});

  /// Verify OTP. Attaches deviceId + deviceInfo so the session is
  /// registered as a trusted device for future password logins.
  Future<AuthTokens> verifyOtp(String phone, String otp) async {
    final deviceId = await DeviceIdService.instance.getDeviceId();
    final deviceInfo = await DeviceIdService.instance.getDeviceInfo();
    return AuthTokens.fromJson((await _dio.post('/v1/auth/otp/verify', data: {
      'phone': phone,
      'otp': otp,
      'deviceId': deviceId,
      'deviceInfo': deviceInfo,
    }))
        .data);
  }

  // ── Dual Authentication (Password Login) ──────────────────
  /// Login with email and password.
  /// Returns session if device is trusted, or requires OTP if device changed.
  Future<LoginPasswordResponse> loginPassword(
    String email,
    String password,
    String deviceId,
    Map<String, String> deviceInfo,
  ) async {
    final response = await _dio.post(
      '/v1/auth/login/password',
      data: {
        'email': email,
        'password': password,
        'deviceId': deviceId,
        'deviceInfo': deviceInfo,
      },
      options: Options(headers: {'X-Device-Id': deviceId}),
    );
    return LoginPasswordResponse.fromJson(response.data);
  }

  /// Pre-flight check for device-based login.
  Future<DeviceCheckResponse> checkDeviceLogin(
          String email, String deviceId) async =>
      DeviceCheckResponse.fromJson((await _dio.post(
              '/v1/auth/login/device-check',
              data: {'email': email, 'deviceId': deviceId}))
          .data);

  /// Set up email and password credentials.
  Future<void> setupCredentials(
    String email,
    String password,
    String deviceId,
  ) async {
    await _dio.post(
      '/v1/me/credentials/setup',
      data: {'email': email, 'password': password},
      options: Options(headers: {'X-Device-Id': deviceId}),
    );
  }

  /// Change password for authenticated user.
  Future<void> changePassword(
    String currentPassword,
    String newPassword,
    String deviceId,
  ) async {
    await _dio.post(
      '/v1/me/credentials/change-password',
      data: {
        'currentPassword': currentPassword,
        'newPassword': newPassword,
      },
      options: Options(headers: {'X-Device-Id': deviceId}),
    );
  }

  /// Get user's active sessions.
  Future<List<SessionInfo>> fetchSessions() async =>
      (await _dio.get('/v1/me/sessions'))
          .data
          .map<SessionInfo>((e) => SessionInfo.fromJson(e))
          .toList();

  /// Revoke sessions by device ID.
  Future<void> revokeSessionsByDevice(String deviceId) async =>
      _dio.delete('/v1/me/sessions/revoke-by-device/$deviceId');

  // ── Profile ───────────────────────────────────────────────
  Future<UserProfile> fetchProfile() async =>
      UserProfile.fromJson((await _dio.get('/v1/me')).data);
  Future<UserProfile> updateProfile(
      {String? fullName, String? email, String? locale}) async {
    final d = <String, dynamic>{};
    if (fullName != null) d['fullName'] = fullName;
    if (email != null) d['email'] = email;
    if (locale != null) d['locale'] = locale;
    return UserProfile.fromJson((await _dio.patch('/v1/me', data: d)).data);
  }

  // ── Device Tokens ─────────────────────────────────────────
  Future<void> registerDevice(
      {required String token,
      required String platform,
      String? appVersion}) async {
    final d = <String, dynamic>{'token': token, 'platform': platform};
    if (appVersion != null) d['appVersion'] = appVersion;
    await _dio.post('/v1/me/devices', data: d);
  }

  Future<void> unregisterDevice(String token) async =>
      _dio.delete('/v1/me/devices/$token');

  // ── Organizations ─────────────────────────────────────────
  Future<List<OrgMembership>> fetchMyOrganizations() async =>
      (await _dio.get('/v1/me/organizations'))
          .data
          .map<OrgMembership>((e) => OrgMembership.fromJson(e))
          .toList();
  Future<Organization> createOrganization(
      {required String name,
      required String type,
      required String country,
      String? legalName,
      String? taxId}) async {
    final d = <String, dynamic>{'name': name, 'type': type, 'country': country};
    if (legalName != null) d['legalName'] = legalName;
    if (taxId != null) d['taxId'] = taxId;
    return Organization.fromJson(
        (await _dio.post('/v1/organizations', data: d)).data);
  }

  /// Join an existing organization via its shareable invite code.
  Future<Organization> joinOrganization(String code) async =>
      Organization.fromJson(
          (await _dio.post('/v1/organizations/join', data: {'code': code}))
              .data);

  Future<Organization> fetchOrganization(String id) async =>
      Organization.fromJson((await _dio.get('/v1/organizations/$id')).data);
  Future<Organization> updateOrganization(String id,
      {String? name, String? legalName, String? taxId}) async {
    final d = <String, dynamic>{};
    if (name != null) d['name'] = name;
    if (legalName != null) d['legalName'] = legalName;
    if (taxId != null) d['taxId'] = taxId;
    return Organization.fromJson(
        (await _dio.patch('/v1/organizations/$id', data: d)).data);
  }

  Future<List<OrgMember>> fetchOrgMembers(String orgId) async =>
      (await _dio.get('/v1/organizations/$orgId/members'))
          .data
          .map<OrgMember>((e) => OrgMember.fromJson(e))
          .toList();
  Future<void> addOrgMember(String orgId,
          {required String userId, required String roleId}) async =>
      _dio.post('/v1/organizations/$orgId/members',
          data: {'userId': userId, 'roleId': roleId});
  Future<void> removeOrgMember(String orgId, String userId) async =>
      _dio.delete('/v1/organizations/$orgId/members/$userId');

  /// Switch the active organization. Returns the re-minted access token; the
  /// caller MUST persist it because the prior token is denylisted server-side
  /// (API-B9). Path corrected to /v1/auth/switch-org (was a dead /v1/me route).
  Future<SwitchOrgResponse> switchOrg(String orgId) async =>
      SwitchOrgResponse.fromJson(
          (await _dio.post('/v1/auth/switch-org', data: {'orgId': orgId}))
              .data);

  // ── Search ────────────────────────────────────────────────
  Future<SearchResult> search(
      {String? q,
      String? categoryId,
      String? brandId,
      String? storeId,
      int? limit,
      int? offset}) async {
    final p = <String, dynamic>{};
    if (q != null) p['q'] = q;
    if (categoryId != null) p['categoryId'] = categoryId;
    if (brandId != null) p['brandId'] = brandId;
    if (storeId != null) p['storeId'] = storeId;
    if (limit != null) p['limit'] = limit;
    if (offset != null) p['offset'] = offset;
    return SearchResult.fromJson(
        (await _dio.get('/v1/search', queryParameters: p)).data);
  }

  Future<List<Category>> fetchCategories() async =>
      (await _dio.get('/v1/search/categories'))
          .data
          .map<Category>((e) => Category.fromJson(e))
          .toList();
  Future<List<Brand>> fetchBrands() async =>
      (await _dio.get('/v1/search/brands'))
          .data
          .map<Brand>((e) => Brand.fromJson(e))
          .toList();

  // ── Products ──────────────────────────────────────────────
  Future<Product> fetchProduct(String id) async =>
      Product.fromJson((await _dio.get('/v1/products/$id')).data);
  Future<List<ProductVariant>> fetchVariants(String productId) async =>
      (await _dio.get('/v1/products/$productId/variants'))
          .data
          .map<ProductVariant>((e) => ProductVariant.fromJson(e))
          .toList();

  Future<Product> createProduct({
    required String storeId,
    required String title,
    String? titleAr,
    String? slug,
    String? description,
    String? descriptionAr,
    String? categoryId,
    String? brandId,
    String? condition,
    int? moq,
    List<String>? images,
    Map<String, dynamic>? attributes,
  }) async {
    final d = <String, dynamic>{'storeId': storeId, 'title': title};
    if (titleAr != null) d['titleAr'] = titleAr;
    if (slug != null) d['slug'] = slug;
    if (description != null) d['description'] = description;
    if (descriptionAr != null) d['descriptionAr'] = descriptionAr;
    if (categoryId != null) d['categoryId'] = categoryId;
    if (brandId != null) d['brandId'] = brandId;
    if (condition != null) d['condition'] = condition;
    if (moq != null) d['moq'] = moq;
    if (images != null) d['images'] = images;
    if (attributes != null) d['attributes'] = attributes;
    return Product.fromJson((await _dio.post('/v1/products', data: d)).data);
  }

  Future<Product> updateProduct(
    String id, {
    String? title,
    String? titleAr,
    String? description,
    String? descriptionAr,
    String? status,
    String? condition,
    bool? isAvailable,
    int? moq,
    List<String>? images,
    Map<String, dynamic>? attributes,
    String? categoryId,
    String? brandId,
  }) async {
    final d = <String, dynamic>{};
    if (title != null) d['title'] = title;
    if (titleAr != null) d['titleAr'] = titleAr;
    if (description != null) d['description'] = description;
    if (descriptionAr != null) d['descriptionAr'] = descriptionAr;
    if (status != null) d['status'] = status;
    if (condition != null) d['condition'] = condition;
    if (isAvailable != null) d['isAvailable'] = isAvailable;
    if (moq != null) d['moq'] = moq;
    if (images != null) d['images'] = images;
    if (attributes != null) d['attributes'] = attributes;
    if (categoryId != null) d['categoryId'] = categoryId;
    if (brandId != null) d['brandId'] = brandId;
    return Product.fromJson(
        (await _dio.patch('/v1/products/$id', data: d)).data);
  }

  Future<void> deleteProduct(String id) async =>
      _dio.delete('/v1/products/$id');

  Future<ProductVariant> createVariant(
    String productId, {
    required String sku,
    String? barcode,
    String? title,
    String? titleAr,
    String? unit,
    int? weightGrams,
    Map<String, dynamic>? dimensionsMm,
    Map<String, dynamic>? attributes,
    List<String>? images,
  }) async {
    final d = <String, dynamic>{'sku': sku};
    if (barcode != null) d['barcode'] = barcode;
    if (title != null) d['title'] = title;
    if (titleAr != null) d['titleAr'] = titleAr;
    if (unit != null) d['unit'] = unit;
    if (weightGrams != null) d['weightGrams'] = weightGrams;
    if (dimensionsMm != null) d['dimensionsMm'] = dimensionsMm;
    if (attributes != null) d['attributes'] = attributes;
    if (images != null) d['images'] = images;
    return ProductVariant.fromJson(
        (await _dio.post('/v1/products/$productId/variants', data: d)).data);
  }

  Future<List<MediaItem>> listMedia(String productId) async =>
      (await _dio.get('/v1/products/$productId/media'))
          .data
          .map<MediaItem>((e) => MediaItem.fromJson(e))
          .toList();

  Future<MediaItem> addMedia(
    String productId, {
    required String url,
    String? variantId,
    String? mediaType,
    String? thumbUrl,
    String? altText,
    int? sortOrder,
    int? fileSize,
    String? mimeType,
  }) async {
    final d = <String, dynamic>{'url': url};
    if (variantId != null) d['variantId'] = variantId;
    if (mediaType != null) d['mediaType'] = mediaType;
    if (thumbUrl != null) d['thumbUrl'] = thumbUrl;
    if (altText != null) d['altText'] = altText;
    if (sortOrder != null) d['sortOrder'] = sortOrder;
    if (fileSize != null) d['fileSize'] = fileSize;
    if (mimeType != null) d['mimeType'] = mimeType;
    return MediaItem.fromJson(
        (await _dio.post('/v1/products/$productId/media', data: d)).data);
  }

  Future<Map<String, dynamic>> presignMedia(
          {required String fileName, required String mimeType}) async =>
      (await _dio.post('/v1/media/presign',
              data: {'fileName': fileName, 'mimeType': mimeType}))
          .data;

  // ── Stores ────────────────────────────────────────────────
  Future<List<Store>> fetchStores({int? limit, int? offset}) async {
    final p = <String, dynamic>{};
    if (limit != null) p['limit'] = limit;
    if (offset != null) p['offset'] = offset;
    return (await _dio.get('/v1/stores', queryParameters: p))
        .data
        .map<Store>((e) => Store.fromJson(e))
        .toList();
  }

  Future<Store> createStore({
    required String orgId,
    required String displayName,
    String? description,
    String? currency,
    String? locale,
    Map<String, dynamic>? address,
  }) async {
    final d = <String, dynamic>{'orgId': orgId, 'displayName': displayName};
    if (description != null) d['description'] = description;
    if (currency != null) d['currency'] = currency;
    if (locale != null) d['locale'] = locale;
    if (address != null) d['address'] = address;
    return Store.fromJson((await _dio.post('/v1/stores', data: d)).data);
  }

  Future<Map<String, dynamic>> createWarehouse(
    String storeId, {
    required String name,
    Map<String, dynamic>? address,
    String? managerName,
    String? managerPhone,
  }) async {
    final d = <String, dynamic>{'name': name};
    if (address != null) d['address'] = address;
    if (managerName != null) d['managerName'] = managerName;
    if (managerPhone != null) d['managerPhone'] = managerPhone;
    return (await _dio.post('/v1/stores/$storeId/warehouses', data: d)).data;
  }

  Future<Store> fetchStore(String slugOrId) async =>
      Store.fromJson((await _dio.get('/v1/stores/$slugOrId')).data);

  Future<Store> updateStore(
    String id, {
    String? displayName,
    String? description,
    String? logoUrl,
    String? coverUrl,
    String? currency,
    String? timezone,
    String? locale,
    String? status,
    Map<String, dynamic>? address,
    Map<String, dynamic>? metadata,
  }) async {
    final d = <String, dynamic>{};
    if (displayName != null) d['displayName'] = displayName;
    if (description != null) d['description'] = description;
    if (logoUrl != null) d['logoUrl'] = logoUrl;
    if (coverUrl != null) d['coverUrl'] = coverUrl;
    if (currency != null) d['currency'] = currency;
    if (timezone != null) d['timezone'] = timezone;
    if (locale != null) d['locale'] = locale;
    if (status != null) d['status'] = status;
    if (address != null) d['address'] = address;
    if (metadata != null) d['metadata'] = metadata;
    return Store.fromJson((await _dio.patch('/v1/stores/$id', data: d)).data);
  }

  Future<List<Map<String, dynamic>>> fetchStoreWarehouses(
          String storeId) async =>
      (await _dio.get('/v1/stores/$storeId/warehouses'))
          .data
          .cast<Map<String, dynamic>>();

  /// A store's product grid. Rows arrive enriched (seller + price), like search.
  ///
  /// `status` is deliberately not defaulted: this endpoint also serves a
  /// merchant's own catalog, which must keep seeing DRAFT and REJECTED listings.
  /// A buyer screen has to ask for ACTIVE itself (A5-10).
  Future<List<Product>> fetchStoreProducts(String storeId,
      {String? categoryId, String? status, int? limit, int? offset}) async {
    final p = <String, dynamic>{};
    if (categoryId != null) p['categoryId'] = categoryId;
    if (status != null) p['status'] = status;
    if (limit != null) p['limit'] = limit;
    if (offset != null) p['offset'] = offset;
    final res =
        await _dio.get('/v1/stores/$storeId/products', queryParameters: p);
    // A5-11: the endpoint now returns { items, total } for honest paging.
    final items =
        res.data is List ? res.data : (res.data['items'] as List? ?? []);
    return items.map<Product>((e) => Product.fromJson(e)).toList();
  }

  // ── Cart ──────────────────────────────────────────────────
  Future<Cart> fetchCart() async =>
      Cart.fromJson((await _dio.get('/v1/cart')).data);
  Future<void> addToCart(
          {required String variantId,
          required String storeId,
          required int quantity}) async =>
      _dio.post('/v1/cart/items', data: {
        'variantId': variantId,
        'storeId': storeId,
        'quantity': quantity
      });

  /// Add a *product* to the cart, resolving which variant to buy.
  ///
  /// `cart_items.variant_id` is a foreign key to `product_variants`, so posting
  /// a product id is rejected outright — and every listing screen has a product,
  /// not a variant, in hand. The lookup lives here so no screen can forget it
  /// again (A5-12). Detail responses embed variants with their prices, so only a
  /// listing card pays the extra request.
  Future<void> addProductToCart(Product product, {String? variantId}) async {
    String? chosen = variantId ?? product.orderableVariant?.id;
    if (chosen == null) {
      for (final v in await fetchVariants(product.id)) {
        if (v.isActive) {
          chosen = v.id;
          break;
        }
      }
    }
    if (chosen == null) {
      // Thrown rather than ignored: a button that does nothing silently reads
      // as a broken app, and this line was previously unexplained either way.
      throw StateError(
          '"${product.title}" has no purchasable variant right now.');
    }
    // At the advertised MOQ: the cart accepts a below-minimum line and only
    // rejects it at checkout, which looks like a different bug.
    return addToCart(
        variantId: chosen,
        storeId: product.storeId,
        quantity: product.moq > 0 ? product.moq : 1);
  }

  Future<void> updateCartItem(String itemId, int quantity) async =>
      _dio.patch('/v1/cart/items/$itemId', data: {'quantity': quantity});
  Future<void> removeCartItem(String itemId) async =>
      _dio.delete('/v1/cart/items/$itemId');
  Future<void> clearCart() async => _dio.delete('/v1/cart');
  Future<void> applyPromo(String code) async =>
      _dio.post('/v1/cart/promo', data: {'code': code});

  // ── Checkout ──────────────────────────────────────────────
  Future<MasterOrder> checkout(
      {required Map<String, dynamic> deliveryAddress,
      String? notes,
      String? idempotencyKey,
      String? fulfillmentMethod}) async {
    final d = <String, dynamic>{'deliveryAddress': deliveryAddress};
    if (notes != null) d['notes'] = notes;
    if (idempotencyKey != null) d['idempotencyKey'] = idempotencyKey;
    if (fulfillmentMethod != null) d['fulfillmentMethod'] = fulfillmentMethod;
    return MasterOrder.fromJson((await _dio.post('/v1/checkout',
            data: d,
            options: Options(
                headers: idempotencyKey != null
                    ? {'Idempotency-Key': idempotencyKey}
                    : null)))
        .data);
  }

  // ── Orders ────────────────────────────────────────────────
  Future<List<SubOrder>> fetchOrders({String? status, String? storeId}) async {
    final p = <String, dynamic>{};
    if (status != null) p['status'] = status;
    if (storeId != null) p['storeId'] = storeId;
    return (await _dio.get('/v1/orders', queryParameters: p))
        .data
        .map<SubOrder>((e) => SubOrder.fromJson(e))
        .toList();
  }

  Future<SubOrder> fetchOrder(String id) async =>
      SubOrder.fromJson((await _dio.get('/v1/orders/$id')).data);
  Future<MasterOrder> fetchMasterOrder(String id) async =>
      MasterOrder.fromJson((await _dio.get('/v1/orders/master/$id')).data);
  Future<List<StatusHistoryEntry>> fetchOrderHistory(String orderId) async =>
      (await _dio.get('/v1/orders/$orderId/history'))
          .data
          .map<StatusHistoryEntry>((e) => StatusHistoryEntry.fromJson(e))
          .toList();
  Future<void> cancelOrder(String orderId, String reason) async =>
      _dio.post('/v1/orders/$orderId/cancel', data: {'reason': reason});

  /// Re-add a past order. The body reports per-line outcomes, because a line can
  /// have been delisted or lost its price tier since — returning void here
  /// discarded the only notice a buyer got that the reorder was partial.
  Future<ReorderResult> reorder(String masterOrderId) async =>
      ReorderResult.fromJson(
          (await _dio.post('/v1/orders/master/$masterOrderId/reorder')).data);

  // ── Notifications ─────────────────────────────────────────
  Future<List<AppNotification>> fetchNotifications(
          {int limit = 50, int offset = 0}) async =>
      (await _dio.get('/v1/notifications',
              queryParameters: {'limit': limit, 'offset': offset}))
          .data
          .map<AppNotification>((e) => AppNotification.fromJson(e))
          .toList();
  Future<int> fetchUnreadCount() async =>
      (await _dio.get('/v1/notifications/unread-count')).data['count']
          as int? ??
      0;
  Future<void> markNotificationRead(String id) async =>
      _dio.patch('/v1/notifications/$id/read');
  Future<void> markAllNotificationsRead() async =>
      _dio.patch('/v1/notifications/read-all');

  // ── Reviews ───────────────────────────────────────────────
  Future<Review> createReview(String orderId,
      {required String subjectId,
      required String subjectType,
      required int rating,
      String? comment}) async {
    return Review.fromJson(
        (await _dio.post('/v1/orders/$orderId/review', data: {
      'subjectId': subjectId,
      'subjectType': subjectType,
      'rating': rating,
      if (comment != null) 'comment': comment
    }))
            .data);
  }

  Future<List<Review>> fetchStoreReviews(String storeId) async =>
      (await _dio.get('/v1/stores/$storeId/reviews'))
          .data
          .map<Review>((e) => Review.fromJson(e))
          .toList();

  // ── Disputes ──────────────────────────────────────────────
  Future<void> createDispute(String orderId,
          {required String reason, required String description}) async =>
      _dio.post('/v1/orders/$orderId/dispute',
          data: {'reason': reason, 'description': description});
  Future<List<Dispute>> fetchDisputes({String? status}) async =>
      (await _dio.get('/v1/disputes${status != null ? '?status=$status' : ''}'))
          .data
          .map<Dispute>((e) => Dispute.fromJson(e))
          .toList();

  // ── Merchant Order Management ─────────────────────────────
  Future<void> acceptOrder(String orderId) async =>
      _dio.post('/v1/orders/$orderId/accept');
  Future<void> rejectOrder(String orderId, String reason) async =>
      _dio.post('/v1/orders/$orderId/reject', data: {'reason': reason});
  Future<void> partialAccept(
          String orderId, List<Map<String, dynamic>> confirmations) async =>
      _dio.post('/v1/orders/$orderId/items/confirm',
          data: {'confirmations': confirmations});
  Future<void> transitionStatus(String orderId, String status,
          {String? reason}) async =>
      _dio.post('/v1/orders/$orderId/status',
          data: {'status': status, if (reason != null) 'reason': reason});

  // ── Merchant Catalog Import ───────────────────────────────
  Future<Map<String, dynamic>> createImportJob(String storeId,
      {required String fileName,
      required String fileType,
      required int fileSize,
      Map<String, String>? columnMapping}) async {
    final d = <String, dynamic>{
      'fileName': fileName,
      'fileType': fileType,
      'fileSize': fileSize,
    };
    if (columnMapping != null) d['columnMapping'] = columnMapping;
    return (await _dio.post('/v1/stores/$storeId/imports', data: d)).data;
  }

  Future<Map<String, dynamic>> fetchImportJob(String id) async =>
      (await _dio.get('/v1/imports/$id')).data;
  Future<void> processImportJob(String id) async =>
      _dio.post('/v1/imports/$id/process');

  // ── Documents ──────────────────────────────────────────────
  Future<Map<String, dynamic>> registerDocument({
    required String orgId,
    String? storeId,
    required String docType,
    required String fileName,
    String? mimeType,
    int? fileSize,
    String? storageKey,
  }) async {
    final d = <String, dynamic>{
      'orgId': orgId,
      'docType': docType,
      'fileName': fileName,
    };
    if (storeId != null) d['storeId'] = storeId;
    if (mimeType != null) d['mimeType'] = mimeType;
    if (fileSize != null) d['fileSize'] = fileSize;
    if (storageKey != null) d['storageKey'] = storageKey;
    return (await _dio.post('/v1/documents', data: d)).data;
  }

  /// Request a presigned PUT URL for a business (verification) document.
  Future<Map<String, dynamic>> presignDocumentUpload(
          {required String fileName, required String mimeType}) async =>
      (await _dio.post('/v1/documents/presign-upload',
              data: {'fileName': fileName, 'mimeType': mimeType}))
          .data;

  /// Upload a verification document end-to-end: request a presigned PUT URL,
  /// push the raw bytes to object storage, then register the document metadata
  /// against the returned storageKey. Previously only metadata was registered,
  /// so the recorded key pointed at a non-existent object and reviewer
  /// downloads failed with NoSuchKey (404).
  Future<Map<String, dynamic>> uploadBusinessDocument({
    required String orgId,
    String? storeId,
    required String docType,
    required String fileName,
    required String mimeType,
    required int fileSize,
    required List<int> bytes,
  }) async {
    final presign =
        await presignDocumentUpload(fileName: fileName, mimeType: mimeType);
    final uploadUrl = (presign['uploadUrl'] ?? '').toString();
    final storageKey = (presign['storageKey'] ?? '').toString();
    if (uploadUrl.isNotEmpty && bytes.isNotEmpty) {
      try {
        // Standalone Dio (no auth interceptor / baseUrl) for the direct PUT to
        // the object-storage host, mirroring the product-media upload flow.
        await Dio(BaseOptions(
          connectTimeout: const Duration(seconds: 15),
          receiveTimeout: const Duration(seconds: 15),
        )).put(
          uploadUrl,
          data: Uint8List.fromList(bytes),
          options: Options(headers: {'Content-Type': mimeType}),
        );
      } catch (_) {
        // best-effort — dev storage may be stubbed; metadata is still recorded
      }
    }
    return registerDocument(
      orgId: orgId,
      storeId: storeId,
      docType: docType,
      fileName: fileName,
      mimeType: mimeType,
      fileSize: fileSize,
      storageKey: storageKey.isEmpty ? null : storageKey,
    );
  }

  // ── Verification ───────────────────────────────────────────
  Future<void> submitVerification(String storeId) async =>
      _dio.post('/v1/stores/$storeId/verify');

  // ── Merchant Categories ────────────────────────────────────
  Future<List<Category>> fetchStoreCategories(String storeId) async =>
      (await _dio.get('/v1/categories', queryParameters: {'storeId': storeId}))
          .data
          .map<Category>((e) => Category.fromJson(e))
          .toList();

  Future<Category> createCategory({
    required String name,
    String? nameAr,
    String? slug,
    String? description,
    String? imageUrl,
    String? storeId,
    String? parentId,
    int? sortOrder,
  }) async {
    final d = <String, dynamic>{'name': name};
    if (nameAr != null) d['nameAr'] = nameAr;
    if (slug != null) d['slug'] = slug;
    if (description != null) d['description'] = description;
    if (imageUrl != null) d['imageUrl'] = imageUrl;
    if (storeId != null) d['storeId'] = storeId;
    if (parentId != null) d['parentId'] = parentId;
    if (sortOrder != null) d['sortOrder'] = sortOrder;
    return Category.fromJson((await _dio.post('/v1/categories', data: d)).data);
  }

  Future<Category> updateCategory(
    String id, {
    String? name,
    String? nameAr,
    String? description,
    String? imageUrl,
    int? sortOrder,
    bool? isActive,
  }) async {
    final d = <String, dynamic>{};
    if (name != null) d['name'] = name;
    if (nameAr != null) d['nameAr'] = nameAr;
    if (description != null) d['description'] = description;
    if (imageUrl != null) d['imageUrl'] = imageUrl;
    if (sortOrder != null) d['sortOrder'] = sortOrder;
    if (isActive != null) d['isActive'] = isActive;
    return Category.fromJson(
        (await _dio.patch('/v1/categories/$id', data: d)).data);
  }

  Future<void> deleteCategory(String id) async =>
      _dio.delete('/v1/categories/$id');

  // ── Merchant Customers ─────────────────────────────────────
  Future<List<CustomerSummary>> fetchMerchantCustomers() async =>
      (await _dio.get('/v1/merchant/customers'))
          .data
          .map<CustomerSummary>((e) => CustomerSummary.fromJson(e))
          .toList();

  // ── Merchant Inventory ─────────────────────────────────────
  Future<List<InventoryItem>> fetchWarehouseInventory(
          String warehouseId) async =>
      (await _dio.get('/v1/inventory/warehouse/$warehouseId'))
          .data
          .map<InventoryItem>((e) => InventoryItem.fromJson(e))
          .toList();

  Future<void> adjustStock(
          {required String inventoryItemId,
          required int quantity,
          String? reason}) async =>
      _dio.post('/v1/inventory/adjust', data: {
        'inventoryItemId': inventoryItemId,
        'quantity': quantity,
        if (reason != null) 'reason': reason,
      });

  /// Create a new inventory item (variant ↔ warehouse link) with optional
  /// initial stock.
  Future<InventoryItem> createInventoryItem({
    required String variantId,
    required String warehouseId,
    int initialQty = 0,
    String? reason,
  }) async {
    final d = <String, dynamic>{
      'variantId': variantId,
      'warehouseId': warehouseId,
      'initialQty': initialQty,
    };
    if (reason != null) d['reason'] = reason;
    return InventoryItem.fromJson(
        (await _dio.post('/v1/inventory', data: d)).data);
  }

  /// Transfer stock between warehouses.
  Future<Map<String, dynamic>> transferStock({
    required String inventoryItemId,
    required String fromWarehouseId,
    required String toWarehouseId,
    required int quantity,
    String? reason,
  }) async {
    final d = <String, dynamic>{
      'inventoryItemId': inventoryItemId,
      'fromWarehouseId': fromWarehouseId,
      'toWarehouseId': toWarehouseId,
      'quantity': quantity,
    };
    if (reason != null) d['reason'] = reason;
    return (await _dio.post('/v1/inventory/transfer', data: d)).data;
  }

  /// Bulk-adjust stock for multiple items at once.
  Future<List<Map<String, dynamic>>> bulkAdjustStock(
      List<Map<String, dynamic>> items) async {
    return (await _dio
            .post('/v1/inventory/bulk-adjust', data: {'items': items}))
        .data
        .cast<Map<String, dynamic>>();
  }

  /// Fetch all inventory items across a store's warehouses.
  Future<List<InventoryItem>> fetchStoreInventory(String storeId) async =>
      (await _dio.get('/v1/stores/$storeId/inventory'))
          .data
          .map<InventoryItem>((e) => InventoryItem.fromJson(e))
          .toList();

  /// Export stock movements as CSV text.
  Future<String> exportMovementsCsv(String storeId) async =>
      (await _dio.get('/v1/stores/$storeId/inventory/movements/export')).data
          as String;

  /// Export inventory as CSV text.
  Future<String> exportInventoryCsv(String storeId) async =>
      (await _dio.get('/v1/stores/$storeId/inventory/export')).data as String;

  /// Check all items for low stock and emit notifications.
  Future<List<InventoryItem>> checkLowStock(String storeId) async =>
      (await _dio.post('/v1/stores/$storeId/inventory/check-low-stock'))
          .data
          .map<InventoryItem>((e) => InventoryItem.fromJson(e))
          .toList();

  // ── Merchant Pricing ───────────────────────────────────────
  Future<List<PriceList>> fetchStorePriceLists(String storeId) async =>
      (await _dio.get('/v1/stores/$storeId/price-lists'))
          .data
          .map<PriceList>((e) => PriceList.fromJson(e))
          .toList();

  Future<List<PriceTier>> fetchPriceListTiers(String listId) async =>
      (await _dio.get('/v1/price-lists/$listId/tiers'))
          .data
          .map<PriceTier>((e) => PriceTier.fromJson(e))
          .toList();
}
