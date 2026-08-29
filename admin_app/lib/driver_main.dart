// Dev-only entrypoint used for automated UI testing via flutter driver /
// the Dart MCP server. Run with: flutter run -t lib/driver_main.dart
import 'package:flutter_driver/driver_extension.dart';

import 'main.dart' as app;

void main() {
  enableFlutterDriverExtension();
  app.main();
}
