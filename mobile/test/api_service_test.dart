import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:dio/dio.dart';
import 'package:scs_platform/services/api_service.dart';

class MockDio extends Mock implements Dio {}

void main() {
  late MockDio dio;
  late ApiService api;

  setUp(() {
    dio = MockDio();
    api = ApiService(dio);
  });

  group('Profile endpoints', () {
    test('fetchProfile calls GET /v1/me', () async {
      when(() => dio.get('/v1/me')).thenAnswer((_) async => Response(
            data: {
              'id': 'u1',
              'phone': '+966500000000',
              'status': 'ACTIVE',
              'createdAt': '2024-01-01',
              'fullName': 'Test User',
              'organizations': [],
            },
            requestOptions: RequestOptions(path: '/v1/me'),
            statusCode: 200,
          ));

      final profile = await api.fetchProfile();
      expect(profile.fullName, 'Test User');
      verify(() => dio.get('/v1/me')).called(1);
    });

    test('updateProfile calls PATCH /v1/me with correct data', () async {
      when(() => dio.patch('/v1/me', data: any(named: 'data')))
          .thenAnswer((_) async => Response(
                data: {
                  'id': 'u1',
                  'phone': '+966500000000',
                  'status': 'ACTIVE',
                  'createdAt': '2024-01-01',
                  'fullName': 'New Name',
                  'email': 'new@test.com',
                  'organizations': [],
                },
                requestOptions: RequestOptions(path: '/v1/me'),
                statusCode: 200,
              ));

      final profile =
          await api.updateProfile(fullName: 'New Name', email: 'new@test.com');
      expect(profile.fullName, 'New Name');
      expect(profile.email, 'new@test.com');
    });
  });

  group('Device token endpoints', () {
    test('registerDevice calls POST /v1/me/devices', () async {
      when(() => dio.post('/v1/me/devices', data: any(named: 'data')))
          .thenAnswer((_) async => Response(
                data: {},
                requestOptions: RequestOptions(path: '/v1/me/devices'),
                statusCode: 201,
              ));

      await api.registerDevice(
          token: 'fcm-token-123', platform: 'FCM', appVersion: '1.0.0');
      verify(() => dio.post('/v1/me/devices', data: {
            'token': 'fcm-token-123',
            'platform': 'FCM',
            'appVersion': '1.0.0',
          })).called(1);
    });

    test('unregisterDevice calls DELETE /v1/me/devices/:token', () async {
      when(() => dio.delete('/v1/me/devices/fcm-token-123'))
          .thenAnswer((_) async => Response(
                data: {},
                requestOptions:
                    RequestOptions(path: '/v1/me/devices/fcm-token-123'),
                statusCode: 200,
              ));

      await api.unregisterDevice('fcm-token-123');
      verify(() => dio.delete('/v1/me/devices/fcm-token-123')).called(1);
    });
  });

  group('Organization endpoints', () {
    test('fetchMyOrganizations calls GET /v1/me/organizations', () async {
      when(() => dio.get('/v1/me/organizations'))
          .thenAnswer((_) async => Response(
                data: [
                  {
                    'orgId': 'org-1',
                    'role': 'OWNER',
                    'orgName': 'Test Org',
                    'orgType': 'MERCHANT'
                  },
                ],
                requestOptions: RequestOptions(path: '/v1/me/organizations'),
                statusCode: 200,
              ));

      final orgs = await api.fetchMyOrganizations();
      expect(orgs.length, 1);
      expect(orgs[0].orgName, 'Test Org');
    });

    test('createOrganization calls POST /v1/organizations', () async {
      when(() => dio.post('/v1/organizations', data: any(named: 'data')))
          .thenAnswer((_) async => Response(
                data: {
                  'id': 'org-2',
                  'name': 'New Org',
                  'type': 'MERCHANT',
                  'country': 'SA',
                  'createdAt': '2024-01-01'
                },
                requestOptions: RequestOptions(path: '/v1/organizations'),
                statusCode: 201,
              ));

      final org = await api.createOrganization(
          name: 'New Org', type: 'MERCHANT', country: 'SA');
      expect(org.name, 'New Org');
    });

    test('switchOrg calls POST /v1/me/switch-org', () async {
      when(() => dio.post('/v1/me/switch-org', data: any(named: 'data')))
          .thenAnswer((_) async => Response(
                data: {},
                requestOptions: RequestOptions(path: '/v1/me/switch-org'),
                statusCode: 200,
              ));

      await api.switchOrg('org-1');
      verify(() => dio.post('/v1/me/switch-org', data: {'orgId': 'org-1'}))
          .called(1);
    });

    test('fetchOrgMembers calls GET /v1/organizations/:id/members', () async {
      when(() => dio.get('/v1/organizations/org-1/members'))
          .thenAnswer((_) async => Response(
                data: [
                  {
                    'userId': 'u1',
                    'orgId': 'org-1',
                    'roleId': 'OWNER',
                    'userName': 'Ahmed'
                  },
                ],
                requestOptions:
                    RequestOptions(path: '/v1/organizations/org-1/members'),
                statusCode: 200,
              ));

      final members = await api.fetchOrgMembers('org-1');
      expect(members.length, 1);
      expect(members[0].userName, 'Ahmed');
    });
  });

  group('Import endpoints', () {
    test('createImportJob calls POST /v1/stores/:id/imports', () async {
      when(() => dio.post('/v1/stores/s1/imports', data: any(named: 'data')))
          .thenAnswer((_) async => Response(
                data: {
                  'id': 'imp-1',
                  'storeId': 's1',
                  'status': 'PENDING',
                  'fileName': 'test.csv'
                },
                requestOptions: RequestOptions(path: '/v1/stores/s1/imports'),
                statusCode: 201,
              ));

      final job = await api.createImportJob('s1',
          fileName: 'test.csv', fileType: 'CSV', fileSize: 1024);
      expect(job['id'], 'imp-1');
    });
  });

  group('Existing endpoints still work', () {
    test('checkout sends idempotency key header', () async {
      when(() => dio.post('/v1/checkout',
              data: any(named: 'data'), options: any(named: 'options')))
          .thenAnswer((_) async => Response(
                data: {
                  'id': 'mo-1',
                  'buyerId': 'b1',
                  'status': 'SUBMITTED',
                  'deliveryAddress': {},
                  'createdAt': '2024-01-01',
                  'subOrders': []
                },
                requestOptions: RequestOptions(path: '/v1/checkout'),
                statusCode: 201,
              ));

      final order = await api.checkout(
          deliveryAddress: {'city': 'Riyadh'}, idempotencyKey: 'idem-1');
      expect(order.id, 'mo-1');
    });

    test('acceptOrder calls POST /v1/orders/:id/accept', () async {
      when(() => dio.post('/v1/orders/o1/accept'))
          .thenAnswer((_) async => Response(
                data: {},
                requestOptions: RequestOptions(path: '/v1/orders/o1/accept'),
                statusCode: 200,
              ));

      await api.acceptOrder('o1');
      verify(() => dio.post('/v1/orders/o1/accept')).called(1);
    });
  });
}
