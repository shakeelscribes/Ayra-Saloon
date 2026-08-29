import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'api.dart';
import 'theme.dart';
import 'screens/home_shell.dart';
import 'screens/login_screen.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  SystemChrome.setSystemUIOverlayStyle(const SystemUiOverlayStyle(
    statusBarColor: emerald950,
    statusBarIconBrightness: Brightness.light,
  ));
  final hasSession = await Api.instance.restoreSession();
  runApp(AyraAdmin(startLoggedIn: hasSession));
}

class AyraAdmin extends StatelessWidget {
  final bool startLoggedIn;
  const AyraAdmin({super.key, required this.startLoggedIn});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Ayra Saloon — Staff',
      debugShowCheckedModeBanner: false,
      theme: buildAyraTheme(),
      home: startLoggedIn ? const HomeShell() : const LoginScreen(),
    );
  }
}
