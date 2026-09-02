import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../api.dart';
import '../models.dart' as m;
import '../theme.dart';
import 'home_shell.dart';

/// Economy — the shared "money" side of the salon (owner + both stylists see
/// the same salon-wide numbers; the backend enforces it, not this screen).
/// Mirrors frontend-admin/src/components/Economy.jsx with three tabs:
///  · Overview — funnel, income/expense bars, by-stylist / by-category
///  · Expenses — list + add + delete within the range, CSV copy
///  · Budget — monthly per-category targets with spent progress
class EconomyScreen extends StatefulWidget {
  final HomeShellState shell;
  const EconomyScreen({super.key, required this.shell});

  @override
  State<EconomyScreen> createState() => EconomyScreenState();
}

class EconomyScreenState extends State<EconomyScreen> {
  int _tab = 0; // 0 overview · 1 expenses · 2 budget

  String _from = '';
  String _to = '';
  m.EconomySummaryModel? _summary;
  List<m.ExpenseModel> _expenses = [];
  bool _loading = true;
  String? _error;

  // Budget tab
  String _month = '';
  m.BudgetResponseModel? _budget;
  bool _budgetLoading = false;
  String? _budgetError;
  final Map<String, TextEditingController> _budgetDrafts = {};

  // Add-expense sheet
  final _amountCtrl = TextEditingController();
  final _descCtrl = TextEditingController();
  bool _savingExpense = false;

  @override
  void initState() {
    super.initState();
    _to = istToday();
    _from = _istDaysAgo(29);
    _month = _to.substring(0, 7);
    _load();
  }

  /// Public hook for HomeShell.refreshAll().
  Future<void> refresh() => _load();

  @override
  void dispose() {
    _amountCtrl.dispose();
    _descCtrl.dispose();
    for (final c in _budgetDrafts.values) {
      c.dispose();
    }
    super.dispose();
  }

  /// IST date N days before [_to] — no DateTime.toUtc() here, or the
  /// 00:00–05:30 IST window rolls the day back (same bug as the web panel's).
  String _istShift(String iso, int days) {
    final d = DateTime.parse(iso).add(Duration(days: days));
    return '${d.year.toString().padLeft(4, '0')}-'
        '${d.month.toString().padLeft(2, '0')}-'
        '${d.day.toString().padLeft(2, '0')}';
  }

