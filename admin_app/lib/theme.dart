/// Ayra Saloon visual language — mirrors frontend-admin/tailwind.config.js.
/// Emerald 950 scaffold, gold accents, cream text; Cormorant Garamond for
/// display type, Jost for body.
library;

import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

// ── Palette (same hex values as the web panel) ───────────────────────────────
const emerald950 = Color(0xFF0d1f17);
const emerald900 = Color(0xFF1a3a2a);
const emerald800 = Color(0xFF1e4a35);
const emerald700 = Color(0xFF2a5c42);
const emerald600 = Color(0xFF3a7a58);
const emerald500 = Color(0xFF4a8a68);
const emerald300 = Color(0xFF86b89d);
const emerald400 = Color(0xFF5f9a7a);
const gold300 = Color(0xFFf0d080);
const gold400 = Color(0xFFd4a848);
const gold500 = Color(0xFFc9a84c);
const gold600 = Color(0xFFa8862a);
const gold700 = Color(0xFF8a6e1e);
const cream = Color(0xFFfaf6ee);
const amber400 = Color(0xFFfbbf24);
const red400 = Color(0xFFf87171);
const violet300 = Color(0xFFc4b5fd);
const violet400 = Color(0xFFa78bfa);
const sky300 = Color(0xFF7dd3fc); // "For boys" section accent
const pink300 = Color(0xFFf9a8d4); // "For girls" section accent

const goldGradient = LinearGradient(
  begin: Alignment.topLeft,
  end: Alignment.bottomRight,
  colors: [gold500, gold300, gold600],
);

ThemeData buildAyraTheme() {
  final base = ThemeData(
    useMaterial3: true,
    brightness: Brightness.dark,
    scaffoldBackgroundColor: emerald950,
    colorScheme: const ColorScheme.dark(
      primary: gold500,
      secondary: emerald600,
      surface: emerald900,
      error: red400,
    ),
  );

  final jost = GoogleFonts.jostTextTheme(base.textTheme)
      .apply(bodyColor: cream, displayColor: cream);

  return base.copyWith(
    textTheme: jost,
    // Display font — Cormorant Garamond for headings, like font-display on web.
    appBarTheme: AppBarTheme(
      backgroundColor: emerald950,
      elevation: 0,
      centerTitle: false,
      titleTextStyle: GoogleFonts.cormorantGaramond(
        fontSize: 24,
        fontWeight: FontWeight.w600,
        color: cream,
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: emerald900.withValues(alpha: 0.6),
      hintStyle: const TextStyle(color: emerald500),
      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(color: emerald700),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: BorderSide(color: emerald700.withValues(alpha: 0.7)),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(color: gold500, width: 1.2),
      ),
    ),
    dropdownMenuTheme: DropdownMenuThemeData(
      textStyle: jost.bodyMedium,
      inputDecorationTheme: const InputDecorationTheme(
        filled: true,
        fillColor: emerald900,
        border: OutlineInputBorder(borderSide: BorderSide(color: emerald700)),
      ),
    ),
    datePickerTheme: DatePickerThemeData(
      backgroundColor: emerald900,
      headerForegroundColor: cream,
    ),
    snackBarTheme: SnackBarThemeData(
      backgroundColor: emerald800,
      contentTextStyle: jost.bodyMedium,
      behavior: SnackBarBehavior.floating,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
    ),
    dividerTheme: DividerThemeData(color: emerald700.withValues(alpha: 0.5)),
  );
}

// ── Shared widgets ───────────────────────────────────────────────────────────

/// "glass-card" — translucent emerald panel with a hairline border.
class GlassCard extends StatelessWidget {
  final Widget child;
  final EdgeInsetsGeometry padding;
  final Color? border;
  const GlassCard({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(16),
    this.border,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: padding,
      decoration: BoxDecoration(
        color: emerald900.withValues(alpha: 0.55),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: border ?? emerald700.withValues(alpha: 0.4)),
      ),
      child: child,
    );
  }
}

/// "btn-gold" — gold gradient pill, dark text.
class GoldButton extends StatelessWidget {
  final String label;
  final VoidCallback? onPressed;
  final bool busy;
  final IconData? icon;
  const GoldButton({
    super.key,
    required this.label,
    this.onPressed,
    this.busy = false,
    this.icon,
  });

