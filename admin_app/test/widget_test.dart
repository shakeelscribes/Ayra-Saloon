import 'package:flutter_test/flutter_test.dart';

import 'package:admin_app/theme.dart';

void main() {
  test('inr formats with Indian digit grouping', () {
    expect(inr(0), '₹0');
    expect(inr(1250), '₹1,250');
    expect(inr(125000), '₹1,25,000');
    expect(inr(1250000), '₹12,50,000');
  });

  test('fmtTime converts 24h to 12h', () {
    expect(fmtTime('00:30'), '12:30 AM');
    expect(fmtTime('09:05'), '9:05 AM');
    expect(fmtTime('12:00'), '12:00 PM');
    expect(fmtTime('14:00'), '2:00 PM');
    expect(fmtTime(null), '—');
  });

  test('telHref normalizes stored phone formats', () {
    expect(telHref('98765 43210'), 'tel:+919876543210');
    expect(telHref('+919876543210'), 'tel:+919876543210');
    expect(telHref(null), isNull);
  });
}
