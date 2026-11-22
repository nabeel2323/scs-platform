/// Client-side route affordance policy. The API remains authoritative.
class RoutePermissionRule {
  const RoutePermissionRule({this.allOf = const [], this.anyOf = const []});
  final List<String> allOf;
  final List<String> anyOf;

  bool allows(Iterable<String> grantedPermissions) {
    final granted = grantedPermissions.toSet();
    return allOf.every(granted.contains) &&
        (anyOf.isEmpty || anyOf.any(granted.contains));
  }

  List<String> missingRequirements(Iterable<String> grantedPermissions) {
    final granted = grantedPermissions.toSet();
    final missing = allOf.where((permission) => !granted.contains(permission)).toList();
    if (anyOf.isNotEmpty && !anyOf.any(granted.contains)) {
      missing.add('one of: ${anyOf.join(', ')}');
    }
    return missing;
  }
}

RoutePermissionRule? permissionRuleForRoute(Uri uri) {
  final path = uri.path;
  if (path == '/search' || path.startsWith('/products/')) {
    return const RoutePermissionRule(allOf: ['catalog:products:read']);
  }
  if (path == '/stores' || path.startsWith('/stores/')) {
    return const RoutePermissionRule(allOf: ['merchant:stores:read']);
  }
  if (path == '/cart' || path == '/checkout') {
    return const RoutePermissionRule(allOf: ['orders:write']);
  }
  if (path == '/orders' || path.startsWith('/orders/')) {
    return const RoutePermissionRule(allOf: ['orders:read']);
  }
  if (path == '/driver/shipments') {
    return const RoutePermissionRule(allOf: ['fulfillment:shipments:read']);
  }
  if (path == '/merchant') {
    switch (uri.queryParameters['tab']) {
      case 'orders':
        return const RoutePermissionRule(allOf: ['merchant:orders:read']);
      case 'catalog':
        return const RoutePermissionRule(allOf: ['catalog:products:read']);
      case 'inventory':
        return const RoutePermissionRule(allOf: ['merchant:inventory:read']);
      case 'account':
        return null;
      default:
        return const RoutePermissionRule(allOf: ['merchant:stores:read']);
    }
  }
  if (path == '/merchant/orders') {
    return const RoutePermissionRule(allOf: ['merchant:orders:read']);
  }
  if (path == '/merchant/store') {
    return const RoutePermissionRule(allOf: ['merchant:stores:read']);
  }
  if (path == '/merchant/catalog') {
    return const RoutePermissionRule(allOf: ['catalog:products:read']);
  }
  if (path == '/merchant/catalog/new' || path.startsWith('/merchant/catalog/product/')) {
    return const RoutePermissionRule(allOf: ['merchant:products:write']);
  }
  if (path == '/merchant/categories') {
    return const RoutePermissionRule(allOf: ['catalog:categories:write']);
  }
  if (path == '/merchant/customers') {
    return const RoutePermissionRule(allOf: ['merchant:orders:read']);
  }
  if (path == '/merchant/offers' || path.startsWith('/merchant/offers/')) {
    return const RoutePermissionRule(allOf: ['catalog:offers:write']);
  }
  if (path == '/merchant/inventory') {
    return const RoutePermissionRule(allOf: ['merchant:inventory:read']);
  }
  return null;
}
