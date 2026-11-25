import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import '../lib/widgets/common_widgets.dart';

void main() {
  testWidgets('QuantityStepper disables every editor while a cart action is pending',
      (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: QuantityStepper(
            value: 4,
            minQty: 1,
            enabled: false,
            onChanged: (_) {},
          ),
        ),
      ),
    );

    final buttons = tester.widgetList<IconButton>(find.byType(IconButton));
    expect(buttons, hasLength(2));
    expect(buttons.every((button) => button.onPressed == null), isTrue);
    expect(tester.widget<TextField>(find.byType(TextField)).enabled, isFalse);
  });

  testWidgets('QuantityStepper remains interactive by default', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: QuantityStepper(
            value: 4,
            minQty: 1,
            onChanged: (_) {},
          ),
        ),
      ),
    );

    final buttons = tester.widgetList<IconButton>(find.byType(IconButton));
    expect(buttons.every((button) => button.onPressed != null), isTrue);
    expect(tester.widget<TextField>(find.byType(TextField)).enabled, isTrue);
  });
}
