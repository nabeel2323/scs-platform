import 'package:flutter_test/flutter_test.dart';
import 'package:scs_platform/router/route_permissions.dart';

void main() {
  test('merchant pricing list and detail routes require pricing read access', () {
    expect(permissionRuleForRoute(Uri.parse('/merchant/pricing'))?.allows(['merchant:pricing:read']), isTrue);
    expect(permissionRuleForRoute(Uri.parse('/merchant/pricing/list-1'))?.allows(['merchant:pricing:read']), isTrue);
    expect(permissionRuleForRoute(Uri.parse('/merchant/pricing'))?.allows(['catalog:offers:write']), isFalse);
  });
}
