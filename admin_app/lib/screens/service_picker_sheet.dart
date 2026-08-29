import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import '../models.dart' as m;
import '../theme.dart';

/// Sort options — mirrors the user panel's ServiceList (BookingComponent.jsx).
const _sortOptions = <(String, String)>[
  ('recommended', 'Recommended'),
  ('price_asc', 'Price ↑'),
  ('price_desc', 'Price ↓'),
  ('name_asc', 'Name A–Z'),
  ('duration_asc', 'Quickest first'),
];

/// Category tabs — same ids/labels as the user panel's CATEGORY_TABS.
const _categoryTabs = <(String, String)>[
  ('all', 'All'),
  ('hair', 'Hair'),
  ('grooming', 'Grooming'),
  ('colour', 'Colour'),
  ('spa', 'Spa'),
  ('facial', 'Facial'),
  ('bridal', 'Bridal'),
  ('tattoo', 'Tattoo'),
  ('general', 'Other'),
];

/// Modal bottom sheet — the Flutter equivalent of the user panel's
/// ServiceList: live search (name + description), category tabs with counts,
/// sort menu, audience-filtered rows, and For boys / For girls sections in
/// the kids flow. Returns the picked service, or null when dismissed.
Future<m.ServiceModel?> showServicePickerSheet(
  BuildContext context, {
  required List<m.ServiceModel> services,
  required String? audience, // men | women | kids | null
  m.ServiceModel? selected,
}) {
  return showModalBottomSheet<m.ServiceModel>(
    context: context,
    isScrollControlled: true,
    backgroundColor: emerald950,
    shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
    builder: (_) => _PickerSheet(services: services, audience: audience, selected: selected),
  );
}

class _PickerSheet extends StatefulWidget {
  final List<m.ServiceModel> services;
  final String? audience;
  final m.ServiceModel? selected;
  const _PickerSheet({required this.services, required this.audience, this.selected});

  @override
  State<_PickerSheet> createState() => _PickerSheetState();
}

class _PickerSheetState extends State<_PickerSheet> {
  String _query = '';
  String _category = 'all';
  String _sort = 'recommended';

  /// Hard audience rules first — mirrors the user panel's filter pipeline:
  /// kids shows only for_kids services; men/women exclude kids services and
  /// audience mismatches (unisex always passes).
  bool _matchesAudience(m.ServiceModel s) {
    if (widget.audience == 'kids') return s.forKids;
    final mismatch =
        widget.audience != null && s.audience != 'unisex' && s.audience != widget.audience;
    return !mismatch && !s.forKids;
  }

  List<m.ServiceModel> get _filtered {
    var list = widget.services.where(_matchesAudience).toList();
    if (widget.audience != 'kids' && _category != 'all') {
      list = list.where((s) => s.category == _category).toList();
    }
    final q = _query.trim().toLowerCase();
    if (q.isNotEmpty) {
      list = list.where((s) =>
          s.name.toLowerCase().contains(q) ||
          (s.description ?? '').toLowerCase().contains(q)).toList();
    }
    final sorted = [...list];
    // "Recommended" = popularity (most-booked first); Dart sort is stable,
    // so ties keep the catalog order — same as the user panel.
    switch (_sort) {
      case 'price_asc':
        sorted.sort((a, b) => a.price.compareTo(b.price));
      case 'price_desc':
        sorted.sort((a, b) => b.price.compareTo(a.price));
      case 'name_asc':
        sorted.sort((a, b) => a.name.compareTo(b.name));
      case 'duration_asc':
        sorted.sort((a, b) => a.durationMins.compareTo(b.durationMins));
      default:
        sorted.sort((a, b) => b.popularity.compareTo(a.popularity));
    }
    return sorted;
  }

  /// Per-tab counts so the admin sees how many services live in each
  /// category before tapping (adult flow only).
  Map<String, int> get _tabCounts {
    final base = widget.services.where(_matchesAudience).toList();
    final counts = <String, int>{'all': base.length};
    for (final (id, _) in _categoryTabs) {
      if (id == 'all') continue;
      counts[id] = base.where((s) => s.category == id).length;
    }
    return counts;
  }