  String _istDaysAgo(int n) => _istShift(_to, -n);

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final summary = await Api.instance.economySummary(_from, _to);
      if (!mounted) return;
      setState(() {
        _summary = summary;
        _loading = false;
      });
      if (_tab == 1) await _loadExpenses();
    } on ApiException catch (e) {
      if (!mounted) return;
      if (e.isAuthError) return widget.shell.handleAuthError();
      setState(() {
        _error = e.message;
        _loading = false;
      });
    }
  }

  Future<void> _loadExpenses() async {
    try {
      final rows = await Api.instance.expenses(_from, _to);
      if (!mounted) return;
      setState(() => _expenses = rows);
    } on ApiException catch (e) {
      if (!mounted) return;
      if (e.isAuthError) return widget.shell.handleAuthError();
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(e.message)));
    }
  }

  Future<void> _loadBudget() async {
    setState(() {
      _budgetLoading = true;
      _budgetError = null;
    });
    // Fresh month → fresh drafts (controllers are disposed + recreated).
    for (final c in _budgetDrafts.values) {
      c.dispose();
    }
    _budgetDrafts.clear();
    try {
      final b = await Api.instance.budgets(_month);
      if (!mounted) return;
      setState(() {
        _budget = b;
        _budgetLoading = false;
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      if (e.isAuthError) return widget.shell.handleAuthError();
      setState(() {
        _budgetError = e.message;
        _budgetLoading = false;
      });
    }
  }

  /// Prev/next month navigation for the Budget tab.
  void _shiftMonth(int delta) {
    final d = DateTime.parse('$_month-01');
    final next = DateTime(d.year, d.month + delta);
    setState(() => _month =
        '${next.year.toString().padLeft(4, '0')}-${next.month.toString().padLeft(2, '0')}');
    _loadBudget();
  }

  void _setTab(int t) {
    setState(() => _tab = t);
    if (t == 1 && _expenses.isEmpty) _loadExpenses();
    if (t == 2 && _budget == null) _loadBudget();
  }

  Future<void> _pickRange() async {
    final initial = DateTime.tryParse(_to) ?? DateTime.now();
    final pickedTo = await showDatePicker(
      context: context,
      initialDate: initial,
      firstDate: DateTime(2024),
      lastDate: initial,
      helpText: 'End of range',
    );
    if (pickedTo == null) return;
    if (!mounted) return;
    final pickedFrom = await showDatePicker(
      context: context,
      initialDate: DateTime.tryParse(_from) ?? pickedTo,
      firstDate: DateTime(2024),
      lastDate: pickedTo,
      helpText: 'Start of range',
    );
    if (pickedFrom == null) return;
    setState(() {
      _to = _fmt(pickedTo);
      _from = _fmt(pickedFrom);
    });
    _load();
  }

  String _fmt(DateTime d) =>
      '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

  // ── Expenses mutations ──────────────────────────────────────────────────────
  /// Submit from the add-expense sheet. Clears the sheet's fields on success
  /// and refreshes list + summary.
  Future<void> _addExpenseFrom(String date, String category) async {
    final amount = num.tryParse(_amountCtrl.text.trim());
    if (amount == null || amount <= 0) {
      ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Enter a positive amount')));
      return;
    }
    setState(() => _savingExpense = true);
    try {
      await Api.instance.addExpense(
        date: date,
        category: category,
        description: _descCtrl.text.trim().isEmpty ? null : _descCtrl.text.trim(),
        amount: amount,
      );
      if (!mounted) return;
      Navigator.of(context).pop();
      ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Expense added')));
      _amountCtrl.clear();
      _descCtrl.clear();
      await _loadExpenses();
      await _load();
      widget.shell.refreshAll();
    } on ApiException catch (e) {
      if (!mounted) return;
      if (e.isAuthError) return widget.shell.handleAuthError();
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(e.message)));
    } finally {
      if (mounted) setState(() => _savingExpense = false);
    }
  }

  Future<void> _openAddExpense() async {
    _amountCtrl.clear();
    _descCtrl.clear();
    await showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: emerald900,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => _AddExpenseSheet(state: this),
    );
  }

  Future<void> _deleteExpense(m.ExpenseModel e) async {
    try {
      await Api.instance.deleteExpense(e.id);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Expense deleted')));
      setState(() => _expenses.removeWhere((x) => x.id == e.id));
      await _load();
      widget.shell.refreshAll();
    } on ApiException catch (e) {
      if (!mounted) return;
      if (e.isAuthError) return widget.shell.handleAuthError();
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(e.message)));
    }
  }

  // ── Budget save ─────────────────────────────────────────────────────────────
  Future<void> _saveBudget(String category, num amount) async {
    try {
      final b = await Api.instance.setBudget(_month, category, amount);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Budget saved')));
      setState(() => _budget = b);
      // Reflect the saved value — 0 clears the field (no goal).
      final ctrl = _budgetDrafts[category];
      if (ctrl != null) {
        ctrl.text = amount <= 0 ? '' : _num(amount);
      }
    } on ApiException catch (e) {
      if (!mounted) return;
      if (e.isAuthError) return widget.shell.handleAuthError();
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(e.message)));
    }
  }

  /// "1250" for whole numbers, "1250.5" otherwise — same as web panel.
  static String _num(num v) =>
      v == v.roundToDouble() ? v.round().toString() : v.toStringAsFixed(2);

  // ── CSV ─────────────────────────────────────────────────────────────────────
  /// The app has no file/share plugin — export as text and offer a clipboard
  /// copy (paste into Excel/Sheets; the backend already adds a UTF-8 BOM
  /// server-side, which the clipboard path skips harmlessly).
  Future<void> _exportCsv(String type) async {
    try {
      final csv = await Api.instance.exportCsv(type, _from, _to);
      if (!mounted) return;
      await Clipboard.setData(ClipboardData(text: csv));
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text(
            '$type CSV for $_from → $_to copied to clipboard — paste into Excel or Sheets'),
      ));
    } on ApiException catch (e) {
      if (!mounted) return;
      if (e.isAuthError) return widget.shell.handleAuthError();
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(e.message)));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: emerald950,
      appBar: AppBar(title: const Text('Economy')),
      body: Column(
        children: [
          _RangeBar(
            from: _from,
            to: _to,
            onPick: _pickRange,
            onExport: _exportCsv,
          ),
          _TabBar(
            tab: _tab,
            labels: const ['Overview', 'Expenses', 'Budget'],
            onChanged: _setTab,
          ),
          Expanded(
            child: RefreshIndicator(
              color: gold500,
              onRefresh: _load,
              child: _buildTab(),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildTab() {
    if (_loading) {
      return ListView(
        children: const [
          Padding(
            padding: EdgeInsets.all(16),
            child: GlassCard(child: SizedBox(height: 120)),
          ),
        ],
      );
    }
    if (_error != null) {
      return ListView(
        children: [
          GlassCard(
            child: Center(
              child: Text(_error!, style: const TextStyle(color: red400)),
            ),
          ),
        ],
      );
    }
    switch (_tab) {
      case 1:
        return _buildExpenses();
      case 2:
        return _buildBudget();
      default:
        return _buildOverview();
    }
  }

  // ── Overview ────────────────────────────────────────────────────────────────
  Widget _buildOverview() {
    final s = _summary;
    if (s == null) return const SizedBox();
    final maxDaily = s.daily.fold<num>(
        0, (mx, d) => d.income > mx ? d.income : (d.expense > mx ? d.expense : mx));
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
      children: [
        // Headline numbers
        Reveal(
          child: Row(
            children: [
              Expanded(
                child: _MoneyCard(
                  icon: Icons.trending_up,
                  label: 'Income',
                  value: inr(s.income),
                  color: gold500,
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: _MoneyCard(
                  icon: Icons.trending_down,
                  label: 'Expenses',
                  value: inr(s.expenses),
                  color: red400,
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: _MoneyCard(
                  icon: Icons.account_balance_wallet_outlined,
                  label: 'Net',
                  value: inr(s.net),
                  color: s.net >= 0 ? emerald400 : red400,
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 16),

        // Booking funnel
        Reveal(
          delay: const Duration(milliseconds: 40),
          child: GlassCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const SectionTitle('Bookings', icon: Icons.event_note),
                Row(
                  children: [
                    _FunnelCell(label: 'Total', value: s.bookingsTotal),
                    _FunnelCell(label: 'Confirmed', value: s.bookingsConfirmed),
                    _FunnelCell(label: 'Declined', value: s.bookingsDeclined),
                    _FunnelCell(label: 'Cancelled', value: s.bookingsCancelled),
                  ],
                ),
                const SizedBox(height: 10),
                Text(
                  '${s.walkIns} walk-in · ${s.online} online',
                  style: const TextStyle(color: emerald300, fontSize: 12),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 16),

        // Daily bars
        if (s.daily.isNotEmpty) ...[
          Reveal(
            delay: const Duration(milliseconds: 80),
            child: GlassCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const SectionTitle('Daily', icon: Icons.bar_chart),
                  const _DailyLegend(),
                  const SizedBox(height: 10),
                  ...s.daily.map((d) => _DailyBar(
                        date: d.date,
                        income: d.income,
                        expense: d.expense,
                        max: maxDaily <= 0 ? 1 : maxDaily,
                      )),
                ],
              ),
            ),
          ),
          const SizedBox(height: 16),
        ],

        // Breakdowns
        Reveal(
          delay: const Duration(milliseconds: 120),
          child: Column(
            children: [
              _Breakdown(
                title: 'Income by stylist',
                map: s.incomeByStylist,
              ),
              const SizedBox(height: 12),
              _Breakdown(
                title: 'Income by category',
                map: s.incomeByCategory,
              ),
              const SizedBox(height: 12),
              _Breakdown(
                title: 'Expenses by category',
                map: s.expensesByCategory,
              ),
            ],
          ),
        ),
      ],
    );
  }

  // ── Expenses ────────────────────────────────────────────────────────────────
  Widget _buildExpenses() {
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
      children: [
        GoldButton(
          label: 'Add Expense',
          icon: Icons.add,
          onPressed: _openAddExpense,
        ),
        const SizedBox(height: 16),
        if (_expenses.isEmpty)
          const GlassCard(
            child: Center(
              child: Text(
                'No expenses in this range.',
                style: TextStyle(color: emerald300, fontSize: 13),
              ),
            ),
          )
        else
          ..._expenses.map((e) => Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: GlassCard(
                  child: Row(
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                Expanded(
                                  child: Text(
                                    e.description?.isNotEmpty == true
                                        ? e.description!
                                        : m.expenseCategoryLabel(e.category),
                                    style: const TextStyle(
                                      color: cream,
                                      fontSize: 13,
                                      fontWeight: FontWeight.w500,
                                    ),
                                    overflow: TextOverflow.ellipsis,
                                  ),
                                ),
                                const SizedBox(width: 8),
                                Text(
                                  inr(e.amount),
                                  style: const TextStyle(
                                    color: gold400,
                                    fontSize: 13,
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                              ],
                            ),
                            const SizedBox(height: 2),
                            Text(
                              '${e.date} · ${m.expenseCategoryLabel(e.category)}',
                              style: const TextStyle(
                                  color: emerald300, fontSize: 11.5),
                            ),
                          ],
                        ),
                      ),
                      IconButton(
                        tooltip: 'Delete',
                        icon: const Icon(Icons.delete_outline,
                            size: 18, color: red400),
                        onPressed: () => _deleteExpense(e),
                      ),
                    ],
                  ),
                ),
              )),
      ],
    );
  }

  // ── Budget ──────────────────────────────────────────────────────────────────
  Widget _buildBudget() {
    if (_budgetLoading) {
      return ListView(
        children: [
          Padding(
            padding: const EdgeInsets.all(16),
            child: GlassCard(child: SizedBox(height: 120)),
          ),
        ],
      );
    }
    if (_budgetError != null) {
      return ListView(
        children: [
          GlassCard(
            child: Center(
              child: Text(_budgetError!,
                  style: const TextStyle(color: red400)),
            ),
          ),
        ],
      );
    }
    final b = _budget;
    if (b == null) return const SizedBox();
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
      children: [
        GlassCard(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
          child: Row(
            children: [
              IconButton(
                tooltip: 'Previous month',
                icon: const Icon(Icons.chevron_left,
                    size: 20, color: emerald300),
                onPressed: () => _shiftMonth(-1),
              ),
              Expanded(
                child: Center(
                  child: Text('Targets for ${b.month}',
                      style: const TextStyle(color: cream, fontSize: 13)),
                ),
              ),
              IconButton(
                tooltip: 'Next month',
                icon: const Icon(Icons.chevron_right,
                    size: 20, color: emerald300),
                onPressed: () => _shiftMonth(1),
              ),
            ],
          ),
        ),
        const SizedBox(height: 12),
        ...b.categories.map((c) {
          // Parent-owned controllers (created once per category, disposed in
          // dispose()) — never inside build.
          final ctrl = _budgetDrafts.putIfAbsent(
            c.category,
            () => TextEditingController(
                text: c.target > 0 ? _num(c.target) : ''),
          );
          return _BudgetRow(
            status: c,
            controller: ctrl,
            onSave: () {
              final amount = num.tryParse(ctrl.text.trim());
              if (amount == null) {
                ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
                    content: Text('Enter a number (0 clears the target)')));
                return;
              }
              _saveBudget(c.category, amount);
            },
          );
        }),
        const Padding(
          padding: EdgeInsets.only(top: 8),
          child: Text(
            'Set 0 to clear a target. Spent counts expenses dated in this month.',
            style: TextStyle(color: emerald500, fontSize: 11),
          ),
        ),
      ],
    );
  }
}

