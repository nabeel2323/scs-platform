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
  Future<Map<String, dynamic>> verifyOtp(String phone, String otp) async {
    final deviceId = await DeviceIdService.instance.getDeviceId();
    final deviceInfo = await DeviceIdService.instance.getDeviceInfo();
    return (await _dio.post('/v1/auth/otp/verify', data: {
      'phone': phone,
      'otp': otp,
      'deviceId': deviceId,
      'deviceInfo': deviceInfo,
    }))
        .data;
  }

  // ── Dual Authentication (Password Login) ──────────────────
  /// Login with email and password.
  /// Returns session if device is trusted, or requires OTP if device changed.
  Future<Map<String, dynamic>> loginPassword(
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
    return response.data;
  }

  /// Pre-flight check for device-based login.
  Future<Map<String, dynamic>> checkDeviceLogin(
          String email, String deviceId) async =>
      (await _dio.post('/v1/auth/login/device-check',
              data: {'email': email, 'deviceId': deviceId}))
          .data;

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
  Future<List<Map<String, dynamic>>> fetchSessions() async =>
      (await _dio.get('/v1/me/sessions')).data.cast<Map<String, dynamic>>();

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
  Future<void> switchOrg(String orgId) async =>
      _dio.post('/v1/me/switch-org', data: {'orgId': orgId});

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
  Future<List<Product>> fetchStoreProducts(String storeId,
      {String? categoryId, int? limit, int? offset}) async {
    final p = <String, dynamic>{};
    if (categoryId != null) p['categoryId'] = categoryId;
    if (limit != null) p['limit'] = limit;
    if (offset != null) p['offset'] = offset;
    return (await _dio.get('/v1/stores/$storeId/products', queryParameters: p))
        .data
        .map<Product>((e) => Product.fromJson(e))
        .toList();
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
  Future<List<SubOrder>> fetchOrders({String? status}) async {
    final p = <String, dynamic>{};
    if (status != null) p['status'] = status;
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
  Future<void> reorder(String masterOrderId) async =>
      _dio.post('/v1/orders/master/$masterOrderId/reorder');

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
  }) async {
    final d = <String, dynamic>{
      'orgId': orgId,
      'docType': docType,
      'fileName': fileName,
    };
    if (storeId != null) d['storeId'] = storeId;
    if (mimeType != null) d['mimeType'] = mimeType;
    if (fileSize != null) d['fileSize'] = fileSize;
    return (await _dio.post('/v1/documents', data: d)).data;
  }

  // ── Verification ───────────────────────────────────────────
  Future<void> submitVerification(String storeId) async =>
      _dio.post('/v1/stores/$storeId/verify');
}
