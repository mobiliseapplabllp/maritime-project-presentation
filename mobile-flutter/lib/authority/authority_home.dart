import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../session.dart';
import '../theme.dart';
import '../widgets.dart';
import 'dossier_screen.dart';
import 'inspection_run_screen.dart';

/// Authority home: live KPIs, today's planned boardings (joined with the
/// risk-targeting agent output), and the AI focus advisory.
class AuthorityHome extends StatefulWidget {
  const AuthorityHome({super.key, this.onGoToTab});
  final void Function(int tabIndex)? onGoToTab;

  @override
  State<AuthorityHome> createState() => _AuthorityHomeState();
}

class _HomeData {
  _HomeData(this.planned, this.targeting, this.inspKpis, this.openCritical);
  final List planned;
  final List targeting;
  final Map<String, dynamic> inspKpis;
  final int openCritical;
}

class _AuthorityHomeState extends State<AuthorityHome> {
  late Future<_HomeData> _future;
  bool _online = true;

  @override
  void initState() {
    super.initState();
    _future = _load();
  }

  Future<_HomeData> _load() async {
    final s = context.read<Session>();
    try {
      final planned = s.can('inspections.view')
          ? await s.api.get('/inspections',
              query: {'status': 'PLANNED', 'limit': '6', 'sort': 'plannedAt'})
          : const [];
      final targeting =
          s.can('risk.view') ? await s.api.get('/risk/targeting') : const [];
      final dash = s.can('inspections.view')
          ? await s.api.get('/inspections/dashboard')
          : const {'kpis': <String, dynamic>{}};
      var critical = 0;
      if (s.can('incidents.view')) {
        final (_, meta) = await s.api.getWithMeta('/incidents', query: {
          'open': 'true', 'severity': 'CRITICAL', 'limit': '1',
        });
        critical = (meta['total'] as num?)?.toInt() ?? 0;
      }
      if (mounted) setState(() => _online = true);
      return _HomeData(planned as List, targeting as List,
          (dash as Map<String, dynamic>)['kpis'] as Map<String, dynamic>? ?? {},
          critical);
    } catch (e) {
      if (mounted) setState(() => _online = false);
      rethrow;
    }
  }

  void _refresh() => setState(() { _future = _load(); });

  Map<String, dynamic>? _riskFor(List targeting, dynamic vesselId) {
    for (final t in targeting) {
      if (t['vesselId'] == vesselId) return (t['risk'] as Map<String, dynamic>?);
    }
    return null;
  }