// ── Small pieces ─────────────────────────────────────────────────────────────

class _RangeBar extends StatelessWidget {
  final String from;
  final String to;
  final VoidCallback onPick;
  final void Function(String type) onExport;
  const _RangeBar({
    required this.from,
    required this.to,
    required this.onPick,
    required this.onExport,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
      child: GlassCard(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        child: Row(
          children: [
            const Icon(Icons.date_range, size: 16, color: gold400),
            const SizedBox(width: 8),
            Expanded(
              child: InkWell(
                onTap: onPick,
                child: Text(
                  '$from → $to',
                  style: const TextStyle(color: cream, fontSize: 13),
                ),
              ),
            ),
            PopupMenuButton<String>(
              tooltip: 'Export CSV',
              onSelected: onExport,
              itemBuilder: (_) => const [
                PopupMenuItem(value: 'income', child: Text('Income CSV')),
                PopupMenuItem(value: 'expenses', child: Text('Expenses CSV')),
                PopupMenuItem(value: 'bookings', child: Text('Bookings CSV')),
              ],
              child: const Padding(
                padding: EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.download, size: 16, color: emerald300),
                    SizedBox(width: 4),
                    Text('CSV', style: TextStyle(color: emerald300, fontSize: 12)),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _TabBar extends StatelessWidget {
  final int tab;
  final List<String> labels;
  final void Function(int) onChanged;
  const _TabBar({
    required this.tab,
    required this.labels,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 10, 16, 4),
      child: SegmentedButton<int>(
        segments: [
          for (var i = 0; i < labels.length; i++)
            ButtonSegment(value: i, label: Text(labels[i])),
        ],
        selected: {tab},
        showSelectedIcon: false,
        style: ButtonStyle(
          side: WidgetStatePropertyAll(
            BorderSide(color: emerald700.withValues(alpha: 0.8)),
          ),
          backgroundColor: WidgetStateProperty.resolveWith(
            (states) => states.contains(WidgetState.selected)
                ? gold500.withValues(alpha: 0.22)
                : Colors.transparent,
          ),
          foregroundColor: WidgetStateProperty.resolveWith(
            (states) => states.contains(WidgetState.selected) ? gold400 : emerald300,
          ),
          textStyle: const WidgetStatePropertyAll(
            TextStyle(fontSize: 12.5),
          ),
        ),
      ),
    );
  }
}

class _MoneyCard extends StatelessWidget {
  final IconData icon;
  final String label;
  final String value;
  final Color color;
  const _MoneyCard({
    required this.icon,
    required this.label,
    required this.value,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    return GlassCard(
      padding: const EdgeInsets.all(12),
      child: FittedBox(
        fit: BoxFit.scaleDown,
        alignment: Alignment.centerLeft,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 30,
              height: 30,
              decoration: BoxDecoration(
                color: color,
                borderRadius: BorderRadius.circular(8),
              ),
              child: Icon(icon, size: 16, color: emerald950),
            ),
            const SizedBox(height: 8),
            Text(value,
                style: const TextStyle(
                    fontSize: 17,
                    fontWeight: FontWeight.w600,
                    color: cream)),
            const SizedBox(height: 2),
            Text(label,
                style: const TextStyle(fontSize: 11, color: emerald300)),
          ],
        ),
      ),
    );
  }
}

class _FunnelCell extends StatelessWidget {
  final String label;
  final int value;
  const _FunnelCell({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Column(
        children: [
          Text('$value',
              style: const TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.w600,
                  color: cream)),
          const SizedBox(height: 2),
          Text(label,
              style: const TextStyle(fontSize: 10.5, color: emerald300)),
        ],
      ),
    );
  }
}

class _DailyLegend extends StatelessWidget {
  const _DailyLegend();

  @override
  Widget build(BuildContext context) {
    return const Row(
      children: [
        _LegendDot(color: gold500, label: 'Income'),
        SizedBox(width: 14),
        _LegendDot(color: red400, label: 'Expenses'),
      ],
    );
  }
}

class _LegendDot extends StatelessWidget {
  final Color color;
  final String label;
  const _LegendDot({required this.color, required this.label});

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 8,
          height: 8,
          decoration: BoxDecoration(color: color, shape: BoxShape.circle),
        ),
        const SizedBox(width: 4),
        Text(label,
            style: const TextStyle(fontSize: 10.5, color: emerald300)),
      ],
    );
  }
}

