import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_localizations/flutter_localizations.dart';

import 'api.dart';
import 'services/notification_service.dart';
import 'theme.dart';
import 'screens/home_shell.dart';
import 'screens/login_screen.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  // Portrait-only: rotate the phone and the UI simply stays upright.
  await SystemChrome.setPreferredOrientations([DeviceOrientation.portraitUp]);
  SystemChrome.setSystemUIOverlayStyle(const SystemUiOverlayStyle(
    statusBarColor: emerald950,
    statusBarIconBrightness: Brightness.light,
  ));

  // Alerts fail open: if Firebase or the notification service can't start,
  // the app still runs and the 15s pending-count poll covers alerts.
  try {
    await Firebase.initializeApp();
    FirebaseMessaging.onBackgroundMessage(fcmBackgroundHandler);
    await NotificationService.instance.init();
  } catch (_) {}

  final hasSession = await Api.instance.restoreSession();
  runApp(AyraAdmin(startLoggedIn: hasSession));
}

class AyraAdmin extends StatelessWidget {
  final bool startLoggedIn;
  const AyraAdmin({super.key, required this.startLoggedIn});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Ayra Dashboard',
      debugShowCheckedModeBanner: false,
      theme: buildAyraTheme(),
      // India locale — the Material date picker renders day-first
      // ("Wed, 3 Sep") and dd/mm/yyyy input order.
      locale: const Locale('en', 'IN'),
      supportedLocales: const [Locale('en', 'IN'), Locale('en')],
      localizationsDelegates: const [
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      home: startLoggedIn ? const HomeShell() : const LoginScreen(),
    );
  }
}
