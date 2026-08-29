import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../api.dart';
import '../models.dart' as m;
import '../theme.dart';
import 'home_shell.dart';

/// WhatsApp log — recent notifications across all customers. Manual mode:
/// the admin taps WhatsApp (opens wa.me with the rendered text), sends from
/// the salon phone, then marks the row sent.
class WhatsAppScreen extends StatefulWidget {
  final HomeShellState shell;
  const WhatsAppScreen({super.key, required this.shell});

  @override
  State<WhatsAppScreen> createState() => WhatsAppScreenState();
}

class WhatsAppScreenState extends State<WhatsAppScreen> {
  List<m.NotificationModel> _items = [];
  bool _loading = true;
  String? _error;
  String? _markingId;

  @override
  void initState() {
    super.initState();
    refresh();
  }

  Future<void> refresh() async {
    setState(() {
      _loading = _items.isEmpty;
      _error = null;
    });
    try {
      final data = await Api.instance.notifications(limit: 30);
      if (!mounted) return;
      setState(() {
        _items = data.map((e) => m.NotificationModel.fromJson(e)).toList();
        _loading = false;
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      if (e.isAuthError) return widget.shell.handleAuthError();
      setState(() {
        _error = e.message;
        _loading = false;
      });
    }
  }

  Future<void> _markSent(String id) async {
    setState(() => _markingId = id);
    try {
      await Api.instance.markSent(id);
      await refresh();
    } on ApiException catch (e) {
      if (!mounted) return;
      if (e.isAuthError) return widget.shell.handleAuthError();
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('Could not mark as sent')));
    } finally {
      if (mounted) setState(() => _markingId = null);
    }
  }

  Future<void> _openWhatsApp(String deepLink) async {
    final uri = Uri.parse(deepLink);
    if (!await launchUrl(uri, mode: LaunchMode.externalApplication)) {
      if (!mounted) return;
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('Could not open WhatsApp')));
    }
  }

  @override
  Widget build(BuildContext context) {
    final unsent = _items.where((n) => n.sentAt == null).length;
    return Scaffold(
      backgroundColor: emerald950,
      appBar: AppBar(
        title: const Text('WhatsApp Notifications'),
        actions: [
          Padding(
            padding: const EdgeInsets.only(right: 12),
            child: Center(
              child: _Badge(
                '$unsent unsent',
                unsent > 0 ? amber400 : emerald400,
              ),
            ),
          ),
        ],
      ),
      body: RefreshIndicator(
        color: gold500,
        backgroundColor: emerald900,
        onRefresh: refresh,
        child: _buildList(),
      ),
    );
  }

  Widget _buildList() {
    if (_loading) {
      return ListView(
        children: List.generate(
          4,
          (_) => const Padding(
            padding: EdgeInsets.fromLTRB(16, 8, 16, 8),
            child: GlassCard(child: SizedBox(height: 70)),
          ),
        ),
      );
    }
    if (_error != null) {
      return ListView(
        children: [
          Padding(
            padding: const EdgeInsets.all(16),
            child: GlassCard(
              child: Center(
                child: Text(_error!, style: const TextStyle(color: red400)),
              ),
            ),
          ),
        ],
      );
    }
    if (_items.isEmpty) {
      return ListView(
        children: const [
          Padding(
            padding: EdgeInsets.all(16),
            child: GlassCard(
              child: Center(
                child: Text(
                  'No notifications yet.',
                  style: TextStyle(color: emerald300),
                ),
              ),
            ),
          ),
        ],
      );
    }
    return ListView.builder(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
      itemCount: _items.length,
      itemBuilder: (context, i) {
        final n = _items[i];
        return Reveal(
          delay: Duration(milliseconds: math.min(i * 30, 240)),
          child: _NotificationCard(
            notification: n,
            marking: _markingId == n.id,
            onWhatsApp: n.deepLink.isEmpty
                ? null
                : () => _openWhatsApp(n.deepLink),
            onMarkSent: n.sentAt == null ? () => _markSent(n.id) : null,
          ),
        );
      },
    );
  }
}

class _Badge extends StatelessWidget {
  final String text;
  final Color color;
  const _Badge(this.text, this.color);

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.15),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: color.withValues(alpha: 0.5)),
      ),
      child: Text(text, style: TextStyle(fontSize: 10.5, color: color)),
    );
  }
}

class _NotificationCard extends StatelessWidget {
  final m.NotificationModel notification;
  final bool marking;
  final VoidCallback? onWhatsApp;
  final VoidCallback? onMarkSent;

  const _NotificationCard({
    required this.notification,
    required this.marking,
    this.onWhatsApp,
    this.onMarkSent,
  });

  (String, Color) get _kind {
    switch (notification.kind) {
      case 'booking_pending':
        return ('Request received', amber400);
      case 'booking_confirmed':
      case 'reschedule_confirmed':
        return ('Confirmed', emerald400);
      case 'reschedule_proposed':
        return ('Reschedule proposed', violet400);
      case 'booking_declined':
        return ('Declined', red400);
      case 'booking_cancelled':
        return ('Cancelled', red400);
      default:
        return (notification.kind, emerald300);
    }
  }

  @override
  Widget build(BuildContext context) {
    final (kindLabel, kindColor) = _kind;
    final n = notification;
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: GlassCard(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Wrap(
              spacing: 10,
              runSpacing: 6,
              crossAxisAlignment: WrapCrossAlignment.center,
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 10,
                    vertical: 4,
                  ),
                  decoration: BoxDecoration(
                    color: kindColor.withValues(alpha: 0.15),
                    borderRadius: BorderRadius.circular(999),
                    border: Border.all(color: kindColor.withValues(alpha: 0.5)),
                  ),
                  child: Text(
                    kindLabel,
                    style: TextStyle(fontSize: 10.5, color: kindColor),
                  ),
                ),
                Text(
                  fmtDateTime(n.createdAt?.toIso8601String()),
                  style: const TextStyle(color: emerald300, fontSize: 11),
                ),
                if (n.sentAt != null)
                  const Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(Icons.done_all, size: 13, color: emerald400),
                      SizedBox(width: 3),
                      Text(
                        'Sent',
                        style: TextStyle(color: emerald400, fontSize: 11),
                      ),
                    ],
                  )
                else
                  const Text(
                    'Not sent yet',
                    style: TextStyle(color: amber400, fontSize: 11),
                  ),
              ],
            ),
            const SizedBox(height: 8),
            Text(
              n.renderedText,
              style: const TextStyle(color: cream, fontSize: 13),
            ),
            if (n.phone.isEmpty)
              const Padding(
                padding: EdgeInsets.only(top: 6),
                child: Text(
                  'Customer has no phone number on file.',
                  style: TextStyle(color: amber400, fontSize: 11),
                ),
              ),
            const SizedBox(height: 10),
            Row(
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                if (onWhatsApp != null)
                  GoldButton(
                    label: 'WhatsApp',
                    icon: Icons.chat_bubble_outline,
                    onPressed: onWhatsApp,
                  ),
                if (onMarkSent != null) ...[
                  const SizedBox(width: 8),
                  marking
                      ? const Padding(
                          padding: EdgeInsets.symmetric(horizontal: 16),
                          child: SizedBox(
                            width: 18,
                            height: 18,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: gold400,
                            ),
                          ),
                        )
                      : OutlineButton(
                          label: 'Mark sent',
                          onPressed: onMarkSent,
                        ),
                ],
              ],
            ),
          ],
        ),
      ),
    );
  }
}