class _DailyBar extends StatelessWidget {
  final String date;
  final num income;
  final num expense;
  final num max;

  const _DailyBar({
    required this.date,
    required this.income,
    required this.expense,
    required this.max,
  });

  @override
  Widget build(BuildContext context) {
    final iw = (income / max).clamp(0.0, 1.0);
    final ew = (expense / max).clamp(0.0, 1.0);
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(date,
              style: const TextStyle(fontSize: 10.5, color: emerald300)),
          const SizedBox(height: 3),
          Row(
            children: [
              Expanded(
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(999),
                  child: TweenAnimationBuilder<double>(
                    tween: Tween(begin: 0, end: iw.toDouble()),
                    duration: const Duration(milliseconds: 500),
                    curve: Curves.easeOutCubic,
                    builder: (_, v, _) => LinearProgressIndicator(
                      value: v,
                      minHeight: 6,
                      backgroundColor: emerald900,
                      valueColor: const AlwaysStoppedAnimation(gold500),
                    ),
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 3),
          Row(
            children: [
              Expanded(
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(999),
                  child: TweenAnimationBuilder<double>(
                    tween: Tween(begin: 0, end: ew.toDouble()),
                    duration: const Duration(milliseconds: 500),
                    curve: Curves.easeOutCubic,
                    builder: (_, v, _) => LinearProgressIndicator(
                      value: v,
                      minHeight: 6,
                      backgroundColor: emerald900,
                      valueColor: const AlwaysStoppedAnimation(red400),
                    ),
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

/// Grouped key → amount list with a shared max bar width.
class _Breakdown extends StatelessWidget {
  final String title;
  final Map<String, num> map;
  const _Breakdown({required this.title, required this.map});

  @override
  Widget build(BuildContext context) {
    final max = map.values.fold<num>(0, (mx, v) => v > mx ? v : mx);
    return GlassCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title,
              style: const TextStyle(
                  color: gold400,
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  letterSpacing: 1)),
          const SizedBox(height: 10),
          if (map.isEmpty)
            const Text('—',
                style: TextStyle(color: emerald500, fontSize: 12))
          else
            ...map.entries.map((e) {
              final pct = max <= 0 ? 0.0 : (e.value / max).clamp(0.0, 1.0);
              return Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Expanded(
                          child: Text(e.key,
                              style: const TextStyle(
                                  color: cream, fontSize: 12.5),
                              overflow: TextOverflow.ellipsis),
                        ),
                        const SizedBox(width: 8),
                        Text(inr(e.value),
                            style: const TextStyle(
                                color: gold400, fontSize: 12)),
                      ],
                    ),
                    const SizedBox(height: 4),
                    ClipRRect(
                      borderRadius: BorderRadius.circular(999),
                      child: TweenAnimationBuilder<double>(
                        tween: Tween(begin: 0, end: pct.toDouble()),
                        duration: const Duration(milliseconds: 500),
                        curve: Curves.easeOutCubic,
                        builder: (_, v, _) => LinearProgressIndicator(
                          value: v,
                          minHeight: 4,
                          backgroundColor: emerald900,
                          valueColor:
                              const AlwaysStoppedAnimation(gold500),
                        ),
                      ),
                    ),
                  ],
                ),
              );
            }),
        ],
      ),
    );
  }
}

