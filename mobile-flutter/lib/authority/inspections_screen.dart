import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../session.dart';
import '../theme.dart';
import '../widgets.dart';
import 'inspection_run_screen.dart';

/// Inspection worklist with status filter.
class InspectionsScreen extends StatefulWidget {
  const InspectionsScreen({super.key});

  @override
  State<InspectionsScreen> createState() => _InspectionsScreenState();
}

class _InspectionsScreenState extends State<InspectionsScreen> {
  String _status = 'PLANNED';
  Future<dynamic>? _future;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _future ??= _load();
  }

  Future<dynamic> _load() => context.read<Session>().api.get('/inspections', query: {
        if (_status.isNotEmpty) 'status': _status,
        'limit': '30',
        'sort': _status == 'CLOSED' ? '-closedAt' : 'plannedAt',
      });

  void _refresh() => setState(() { _future = _load(); });

  @override
  Widget build(BuildContext context) {
    final s = context.watch<Session>();
    if (!s.can('inspections.view')) {
      return Column(children: const [
        NavyHeader(title: 'Inspections'),
        Expanded(
          child: EmptyState('Not available for this role',
              'Requires the inspections.view permission.', icon: Icons.lock_outline),
        ),
      ]);
    }
    return Column(
      children: [
        NavyHeader(
          title: 'Inspections',
          subtitle: 'Versioned checklists · findings · close-out discipline',
          bottom: Row(
            children: [
              for (final (label, value) in const [
                ('Planned', 'PLANNED'),
                ('In progress', 'IN_PROGRESS'),
                ('Closed', 'CLOSED'),
              ]) ...[
                Expanded(
                  child: Semantics(
                    button: true,
                    selected: _status == value,
                    child: Material(
                      color: _status == value
                          ? Mob.cyan600
                          : Colors.white.withValues(alpha: .12),
                      borderRadius: BorderRadius.circular(7),
                      child: InkWell(
                        borderRadius: BorderRadius.circular(7),
                        onTap: () {
                          _status = value;
                          _refresh();
                        },
                        child: Container(
                          height: 44,
                          alignment: Alignment.center,
                          child: Text(label,
                              style: ss(12, w: FontWeight.w700, c: Colors.white)),
                        ),
                      ),
                    ),
                  ),
                ),
                if (value != 'CLOSED') const SizedBox(width: 8),
              ],
            ],
          ),
        ),
        Expanded(
          child: AsyncBody<dynamic>(
            future: _future!,
            onRetry: _refresh,
            isEmpty: (d) => (d as List).isEmpty,
            emptyTitle: 'No inspections',
            emptyBody: 'Nothing in this state right now.',
            builder: (context, d) {
              final rows = (d as List).cast<Map<String, dynamic>>();
              return RefreshIndicator(
                onRefresh: () async => _refresh(),
                color: Mob.cyan600,
                child: ListView.separated(
                  padding: const EdgeInsets.all(16),
                  itemCount: rows.length,
                  separatorBuilder: (_, _) => const SizedBox(height: 10),
                  itemBuilder: (context, i) {
                    final insp = rows[i];
                    final vessel = (insp['vessel'] as Map?) ?? const {};
                    final result = (insp['result'] as String?) ?? '';
                    final findings = (insp['findings'] as List?)?.length ?? 0;
                    return MobCard(
                      semanticLabel: 'Open inspection ${vessel['name'] ?? insp['number']}',
                      onTap: () => Navigator.of(context)
                          .push(MaterialPageRoute(
                            builder: (_) => InspectionRunScreen(
                                inspectionId: '${insp['_id']}'),
                          ))
                          .then((_) => _refresh()),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(children: [
                            Expanded(
                              child: Text('${vessel['name'] ?? '—'}',
                                  style: pop(14.5)),
                            ),
                            StatusChip(
                                result.isNotEmpty
                                    ? result
                                    : '${insp['status']}'.replaceAll('_', ' '),
                                StatusChip.forStatus(
                                    result.isNotEmpty ? result : '${insp['status']}')),
                          ]),
                          const SizedBox(height: 3),
                          Text(
                            '${insp['number']} · ${insp['type']} · ${fmtDate(insp['plannedAt'])}'
                            '${findings > 0 ? ' · $findings finding(s)' : ''}'
                            '${insp['detention'] == true ? ' · DETAINED' : ''}',
                            style: ss(12, c: Mob.gray500),
                          ),
                        ],
                      ),
                    );
                  },
                ),
              );
            },
          ),
        ),
      ],
    );
  }
}