  @override
  Widget build(BuildContext context) {
    return PressableScale(
      child: Opacity(
        opacity: (onPressed == null || busy) ? 0.5 : 1,
        child: DecoratedBox(
          decoration: BoxDecoration(
            gradient: goldGradient,
            borderRadius: BorderRadius.circular(999),
          ),
          child: TextButton(
            onPressed: (onPressed == null || busy) ? null : onPressed,
            style: TextButton.styleFrom(
              foregroundColor: emerald950,
              padding: const EdgeInsets.symmetric(horizontal: 22, vertical: 12),
              shape: const StadiumBorder(),
            ),
            child: busy
                ? const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      color: emerald950,
                    ),
                  )
                : Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      if (icon != null) ...[
                        Icon(icon, size: 16),
                        const SizedBox(width: 6),
                      ],
                      Text(
                        label,
                        style: const TextStyle(
                          fontWeight: FontWeight.w600,
                          fontSize: 13,
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

/// "btn-outline" — hairline emerald pill.
class OutlineButton extends StatelessWidget {
  final String label;
  final VoidCallback? onPressed;
  final IconData? icon;
  final Color? textColor;
  const OutlineButton({
    super.key,
    required this.label,
    this.onPressed,
    this.icon,
    this.textColor,
  });

  @override
  Widget build(BuildContext context) {
    return PressableScale(
      child: OutlinedButton(
        onPressed: onPressed,
        style: OutlinedButton.styleFrom(
          foregroundColor: textColor ?? cream,
          side: BorderSide(
            color: (textColor ?? emerald300).withValues(alpha: 0.6),
          ),
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
          shape: const StadiumBorder(),
          textStyle: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (icon != null) ...[
              Icon(icon, size: 16),
              const SizedBox(width: 6),
            ],
            Text(label),
          ],
        ),
      ),
    );
  }
}

/// Section heading — Cormorant Garamond, like font-display on web.
class SectionTitle extends StatelessWidget {
  final String text;
  final IconData? icon;
  final Color? iconColor;
  final Widget? trailing;
  const SectionTitle(
    this.text, {
    super.key,
    this.icon,
    this.iconColor,
    this.trailing,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: Row(
        children: [
          if (icon != null) ...[
            Icon(icon, size: 18, color: iconColor ?? gold400),
            const SizedBox(width: 8),
          ],
          Text(
            text,
            style: GoogleFonts.cormorantGaramond(
              fontSize: 21,
              fontWeight: FontWeight.w600,
              color: cream,
            ),
          ),
          const Spacer(),
          ?trailing,
        ],
      ),
    );
  }
}

/// Small uppercase gold eyebrow, like "text-gold-400 tracking-widest uppercase".
class Eyebrow extends StatelessWidget {
  final String text;
  const Eyebrow(this.text, {super.key});

  @override
  Widget build(BuildContext context) {
    return Text(
      text.toUpperCase(),
      style: const TextStyle(
        color: gold400,
        fontSize: 11,
        fontWeight: FontWeight.w500,
        letterSpacing: 3,
      ),
    );
  }
}

/// Gold hairline under page titles.
class GoldRule extends StatelessWidget {
  const GoldRule({super.key});

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 2,
      width: 80,
      margin: const EdgeInsets.only(top: 12),
      decoration: const BoxDecoration(
        gradient: LinearGradient(colors: [gold500, Colors.transparent]),
      ),
    );
  }
}

// ── Motion primitives ────────────────────────────────────────────────────────
// House style: strong ease-out, 120–300ms, transform+opacity only, and every
// effect respects the system reduced-motion setting (fade-only or none).

/// Entrance reveal — fades in while sliding up a few percent of the child's
/// own height. Inside lazy lists it doubles as a scroll-in reveal (children
/// rebuild when they re-enter the viewport). Runs once per mount; rebuilds
/// from refresh() never re-trigger it.
class Reveal extends StatefulWidget {
  final Widget child;

  /// Stagger offset. Keep the total under ~350ms — long cascades feel slow.
  final Duration delay;
  const Reveal({super.key, required this.child, this.delay = Duration.zero});

  @override
  State<Reveal> createState() => _RevealState();
}

class _RevealState extends State<Reveal> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 280),
  );
  late final Animation<double> _a = CurvedAnimation(
    parent: _c,
    curve: Curves.easeOutCubic,
  );
  bool _started = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_started) return;
    _started = true;
    if (MediaQuery.maybeDisableAnimationsOf(context) ?? false) {
      _c.value = 1;
    } else {
      Future<void>.delayed(widget.delay).then((_) {
        if (mounted) _c.forward();
      });
    }
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return FadeTransition(
      opacity: _a,
      child: SlideTransition(
        position: Tween<Offset>(
          begin: const Offset(0, 0.05),
          end: Offset.zero,
        ).animate(_a),
        child: widget.child,
      ),
    );
  }
}

