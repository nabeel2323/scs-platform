import 'package:flutter_test/flutter_test.dart';
import '../lib/core/reference_data.dart';

void main() {
  group('ISO reference selectors', () {
    test('contains the full ISO 3166-1 country and territory set', () {
      expect(countryOptions, hasLength(249));
      expect(countryOptions.map((item) => item.code).toSet(), hasLength(249));
      expect(countryOptions.every((item) => RegExp(r'^[A-Z]{2}$').hasMatch(item.code)), isTrue);
    });

    test('uses the correct minor-unit precision for currencies', () {
      expect(currencyOptions.length, greaterThanOrEqualTo(150));
      expect(currencyMinorUnits('JPY'), 0);
      expect(currencyMinorUnits('USD'), 2);
      expect(currencyMinorUnits('KWD'), 3);
      expect(currencyMinorUnitScale('JPY'), 1);
      expect(currencyMinorUnitScale('KWD'), 1000);
    });
  });
}