/// One budget row: target input + spent bar, colored by how close/over it is.
class _BudgetRow extends StatelessWidget {
  final m.BudgetCategoryStatus status;
  final TextEditingController controller;
  final VoidCallback onSave;
  const _BudgetRow({
    required this.status,
    required this.controller,
    required this.onSave,
  });

  @override
  Widget build(BuildContext context) {
    final target = status.target.toDouble();
    final spent = status.spent.toDouble();
    final pct = target <= 0 ? 0.0 : (spent / target).clamp(0.0, 1.0);
    final over = target > 0 && spent > target;
    final near = target > 0 && !over && spent >= target * 0.9;
    final barColor = over ? red400 : (near ? amber400 : emerald400);

    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: GlassCard(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    m.expenseCategoryLabel(status.category),
                    style: const TextStyle(
                        color: cream,
                        fontSize: 13,
                        fontWeight: FontWeight.w500),
                  ),
                ),
                SizedBox(
                  width: 110,
                  child: TextField(
                    controller: controller,
                    keyboardType: TextInputType.number,
                    textAlign: TextAlign.end,
                    style: const TextStyle(fontSize: 13, color: cream),
                    decoration: const InputDecoration(
                      isDense: true,
                      hintText: '0',
                      prefixText: '₹ ',
                      prefixStyle:
                          TextStyle(color: emerald300, fontSize: 12),
                      contentPadding: EdgeInsets.symmetric(
                          horizontal: 10, vertical: 8),
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                IconButton(
                  tooltip: 'Save target',
                  icon: const Icon(Icons.check,
                      size: 18, color: gold400),
                  onPressed: onSave,
                ),
              ],
            ),
            if (target > 0) ...[
              const SizedBox(height: 8),
              ClipRRect(
                borderRadius: BorderRadius.circular(999),
                child: TweenAnimationBuilder<double>(
                  tween: Tween(begin: 0, end: pct),
                  duration: const Duration(milliseconds: 500),
                  curve: Curves.easeOutCubic,
                  builder: (_, v, _) => LinearProgressIndicator(
                    value: v,
                    minHeight: 6,
                    backgroundColor: emerald900,
                    valueColor: AlwaysStoppedAnimation(barColor),
                  ),
                ),
              ),
              const SizedBox(height: 4),
              Text(
                '${inr(spent)} spent of ${inr(target)}'
                '${over ? ' — over budget' : near ? ' — nearing target' : ''}',
                style: TextStyle(
                    fontSize: 11, color: over || near ? barColor : emerald300),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

/// Bottom sheet for adding an expense — owns its date/category fields but
/// shares the parent's amount/description controllers and submit handler.
class _AddExpenseSheet extends StatefulWidget {
  final EconomyScreenState state;
  const _AddExpenseSheet({required this.state});

  @override
  State<_AddExpenseSheet> createState() => _AddExpenseSheetState();
}

class _AddExpenseSheetState extends State<_AddExpenseSheet> {
  late DateTime _date;
  late String _category;

  @override
  void initState() {
    super.initState();
    _date = DateTime.now();
    _category = 'products';
  }

  String _fmt(DateTime d) =>
      '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

  @override
  Widget build(BuildContext context) {
    final s = widget.state;
    return SafeArea(
      child: Padding(
        padding: EdgeInsets.only(
          left: 20,
          right: 20,
          top: 20,
          bottom: MediaQuery.of(context).viewInsets.bottom + 20,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Add Expense',
                style: Theme.of(context).appBarTheme.titleTextStyle),
            const SizedBox(height: 18),
            const Text(
              'Date',
              style: TextStyle(color: emerald300, fontSize: 12),
            ),
            const SizedBox(height: 6),
            InkWell(
              onTap: () async {
                final picked = await showDatePicker(
                  context: context,
                  initialDate: _date,
                  firstDate: DateTime(2024),
                  lastDate: DateTime.now().add(const Duration(days: 365)),
                );
                if (picked == null) return;
                setState(() => _date = picked);
              },
              borderRadius: BorderRadius.circular(12),
              child: InputDecorator(
                decoration: const InputDecoration(
                  suffixIcon: Icon(Icons.calendar_today,
                      size: 16, color: emerald300),
                ),
                child: Text(_fmt(_date),
                    style: const TextStyle(color: cream, fontSize: 13.5)),
              ),
            ),
            const SizedBox(height: 12),
            DropdownMenu<String>(
              width: double.infinity,
              initialSelection: _category,
              dropdownMenuEntries: [
                for (final (id, label) in m.kExpenseCategories)
                  DropdownMenuEntry(value: id, label: label),
              ],
              onSelected: (v) => setState(() => _category = v!),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: s._amountCtrl,
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(
                hintText: 'Amount (₹)',
                prefixText: '₹ ',
              ),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: s._descCtrl,
              decoration: const InputDecoration(
                hintText: 'Description (optional)',
              ),
            ),
            const SizedBox(height: 20),
            Row(
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                OutlineButton(
                  label: 'Cancel',
                  onPressed: () => Navigator.of(context).pop(),
                ),
                const SizedBox(width: 10),
                GoldButton(
                  label: 'Save',
                  busy: s._savingExpense,
                  onPressed: () => s._addExpenseFrom(_fmt(_date), _category),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
