import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../session.dart';
import '../theme.dart';
import '../widgets.dart';

/// Application tracking: status, SLA, eligibility checks, the decision, and
/// the full history timeline from the platform's own transition log.
class TrackScreen extends StatefulWidget {
  const TrackScreen({super.key, required this.requestId, this.justSubmitted = false});
  final String requestId;
  final bool justSubmitted;

  @override
  State<TrackScreen> createState() => _TrackScreenState();
}

class _TrackScreenState extends State<TrackScreen> {
  late Future<dynamic> _future;

  @override
  void initState() {
    super.initState();
    _future = _load();
  }

  Future<dynamic> _load() =>
      context.read<Session>().api.get('/services/requests/${widget.requestId}');

  void _refresh() => setState(() { _future = _load(); });

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Column(
        children: [
          NavyHeader(
            leadingBack: true,
            title: 'Application',
            subtitle: 'Live status from the platform',
          ),
          Expanded(
            child: AsyncBody<dynamic>(
              future: _future,
              onRetry: _refresh,
              builder: (context, d) {
                final r = d as Map<String, dynamic>;
                final history =
                    ((r['history'] as List?) ?? const []).cast<Map<String, dynamic>>();
                final checks =
                    ((r['checks'] as List?) ?? const []).cast<Map<String, dynamic>>();
                final fee = (r['fee'] as Map?) ?? const {};
                final decision = (r['decision'] as Map?) ?? const {};
                final status = '${r['status']}';
                final closed = ['ISSUED', 'REJECTED', 'WITHDRAWN'].contains(status);
                return RefreshIndicator(
                  onRefresh: () async => _refresh(),
                  color: Mob.cyan600,
                  child: ListView(
                    padding: const EdgeInsets.all(16),
                    children: [
                      if (widget.justSubmitted) ...[
                        MobCard(
                          borderColor: const Color(0xFFCBE9D8),
                          child: Row(children: [
                            const Icon(Icons.check_circle, color: Mob.green600, size: 20),
                            const SizedBox(width: 10),
                            Expanded(
                              child: Text(
                                'Application lodged as ${r['requestNo']}. Every step lands here as it happens.',
                                style: ss(12.5, c: Mob.gray700, h: 1.4),
                              ),
                            ),
                          ]),
                        ),
                        const SizedBox(height: 10),
                      ],
                      MobCard(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(children: [
                              Expanded(child: Text('${r['serviceName']}', style: pop(15))),
                              StatusChip(status.replaceAll('_', ' '),
                                  StatusChip.forStatus(status)),
                            ]),
                            const SizedBox(height: 4),
                            Text(
                              '${r['requestNo']} · ${r['subjectLabel'] ?? 'no subject'}'
                              '${r['dueAt'] != null && !closed ? ' · due ${fmtDate(r['dueAt'])}' : ''}'
                              '${r['slaBreached'] == true ? ' · SLA BREACHED' : ''}',
                              style: ss(12, c: r['slaBreached'] == true ? Mob.red600 : Mob.gray500),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 10),
                      if ((fee['amount'] as num? ?? 0) > 0) ...[
                        MobCard(
                          child: Row(children: [
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text('Service fee', style: ss(11, c: Mob.gray400)),
                                  Text(fmtMoney(fee['amount'] as num?, '${fee['currency'] ?? 'INR'}'),
                                      style: pop(16, w: FontWeight.w700)),
                                ],
                              ),
                            ),
                            fee['paid'] == true
                                ? const StatusChip('PAID', ChipTone.success)
                                : const StatusChip('PAYABLE ON INVOICE', ChipTone.warning),
                          ]),
                        ),
                        const SizedBox(height: 10),
                      ],
                      if (checks.isNotEmpty) ...[
                        MobCard(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text('ELIGIBILITY CHECKS',
                                  style: pop(12, c: Mob.cyan600).copyWith(letterSpacing: .8)),
                              const SizedBox(height: 8),
                              for (final c in checks)
                                Padding(
                                  padding: const EdgeInsets.only(bottom: 6),
                                  child: Row(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Icon(
                                        c['passed'] == true
                                            ? Icons.check_circle_outline
                                            : Icons.error_outline,
                                        size: 16,
                                        color: c['passed'] == true ? Mob.green600 : Mob.red600,
                                      ),
                                      const SizedBox(width: 8),
                                      Expanded(
                                        child: Text(
                                          '${c['check']}${'${c['detail'] ?? ''}'.isNotEmpty ? ' — ${c['detail']}' : ''}',
                                          style: ss(12.5, c: Mob.gray700, h: 1.4),
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                            ],
                          ),
                        ),
                        const SizedBox(height: 10),
                      ],
                      if ('${decision['outcome'] ?? ''}'.isNotEmpty) ...[
                        MobCard(
                          borderColor: decision['outcome'] == 'APPROVED'
                              ? const Color(0xFFCBE9D8)
                              : null,
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(children: [
                                Text('DECISION',
                                    style: pop(12, c: Mob.cyan600).copyWith(letterSpacing: .8)),
                                const Spacer(),
                                if (decision['automated'] == true)
                                  const StatusChip('ZERO-TOUCH · AGENT A3', ChipTone.ai),
                              ]),
                              const SizedBox(height: 7),
                              Text(
                                '${decision['outcome']}'
                                '${'${decision['reason'] ?? ''}'.isNotEmpty ? ' — ${decision['reason']}' : ''}',
                                style: ss(13, c: Mob.gray900, h: 1.45),
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(height: 10),
                      ],
                      MobCard(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text('TIMELINE',
                                style: pop(12, c: Mob.cyan600).copyWith(letterSpacing: .8)),
                            const SizedBox(height: 10),
                            for (final (i, h) in history.reversed.indexed)
                              _TimelineRow(
                                title: '${h['to']}'.replaceAll('_', ' '),
                                sub: '${fmtDate(h['at'], time: true)}'
                                    '${'${h['note'] ?? ''}'.isNotEmpty ? ' · ${h['note']}' : ''}',
                                first: i == 0,
                                last: i == history.length - 1,
                              ),
                            if (history.isEmpty)
                              Text('No transitions yet.', style: ss(12.5, c: Mob.gray500)),
                          ],
                        ),
                      ),
                      const SizedBox(height: 24),
                    ],
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

class _TimelineRow extends StatelessWidget {
  const _TimelineRow({
    required this.title,
    required this.sub,
    this.first = false,
    this.last = false,
  });

  final String title;
  final String sub;
  final bool first;
  final bool last;

  @override
  Widget build(BuildContext context) {
    return IntrinsicHeight(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Column(children: [
            Container(
              width: 22, height: 22,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: first ? Mob.cyan600 : Mob.green600,
              ),
              child: Icon(first ? Icons.circle : Icons.check,
                  size: first ? 8 : 12, color: Colors.white),
            ),
            if (!last)
              Expanded(
                child: Container(width: 2, color: first ? Mob.gray200 : const Color(0xFFCBE9D8)),
              ),
          ]),
          const SizedBox(width: 12),
          Expanded(
            child: Padding(
              padding: EdgeInsets.only(bottom: last ? 0 : 16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title,
                      style: ss(13, w: FontWeight.w700,
                          c: first ? Mob.cyan700 : Mob.gray900)),
                  Text(sub, style: ss(11.5, c: Mob.gray500)),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
