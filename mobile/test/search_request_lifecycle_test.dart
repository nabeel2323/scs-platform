import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';

import 'package:scs_platform/models/models.dart';
import 'package:scs_platform/providers/providers.dart';
import 'package:scs_platform/screens/search/search_screen.dart';
import 'package:scs_platform/services/api_service.dart';

class _MockDio extends Mock implements Dio {}

UserProfile _profile() => UserProfile(
      id: 'buyer-1',
      status: 'ACTIVE',
      createdAt: '2026-11-22T10:00:00.000Z',
    );

Response<dynamic> _searchResponse(String title) => Response<dynamic>(
      data: {
        'items': [
          {
            'id': title.toLowerCase().replaceAll(' ', '-'),
            'storeId': 'store-1',
            'slug': title.toLowerCase().replaceAll(' ', '-'),
            'title': title,
            'status': 'ACTIVE',
            'isAvailable': true,
            'moq': 1,
            'createdAt': '2026-11-22T10:00:00.000Z',
          },
        ],
        'total': 1,
        'query': title,
        'facets': [],
      },
      requestOptions: RequestOptions(path: '/v1/search'),
      statusCode: 200,
    );

void main() {
  testWidgets('ignores an older search response after a newer query starts',
      (tester) async {
    final dio = _MockDio();
    final pending = <String?, Completer<Response<dynamic>>>{};

    when(() => dio.get('/v1/search',
            queryParameters: any(named: 'queryParameters')))
        .thenAnswer((invocation) {
      final params =
          invocation.namedArguments[#queryParameters] as Map<String, dynamic>;
      final query = params['q'] as String?;
      final completer = Completer<Response<dynamic>>();
      pending[query] = completer;
      return completer.future;
    });

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          apiServiceProvider.overrideWithValue(ApiService(dio)),
          categoriesProvider.overrideWith((ref) async => <Category>[]),
          profileProvider.overrideWith((ref) async => _profile()),
        ],
        child: const MaterialApp(home: SearchScreen()),
      ),
    );

    // SearchScreen starts its initial, unfiltered request after the first frame.
    await tester.pump();
    expect(pending.containsKey(null), isTrue);

    await tester.enterText(find.byType(TextField).first, 'laptop');
    await tester.pump(const Duration(milliseconds: 350));
    expect(pending.containsKey('laptop'), isTrue);

    pending['laptop']!.complete(_searchResponse('Laptop Result'));
    await tester.pumpAndSettle();
    expect(find.text('Laptop Result'), findsOneWidget);

    // The initial request finishes last. It must not replace the newer query.
    pending[null]!.complete(_searchResponse('Old Search Result'));
    await tester.pumpAndSettle();

    expect(find.text('Laptop Result'), findsOneWidget);
    expect(find.text('Old Search Result'), findsNothing);
  });
}