  @override
  Widget build(BuildContext context) {
    final screenH = MediaQuery.of(context).size.height;
    final kids = widget.audience == 'kids';

    return ConstrainedBox(
      constraints: BoxConstraints(maxHeight: screenH * 0.85),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          // Drag handle + title
          Container(
            width: 40, height: 4,
            margin: const EdgeInsets.only(top: 10),
            decoration: BoxDecoration(
                color: emerald700, borderRadius: BorderRadius.circular(2)),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 10, 16, 0),
            child: Row(
              children: [
                Text('Choose a service',
                    style: GoogleFonts.cormorantGaramond(
                        fontSize: 20, fontWeight: FontWeight.w600, color: cream)),
                const Spacer(),
                // Sort trigger — same five options as the user panel.
                PopupMenuButton<String>(
                  key: const ValueKey('service_sort'),
                  tooltip: 'Sort',
                  color: emerald900,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  onSelected: (v) => setState(() => _sort = v),
                  icon: const Icon(Icons.sort, size: 20, color: emerald300),
                  itemBuilder: (_) => _sortOptions
                      .map((o) => PopupMenuItem(
                            value: o.$1,
                            height: 40,
                            child: Text(o.$2,
                                style: TextStyle(
                                    fontSize: 13,
                                    color: _sort == o.$1 ? gold400 : cream)),
                          ))
                      .toList(),
                ),
              ],
            ),
          ),
          // Search — live filter on name + description.
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
            child: TextField(
              key: const ValueKey('service_search'),
              onChanged: (v) => setState(() => _query = v),
              decoration: const InputDecoration(
                hintText: 'Search services…',
                prefixIcon: Icon(Icons.search, size: 18, color: emerald300),
              ),
            ),
          ),
          // Category tabs with counts (adult flow only — kids ignores them).
          if (!kids)
            SizedBox(
              height: 40,
              child: ListView(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(horizontal: 16),
                children: _categoryTabs.map((t) {
                  final count = _tabCounts[t.$1] ?? 0;
                  if (t.$1 != 'all' && count == 0) return const SizedBox.shrink();
                  final active = _category == t.$1;
                  return Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: InkWell(
                      onTap: () => setState(() => _category = t.$1),
                      borderRadius: BorderRadius.circular(999),
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                        decoration: BoxDecoration(
                          color: active ? gold500 : Colors.transparent,
                          borderRadius: BorderRadius.circular(999),
                          border: Border.all(
                              color: active ? gold500 : emerald700.withValues(alpha: 0.7)),
                        ),
                        child: Text(
                          '${t.$2}  $count',
                          style: TextStyle(
                              fontSize: 12,
                              color: active ? emerald950 : emerald300,
                              fontWeight: active ? FontWeight.w600 : FontWeight.w400),
                        ),
                      ),
                    ),
                  );
                }).toList(),
              ),
            ),
          const Divider(height: 1),
          // Service list.
          Flexible(
            child: _buildList(kids),
          ),
        ],
      ),
    );
  }

  Widget _buildList(bool kids) {
    final filtered = _filtered;

    if (filtered.isEmpty) {
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: 40),
        child: Text(
          _query.trim().isEmpty
              ? 'No services in this category yet.'
              : 'No services match "${_query.trim()}".',
          textAlign: TextAlign.center,
          style: const TextStyle(color: emerald300, fontSize: 13),
        ),
      );
    }

    if (kids) {
      // Kids flow: two sub-sections, no category tabs — mirrors the user panel.
      final boys = filtered.where((s) => s.kidGender == 'boy').toList();
      final girls = filtered.where((s) => s.kidGender == 'girl').toList();
      return ListView(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
        children: [
          _section('For boys', boys, sky300),
          _section('For girls', girls, pink300),
        ],
      );
    }

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
      children: filtered.map((s) => _tile(s)).toList(),
    );
  }

  Widget _section(String title, List<m.ServiceModel> items, Color accent) {
    if (items.isEmpty) return const SizedBox.shrink();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(2, 4, 2, 8),
          child: Row(
            children: [
              Text(title.toUpperCase(),
                  style: TextStyle(
                      color: accent, fontSize: 11, fontWeight: FontWeight.w600, letterSpacing: 2)),
              const SizedBox(width: 8),
              Text('${items.length}',
                  style: const TextStyle(color: emerald500, fontSize: 11)),
            ],
          ),
        ),
        ...items.map(_tile),
        const SizedBox(height: 12),
      ],
    );
  }

  Widget _tile(m.ServiceModel s) {
    final isSelected = widget.selected?.id == s.id;
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: InkWell(
        key: ValueKey('service_option_${s.id}'),
        onTap: () => Navigator.of(context).pop(s),
        borderRadius: BorderRadius.circular(12),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          decoration: BoxDecoration(
            color: isSelected ? emerald800.withValues(alpha: 0.7) : emerald900.withValues(alpha: 0.5),
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: isSelected ? gold500 : emerald700.withValues(alpha: 0.5)),
          ),
          child: Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Wrap(
                      crossAxisAlignment: WrapCrossAlignment.center,
                      spacing: 6,
                      runSpacing: 4,
                      children: [
                        Text(s.label,
                            style: const TextStyle(
                                color: cream, fontSize: 13.5, fontWeight: FontWeight.w500)),
                        // Unisex tag — the only audience worth showing since
                        // the list is already filtered to the chosen audience.
                        if (s.audience == 'unisex' && s.kidGender == null)
                          _chip('Unisex', emerald300),
                        if (s.kidGender != null)
                          _chip(s.kidGender == 'boy' ? 'Boy' : 'Girl',
                              s.kidGender == 'boy' ? sky300 : pink300),
                      ],
                    ),
                    if (s.description != null && s.description!.isNotEmpty)
                      Padding(
                        padding: const EdgeInsets.only(top: 3),
                        child: Text(s.description!,
                            maxLines: 2, overflow: TextOverflow.ellipsis,
                            style: const TextStyle(color: emerald400, fontSize: 11)),
                      ),
                  ],
                ),
              ),
              const SizedBox(width: 10),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(inr(s.price),
                      style: const TextStyle(color: gold400, fontSize: 13, fontWeight: FontWeight.w600)),
                  Text('${s.durationMins} min',
                      style: const TextStyle(color: emerald400, fontSize: 10.5)),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _chip(String text, Color color) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: color.withValues(alpha: 0.4)),
      ),
      child: Text(text, style: TextStyle(color: color, fontSize: 9.5)),
    );
  }
}