  @override
  Widget build(BuildContext context) {
    final s = context.watch<Session>();
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    final now = DateTime.now();
    const days = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
    return Column(
      children: [
        NavyHeader(
          eyebrow: '${days[now.weekday - 1]} ${now.day} ${months[now.month - 1]}',
          title: s.name,
          subtitle: '${s.designation} · ${s.roleName}',
          trailing: Semantics(
            label: _online ? 'Online, synced' : 'Offline',
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
              decoration: BoxDecoration(
                color: Colors.white.withValues(alpha: .12),
                borderRadius: BorderRadius.circular(6),
              ),
              child: Row(children: [
                Container(
                  width: 7, height: 7,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: _online ? Mob.dotOnline : Mob.dotOffline,
                  ),
                ),
                const SizedBox(width: 6),
                Text(_online ? 'Online · live' : 'Offline',
                    style: ss(11.5, w: FontWeight.w600, c: Colors.white)),
              ]),
            ),
          ),
          bottom: FutureBuilder<_HomeData>(
            future: _future,
            builder: (context, snap) {
              final k = snap.data?.inspKpis ?? const {};
              final critical = snap.data?.openCritical;
              return Row(children: [
                StatTile('${k['open'] ?? '—'}', 'Open inspections'),
                const SizedBox(width: 10),
                StatTile('${k['openFindings'] ?? '—'}', 'Open findings'),
                const SizedBox(width: 10),
                StatTile('${critical ?? '—'}', 'Critical incidents',
                    valueColor: Mob.cyanBright),
              ]);
            },
          ),
        ),
        Expanded(
          child: AsyncBody<_HomeData>(
            future: _future,
            onRetry: _refresh,
            builder: (context, data) {
              return RefreshIndicator(
                onRefresh: () async => _refresh(),
                color: Mob.cyan600,
                child: ListView(
                  padding: const EdgeInsets.all(16),
                  children: [
                    const SectionLabel('Planned boardings'),
                    const SizedBox(height: 10),
                    if (data.planned.isEmpty)
                      MobCard(
                        child: Text('No planned inspections. New boardings appear here as they are scheduled.',
                            style: ss(12.5, c: Mob.gray500)),
                      ),
                    for (final insp in data.planned) ...[
                      _BoardingCard(
                        inspection: insp as Map<String, dynamic>,
                        risk: _riskFor(data.targeting, (insp['vessel'] as Map?)?['_id']),
                        onChanged: _refresh,
                      ),
                      const SizedBox(height: 10),
                    ],
                    if (data.targeting.isNotEmpty) ...[
                      const SizedBox(height: 4),
                      AiCard(
                        child: Text.rich(
                          TextSpan(children: [
                            TextSpan(text: 'Focus advisory: ', style: ss(12.5, w: FontWeight.w700, c: Mob.navy700)),
                            TextSpan(
                              text: _advisory(data.targeting),
                              style: ss(12.5, c: Mob.navy700, h: 1.45),
                            ),
                          ]),
                        ),
                      ),
                    ],
                    const SizedBox(height: 24),
                  ],
                ),
              );
            },
          ),
        ),
      ],
    );
  }

  String _advisory(List targeting) {
    final top = targeting.first as Map<String, dynamic>;
    final risk = top['risk'] as Map<String, dynamic>;
    final factors = (risk['factors'] as List).cast<Map<String, dynamic>>();
    final lead = factors.isEmpty ? '' : ' — ${factors.first['label']}: ${factors.first['evidence']}';
    return '${top['vessel']} ranks highest of ${targeting.length} inbound '
        '(risk ${risk['score']}, ${risk['band']})$lead. Ranked by agent A5 from live register data.';
  }
}

class _BoardingCard extends StatelessWidget {
  const _BoardingCard({required this.inspection, this.risk, this.onChanged});
  final Map<String, dynamic> inspection;
  final Map<String, dynamic>? risk;
  final VoidCallback? onChanged;

  @override
  Widget build(BuildContext context) {
    final s = context.read<Session>();
    final vessel = (inspection['vessel'] as Map?) ?? const {};
    final score = risk?['score'];
    final band = (risk?['band'] as String?) ?? '';
    return MobCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text('${vessel['name'] ?? 'Unknown vessel'}', style: pop(15)),
                  Text('IMO ${vessel['imo'] ?? '—'} · ${inspection['type']} · ${inspection['number']}',
                      style: ss(12, c: Mob.gray500)),
                ]),
              ),
              if (score != null)
                StatusChip('RISK $score', StatusChip.forStatus(band)),
            ],
          ),
          const SizedBox(height: 8),
          Row(children: [
            StatusChip('${inspection['type']} · ${fmtDate(inspection['plannedAt'])}', ChipTone.info),
            const SizedBox(width: 8),
            if (risk != null) const StatusChip('Dossier ready', ChipTone.ai),
          ]),
          const SizedBox(height: 12),
          Row(children: [
            Expanded(
              child: PrimaryButton('Open dossier', onPressed: () {
                Navigator.of(context).push(MaterialPageRoute(
                  builder: (_) => DossierScreen(
                    vesselId: '${vessel['_id']}',
                    inspectionId: '${inspection['_id']}',
                  ),
                )).then((_) => onChanged?.call());
              }),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: OutlineButtonMob(
                s.can('inspections.edit') ? 'Start inspection' : 'View checklist',
                onPressed: () {
                  Navigator.of(context).push(MaterialPageRoute(
                    builder: (_) => InspectionRunScreen(inspectionId: '${inspection['_id']}'),
                  )).then((_) => onChanged?.call());
                },
              ),
            ),
          ]),
        ],
      ),
    );
  }
}
