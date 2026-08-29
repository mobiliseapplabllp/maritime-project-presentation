import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../session.dart';
import '../theme.dart';
import '../widgets.dart';
import 'inspection_run_screen.dart';

/// Pre-inspection dossier: vessel record + live risk factors + inspection
/// history, composed from the register the way the design's AI dossier is.
class DossierScreen extends StatefulWidget {
  const DossierScreen({super.key, required this.vesselId, this.inspectionId});
  final String vesselId;
  final String? inspectionId;

  @override
  State<DossierScreen> createState() => _DossierScreenState();
}

class _Dossier {
  _Dossier(this.vessel, this.risk);
  final Map<String, dynamic> vessel;
  final Map<String, dynamic>? risk;
}

class _DossierScreenState extends State<DossierScreen> {
  late Future<_Dossier> _future;

  @override
  void initState() {
    super.initState();
    _future = _load();
  }

  Future<_Dossier> _load() async {
    final s = context.read<Session>();
    final vessel = await s.api.get('/vessels/${widget.vesselId}');
    Map<String, dynamic>? risk;
    if (s.can('risk.view')) {
      final scores = await s.api.get('/risk/scores') as List;
      risk = scores.cast<Map<String, dynamic>?>().firstWhere(
          (r) => r?['vesselId'] == widget.vesselId,
          orElse: () => null);
    }
    return _Dossier(vessel as Map<String, dynamic>, risk);
  }

  @override
  Widget build(BuildContext context) {
    final s = context.watch<Session>();
    return Scaffold(
      body: Column(
        children: [
          NavyHeader(
            leadingBack: true,
            title: 'Pre-inspection dossier',
            subtitle: 'Live from the register · generated now',
          ),
          Expanded(
            child: AsyncBody<_Dossier>(
              future: _future,
              onRetry: () => setState(() { _future = _load(); }),
              builder: (context, d) {
                final v = d.vessel;
                final certs = (v['certificates'] as List? ?? const [])
                    .cast<Map<String, dynamic>>();
                final expired =
                    certs.where((c) => c['status'] == 'EXPIRED').length;
                final expiring =
                    certs.where((c) => c['status'] == 'EXPIRING').length;
                final inspections = (v['recentInspections'] as List? ?? const [])
                    .cast<Map<String, dynamic>>();
                final factors = ((d.risk?['factors'] as List?) ?? const [])
                    .cast<Map<String, dynamic>>();
                return ListView(
                  padding: const EdgeInsets.all(16),
                  children: [
                    MobCard(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(children: [
                            Expanded(child: Text('${v['name']}', style: pop(16))),
                            if (d.risk != null)
                              StatusChip('RISK ${d.risk!['score']} · ${d.risk!['band']}',
                                  StatusChip.forStatus('${d.risk!['band']}')),
                          ]),
                          const SizedBox(height: 2),
                          Text(
                              'IMO ${v['imo']} · ${v['type']} · ${v['flag']} flag · built ${v['built']}',
                              style: ss(12, c: Mob.gray500)),
                          Text('Agent: ${v['agent'] ?? '—'} · Class: ${v['classSociety'] ?? '—'}',
                              style: ss(12, c: Mob.gray500)),
                        ],
                      ),
                    ),
                    const SizedBox(height: 10),
                    MobCard(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('SUMMARY', style: pop(12, c: Mob.cyan700).copyWith(letterSpacing: .8)),
                          const SizedBox(height: 7),
                          Text(
                            _summary(v, d.risk, expired, expiring, inspections),
                            style: ss(13, c: Mob.gray700, h: 1.55),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 10),
                    if (factors.isNotEmpty)
                      MobCard(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text('FOCUS AREAS', style: pop(12, c: Mob.cyan700).copyWith(letterSpacing: .8)),
                            const SizedBox(height: 8),
                            for (final (i, f) in factors.take(4).indexed)
                              Padding(
                                padding: const EdgeInsets.only(bottom: 8),
                                child: Row(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text('${i + 1}',
                                        style: ss(12.5, w: FontWeight.w700,
                                            c: i == 0 ? Mob.red600 : Mob.amber600)),
                                    const SizedBox(width: 8),
                                    Expanded(
                                      child: Text(
                                          '${f['label']} — ${f['evidence']} (${f['points']}/${f['max']} pts)',
                                          style: ss(12.5, c: Mob.gray900, h: 1.4)),
                                    ),
                                  ],
                                ),
                              ),
                          ],
                        ),
                      ),
                    const SizedBox(height: 10),
                    if (inspections.isNotEmpty)
                      MobCard(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text('INSPECTION HISTORY', style: pop(12, c: Mob.cyan700).copyWith(letterSpacing: .8)),
                            const SizedBox(height: 6),
                            for (final insp in inspections.take(5))
                              Padding(
                                padding: const EdgeInsets.symmetric(vertical: 4),
                                child: Row(children: [
                                  Expanded(
                                    child: Text(
                                        '${insp['number']} · ${insp['type']} · ${fmtDate(insp['plannedAt'])}',
                                        style: ss(12.5, c: Mob.gray700)),
                                  ),
                                  StatusChip(
                                      '${(insp['result'] as String?)?.isNotEmpty == true ? insp['result'] : insp['status']}',
                                      StatusChip.forStatus(
                                          '${(insp['result'] as String?)?.isNotEmpty == true ? insp['result'] : insp['status']}')),
                                ]),
                              ),
                          ],
                        ),
                      ),
                    const SizedBox(height: 14),
                    if (widget.inspectionId != null && s.can('inspections.view'))
                      PrimaryButton('Open inspection with this dossier', onPressed: () {
                        Navigator.of(context).pushReplacement(MaterialPageRoute(
                          builder: (_) => InspectionRunScreen(inspectionId: widget.inspectionId!),
                        ));
                      }),
                    const SizedBox(height: 24),
                  ],
                );
              },
            ),
          ),
        ],
      ),
    );
  }

  String _summary(Map<String, dynamic> v, Map<String, dynamic>? risk,
      int expired, int expiring, List<Map<String, dynamic>> inspections) {
    final parts = <String>[];
    if (risk != null) {
      parts.add('Composite risk ${risk['score']} (${risk['band']}) — agent A2, explainable factors below.');
    }
    if (expired > 0) parts.add('$expired statutory certificate(s) expired.');
    if (expiring > 0) parts.add('$expiring certificate(s) expiring within the window.');
    final detained = inspections.where((i) => i['detention'] == true).length;
    if (detained > 0) parts.add('$detained detention(s) in recent history.');
    final registry = (v['registry'] as Map?)?['state'];
    if (registry != null) parts.add('Registry state: $registry.');
    if (parts.isEmpty) parts.add('No adverse indicators on the current record.');
    return parts.join(' ');
  }
}
