import 'package:flutter/material.dart';

import '../api.dart';
import '../theme.dart';
import 'home_shell.dart';

/// "Switchboard" login — mirrors frontend-admin/src/components/Login.jsx.
/// One form, one segmented door toggle (Stylist emerald / Admin gold); accent,
/// copy and CTA swap with the door. The door is cosmetic: the backend decides
/// the role and the app routes by it, so the wrong door is harmless and gets a
/// toast explaining where you landed.
class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _email = TextEditingController();
  final _password = TextEditingController();
  bool _busy = false;
  bool _obscure = true;
  String _door = 'stylist';
  String? _error;

  @override
  void initState() {
    super.initState();
    // Dev-only auto-fill (inert in release builds — no dart-define): the
    // emulator IME is unreliable for automated alert testing. Credentials
    // come from the build defines, never hardcoded.
    const devEmail = String.fromEnvironment('AYRA_DEV_EMAIL');
    const devPass = String.fromEnvironment('AYRA_DEV_PASSWORD');
    if (devEmail.isNotEmpty && devPass.isNotEmpty) {
      _email.text = devEmail;
      _password.text = devPass;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) _submit();
      });
    }
  }

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final email = _email.text.trim();
    final password = _password.text;
    if (email.isEmpty || password.isEmpty) {
      setState(() => _error = 'Enter your email and password.');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await Api.instance.login(email, password);
      if (!mounted) return;
      final role = Api.instance.user?.role;
      if (role == 'stylist') {
        final name = Api.instance.user?.name ?? 'there';
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
            content: Text("Welcome back, $name — this is your chair's dashboard")));
      } else if (role == 'owner') {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
            content: Text('Signed in as Owner — opening the salon console')));
      }
      Navigator.of(context).pushReplacement(
        MaterialPageRoute(builder: (_) => const HomeShell()),
      );
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final accent = _door == 'stylist' ? emerald300 : gold500;
    final displayStyle = Theme.of(context)
        .appBarTheme
        .titleTextStyle
        ?.copyWith(fontSize: 26);

    final seg = Container(
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: emerald950.withValues(alpha: 0.7),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: gold500.withValues(alpha: 0.2)),
      ),
      child: Row(
        children: [
          _SegItem(
            label: 'Stylist',
            icon: Icons.content_cut,
            accent: emerald300,
            active: _door == 'stylist',
            onTap: () => setState(() => _door = 'stylist'),
          ),
          _SegItem(
            label: 'Admin',
            icon: Icons.workspace_premium,
            accent: gold500,
            active: _door == 'admin',
            onTap: () => setState(() => _door = 'admin'),
          ),
        ],
      ),
    );

    final titleRow = AnimatedSwitcher(
      duration: const Duration(milliseconds: 220),
      switchInCurve: Curves.easeOutCubic,
      switchOutCurve: Curves.easeOutCubic,
      transitionBuilder: (child, animation) => FadeTransition(
        opacity: animation,
        child: SlideTransition(
          position: Tween<Offset>(
            begin: const Offset(0, 0.05),
            end: Offset.zero,
          ).animate(animation),
          child: child,
        ),
      ),
      child: Row(
        key: ValueKey(_door),
        children: [
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              color: accent.withValues(alpha: 0.12),
              shape: BoxShape.circle,
            ),
            child: Icon(
              _door == 'stylist' ? Icons.content_cut : Icons.workspace_premium,
              size: 20,
              color: accent,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  _door == 'stylist' ? 'Stylist Login' : 'Admin Login',
                  style: TextStyle(
                      color: cream,
                      fontSize: 20,
                      fontWeight: FontWeight.w600,
                      fontFamily: displayStyle?.fontFamily),
                ),
                const SizedBox(height: 2),
                Text(
                  _door == 'stylist'
                      ? 'Your schedule & your earnings'
                      : 'Salon-wide stats, expenses & budget',
                  style: const TextStyle(color: emerald300, fontSize: 12),
                ),
              ],
            ),
          ),
        ],
      ),
    );

    final cta = AnimatedSwitcher(
      duration: const Duration(milliseconds: 220),
      switchInCurve: Curves.easeOutCubic,
      switchOutCurve: Curves.easeOutCubic,
      transitionBuilder: (child, animation) => FadeTransition(
        opacity: animation,
        child: child,
      ),
      child: TextButton(
        key: ValueKey('cta-$_door'),
        onPressed: _busy ? null : _submit,
        style: TextButton.styleFrom(
          foregroundColor: emerald950,
          backgroundColor: accent,
          padding: const EdgeInsets.symmetric(vertical: 13),
          shape: const StadiumBorder(),
          textStyle:
              const TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
        ),
        child: _busy
            ? const SizedBox(
                width: 18,
                height: 18,
                child: CircularProgressIndicator(
                    strokeWidth: 2, color: emerald950))
            : SizedBox(
                width: double.infinity,
                child: Text(
                  _door == 'stylist' ? 'Sign in to my chair' : 'Sign in to console',
                  textAlign: TextAlign.center,
                ),
              ),
      ),
    );

    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 28, vertical: 32),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Brand
                  Center(
                    child: Image.asset('assets/brand/ayra-icon.png',
                        width: 56, height: 56),
                  ),
                  const SizedBox(height: 12),
                  Center(
                    child: Text('Ayra Unisex Salon', style: displayStyle),
                  ),
                  const Center(child: GoldRule()),
                  const SizedBox(height: 6),
                  const Center(
                    child: Text('Staff panel — choose your door and sign in',
                        style: TextStyle(color: emerald300, fontSize: 13)),
                  ),
                  const SizedBox(height: 26),

                  // Door toggle
                  seg,
                  const SizedBox(height: 18),

                  // One form — accent follows the door
                  ClipRRect(
                    borderRadius: BorderRadius.circular(16),
                    child: GlassCard(
                      padding: EdgeInsets.zero,
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          // Persistent accent bar — crossfades, never remounts.
                          AnimatedContainer(
                            duration: const Duration(milliseconds: 220),
                            curve: Curves.easeOut,
                            height: 4,
                            color: accent,
                          ),
                          Padding(
                            padding: const EdgeInsets.all(22),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                titleRow,
                                const SizedBox(height: 16),
                                const Text('Email',
                                    style: TextStyle(
                                        color: emerald300, fontSize: 12)),
                                const SizedBox(height: 6),
                                TextField(
                                  key: const ValueKey('email_field'),
                                  controller: _email,
                                  keyboardType: TextInputType.emailAddress,
                                  autofillHints: const [AutofillHints.email],
                                  decoration: const InputDecoration(
                                      hintText: 'you@ayrasaloon.com'),
                                ),
                                const SizedBox(height: 14),
                                const Text('Password',
                                    style: TextStyle(
                                        color: emerald300, fontSize: 12)),
                                const SizedBox(height: 6),
                                TextField(
                                  key: const ValueKey('password_field'),
                                  controller: _password,
                                  obscureText: _obscure,
                                  autofillHints: const [
                                    AutofillHints.password
                                  ],
                                  onSubmitted: (_) => _submit(),
                                  decoration: InputDecoration(
                                    hintText: '••••••••',
                                    suffixIcon: IconButton(
                                      icon: Icon(
                                          _obscure
                                              ? Icons.visibility_off
                                              : Icons.visibility,
                                          size: 18,
                                          color: emerald300),
                                      onPressed: () =>
                                          setState(() => _obscure = !_obscure),
                                    ),
                                  ),
                                ),
                                if (_error != null) ...[
                                  const SizedBox(height: 12),
                                  Text(_error!,
                                      style: const TextStyle(
                                          color: red400, fontSize: 12.5)),
                                ],
                                const SizedBox(height: 18),
                                SizedBox(width: double.infinity, child: cta),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 24),
                  const Center(
                    child: Text(
                      'Either door signs you in — the panel opens where your role belongs.',
                      textAlign: TextAlign.center,
                      style: TextStyle(color: emerald500, fontSize: 12),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// One side of the segmented door toggle — active side gets an accent-tinted
/// pill that fades in over 250ms (no sliding pill; color crossfade only).
class _SegItem extends StatelessWidget {
  final String label;
  final IconData icon;
  final Color accent;
  final bool active;
  final VoidCallback onTap;

  const _SegItem({
    required this.label,
    required this.icon,
    required this.accent,
    required this.active,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final reduced = MediaQuery.maybeDisableAnimationsOf(context) ?? false;
    return Expanded(
      child: PressableScale(
        child: GestureDetector(
          onTap: onTap,
          child: AnimatedContainer(
            duration:
                reduced ? Duration.zero : const Duration(milliseconds: 250),
            curve: Curves.easeOut,
            height: 42,
            decoration: BoxDecoration(
              color: active
                  ? accent.withValues(alpha: 0.12)
                  : Colors.transparent,
              border: Border.all(
                color: active ? accent.withValues(alpha: 0.4) : Colors.transparent,
              ),
              borderRadius: BorderRadius.circular(999),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(
                  icon,
                  size: 16,
                  color: active ? accent : emerald300.withValues(alpha: 0.5),
                ),
                const SizedBox(width: 7),
                Text(
                  label,
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight:
                        active ? FontWeight.w600 : FontWeight.w400,
                    color: active
                        ? cream
                        : emerald300.withValues(alpha: 0.5),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
