import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../session.dart';
import '../theme.dart';
import '../widgets.dart';
import 'dossier_screen.dart';

/// Risk-ranked boarding targets — the live output of agent A5 (Smart
/// Inspection targeting) over inbound and active port calls.
class TargetsScreen extends StatefulWidget {
  const TargetsScreen({super.key});

  @override
  State<TargetsScreen> createState() => _TargetsScreenState();
}

class _TargetsScreenState extends State<TargetsScreen> {
  Future<(dynamic, Map<String, dynamic>)>? _future;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _future ??= context.read<Session>().api.getWithMeta('/risk/targeting');
  }

  void _refresh() => setState(() {
        _future = context.read<Session>().api.getWithMeta('/risk/targeting');
      });

  @override
  Widget build(BuildContext context) {
    final s = context.watch<Session>();
    if (!s.can('risk.view')) {
      return Column(children: [
        const NavyHeader(title: 'Boarding targets'),
        const Expanded(
          child: EmptyState('Not available for this role',
              'Risk targeting requires the risk.view permission.',
              icon: Icons.lock_outline),
        ),
      ]);
    }
    return Column(
      children: [
        const NavyHeader(
          title: 'Boarding targets',
          subtitle: 'Inbound calls ranked by composite vessel risk — agent A5',
        ),
        Expanded(
          child: AsyncBody<(dynamic, Map<String, dynamic>)>(
            future: _future!,
            onRetry: _refresh,
            isEmpty: (d) => (d.$1 as List).isEmpty,
            emptyTitle: 'No inbound traffic',
            emptyBody: 'Targets appear as port calls are announced.',
            builder: (context, d) {
              final rows = (d.$1 as List).cast<Map<String, dynamic>>();
              final at = d.$2['computedAt'];
              return RefreshIndicator(
                onRefresh: () async => _refresh(),
                color: Mob.cyan600,
                child: ListView.separated(
                  padding: const EdgeInsets.all(16),
                  itemCount: rows.length + 1,
                  separatorBuilder: (_, _) => const SizedBox(height: 10),
                  itemBuilder: (context, i) {
                    if (i == 0) {
                      return Text('Computed ${fmtDate(at, time: true)} · ${rows.length} calls ranked',
                          style: ss(11.5, c: Mob.gray400));
                    }
                    final row = rows[i - 1];
                    final risk = row['risk'] as Map<String, dynamic>;
                    final factors = (risk['factors'] as List).cast<Map<String, dynamic>>();
                    return MobCard(
                      onTap: () => Navigator.of(context).push(MaterialPageRoute(
                        builder: (_) => DossierScreen(vesselId: '${row['vesselId']}'),
                      )),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(children: [
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text('${row['vessel']}', style: pop(14.5)),
                                  Text(
                                      '${row['vcn']} · ${row['status']} · berth ${row['berth'] ?? 'TBA'} · ETA ${fmtDate(row['eta'])}',
                                      style: ss(11.5, c: Mob.gray500)),
                                ],
                              ),
                            ),
                            Column(
                              crossAxisAlignment: CrossAxisAlignment.end,
                              children: [
                                Text('${risk['score']}',
                                    style: pop(20, w: FontWeight.w700,
                                        c: _bandColor('${risk['band']}'))),
                                StatusChip('${risk['band']}',
                                    StatusChip.forStatus('${risk['band']}')),
                              ],
                            ),
                          ]),
                          if (factors.isNotEmpty) ...[
                            const SizedBox(height: 8),
                            Text(
                              factors.take(2).map((f) =>
                                  '${f['label']}: ${f['evidence']}').join(' · '),
                              style: ss(12, c: Mob.gray500, h: 1.4),
                            ),
                          ],
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

  Color _bandColor(String band) => switch (band) {
        'HIGH' => Mob.red600,
        'MEDIUM' => Mob.amber600,
        _ => Mob.green600,
      };
}