/// Press feedback — scales to 0.97 the moment the finger lands (respond on
/// press-down, not release) and springs back on lift. Purely observational:
/// the wrapped button keeps handling the tap.
class PressableScale extends StatefulWidget {
  final Widget child;
  const PressableScale({super.key, required this.child});

  @override
  State<PressableScale> createState() => _PressableScaleState();
}

class _PressableScaleState extends State<PressableScale> {
  bool _down = false;

  @override
  Widget build(BuildContext context) {
    final reduced = MediaQuery.maybeDisableAnimationsOf(context) ?? false;
    return AnimatedScale(
      scale: _down ? 0.97 : 1.0,
      duration: reduced ? Duration.zero : const Duration(milliseconds: 120),
      curve: Curves.easeOut,
      child: GestureDetector(
        onTapDown: (_) => setState(() => _down = true),
        onTapUp: (_) => setState(() => _down = false),
        onTapCancel: () => setState(() => _down = false),
        child: widget.child,
      ),
    );
  }
}

// ── Formatting helpers (mirror the web panel) ────────────────────────────────

/// "14:00" → "2:00 PM"
String fmtTime(String? t) {
  if (t == null || !t.contains(':')) return '—';
  final parts = t.split(':');
  final h = int.tryParse(parts[0]) ?? 0;
  final m = int.tryParse(parts[1]) ?? 0;
  final suffix = h >= 12 ? 'PM' : 'AM';
  final h12 = h % 12 == 0 ? 12 : h % 12;
  return '$h12:${m.toString().padLeft(2, '0')} $suffix';
}

/// ISO timestamp → "29 Aug, 4:30 PM"
String fmtDateTime(String? iso) {
  // API timestamps are UTC (Z-suffixed); convert to the device's local time
  // before formatting. No-op for suffix-less strings (defensive).
  final dt = iso == null ? null : DateTime.tryParse(iso)?.toLocal();
  if (dt == null) return '—';
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  final h = dt.hour >= 12 ? dt.hour - (dt.hour > 12 ? 12 : 0) : dt.hour;
  final h12 = h == 0 ? 12 : h;
  final suffix = dt.hour >= 12 ? 'PM' : 'AM';
  return '${dt.day} ${months[dt.month - 1]}, $h12:${dt.minute.toString().padLeft(2, '0')} $suffix';
}

/// IST "today" — DateTime.now() on the device is local; the salon runs on IST.
/// Mirrors istToday() in the web panel.
String istToday() {
  final now = DateTime.now().toUtc().add(const Duration(hours: 5, minutes: 30));
  return '${now.year.toString().padLeft(4, '0')}-'
      '${now.month.toString().padLeft(2, '0')}-'
      '${now.day.toString().padLeft(2, '0')}';
}

/// "₹1,250" with Indian grouping.
String inr(num v) {
  final s = v.round().toString();
  final last3 = s.length <= 3 ? s : s.substring(s.length - 3);
  var rest = s.length <= 3 ? '' : s.substring(0, s.length - 3);
  final groups = <String>[];
  while (rest.length > 2) {
    groups.insert(0, rest.substring(rest.length - 2));
    rest = rest.substring(0, rest.length - 2);
  }
  if (rest.isNotEmpty) groups.insert(0, rest);
  final head = groups.isEmpty ? '' : '${groups.join(',')},';
  return '₹$head$last3';
}

/// tel: href — bare digits with country code (mirrors telHref on web).
String? telHref(String? phone) {
  if (phone == null) return null;
  final digits = phone.replaceAll(RegExp(r'\D'), '');
  if (digits.isEmpty) return null;
  if (digits.length == 10) return 'tel:+91$digits';
  return 'tel:+$digits';
}
