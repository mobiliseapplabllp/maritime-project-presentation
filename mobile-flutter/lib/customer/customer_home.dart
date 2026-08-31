import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../session.dart';
import '../theme.dart';
import '../widgets.dart';
import 'track_screen.dart';

/// Customer home: my applications (scoped with mine=true), live counters, and
/// what needs action.
class CustomerHome extends StatefulWidget {
  const CustomerHome({super.key, this.onGoToTab});
  final void Function(int tabIndex)? onGoToTab;

  @override
  State<CustomerHome> createState() => _CustomerHomeState();
}

class _HomeData {
  _HomeData(this.requests, this.dueInvoices);
  final List requests;
  final int dueInvoices;
}

class _CustomerHomeState extends State<CustomerHome> {
  late Future<_HomeData> _future;

  @override
  void initState() {
    super.initState();
    _future = _load();
  }

  Future<_HomeData> _load() async {
    final s = context.read<Session>();
    final requests = await s.api.get('/services/requests',
        query: {'mine': 'true', 'limit': '30', 'sort': '-createdAt'});
    var due = 0;
    if (s.can('invoices.view')) {
      final (_, meta) = await s.api
          .getWithMeta('/invoices', query: {'status': 'ISSUED', 'limit': '1'});
      due = (meta['total'] as num?)?.toInt() ?? 0;
    }
    return _HomeData(requests as List, due);
  }

  void _refresh() => setState(() { _future = _load(); });

  @override
  Widget build(BuildContext context) {
    final s = context.watch<Session>();
    final org = (s.user?['role'] as Map?)?['name'] == 'Shipping Agent'
        ? 'Harbour Shipping'
        : s.designation;
    return Column(
      children: [
        NavyHeader(
          eyebrow: org,
          title: 'Marhaba, ${s.name.split(' ').first}',
          trailing: Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: .12),
              borderRadius: BorderRadius.circular(6),
            ),
            child: Row(children: [
              const Icon(Icons.verified_user_outlined, size: 13, color: Colors.white),
              const SizedBox(width: 6),
              Text('Federated ID', style: ss(11, w: FontWeight.w600, c: Colors.white)),
            ]),
          ),
          bottom: FutureBuilder<_HomeData>(
            future: _future,
            builder: (context, snap) {
              final reqs = (snap.data?.requests ?? const []).cast<Map<String, dynamic>>();
              final open = reqs.where((r) => !['ISSUED', 'REJECTED', 'WITHDRAWN', 'DRAFT'].contains(r['status'])).length;
              final action = reqs.where((r) => r['status'] == 'INFO_REQUESTED').length +
                  (snap.data?.dueInvoices ?? 0);
              return Row(children: [
                StatTile('${reqs.length}', 'My applications'),
                const SizedBox(width: 10),
                StatTile('$open', 'In progress'),
                const SizedBox(width: 10),
                StatTile('$action', 'Action due', valueColor: Mob.dotOffline),
              ]);
            },
          ),
        ),
        Expanded(
          child: AsyncBody<_HomeData>(
            future: _future,
            onRetry: _refresh,
            builder: (context, data) {
              final reqs = data.requests.cast<Map<String, dynamic>>();
              final info = reqs.where((r) => r['status'] == 'INFO_REQUESTED').toList();
              return RefreshIndicator(
                onRefresh: () async => _refresh(),
                color: Mob.cyan600,
                child: ListView(
                  padding: const EdgeInsets.all(16),
                  children: [
                    if (data.dueInvoices > 0) ...[
                      MobCard(
                        borderColor: const Color(0xFFF0DFB9),
                        onTap: () => widget.onGoToTab?.call(3),
                        child: Row(children: [
                          Container(
                            width: 34, height: 34,
                            decoration: BoxDecoration(
                                color: Mob.amber50,
                                borderRadius: BorderRadius.circular(8)),
                            child: const Icon(Icons.receipt_long_outlined,
                                size: 16, color: Mob.amber600),
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text('${data.dueInvoices} invoice(s) awaiting payment',
                                    style: pop(14)),
                                Text('Settle in Billing — payment posts to the register instantly.',
                                    style: ss(12, c: Mob.gray500)),
                              ],
                            ),
                          ),
                          const Icon(Icons.chevron_right, color: Mob.gray400),
                        ]),
                      ),
                      const SizedBox(height: 10),
                    ],
                    if (info.isNotEmpty) ...[
                      MobCard(
                        borderColor: const Color(0xFFF0DFB9),
                        onTap: () => _openRequest(info.first),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            StatusChip('MORE INFORMATION REQUESTED', ChipTone.warning),
                            const SizedBox(height: 7),
                            Text('${info.first['serviceName']}', style: pop(14)),
                            Text('${info.first['requestNo']} · reply to keep your queue place',
                                style: ss(12, c: Mob.gray500)),
                          ],
                        ),
                      ),
                      const SizedBox(height: 10),
                    ],
                    const SectionLabel('My applications'),
                    const SizedBox(height: 10),
                    if (reqs.isEmpty)
                      MobCard(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text('No applications yet', style: pop(14)),
                            const SizedBox(height: 4),
                            Text('Browse the service catalogue to lodge your first application — most services are pre-filled from the register.',
                                style: ss(12.5, c: Mob.gray500, h: 1.4)),
                            const SizedBox(height: 10),
                            PrimaryButton('Open service catalogue',
                                onPressed: () => widget.onGoToTab?.call(1)),
                          ],
                        ),
                      ),
                    for (final r in reqs.take(8)) ...[
                      MobCard(
                        onTap: () => _openRequest(r),
                        child: Row(children: [
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text('${r['serviceName']}',
                                    style: ss(13.5, w: FontWeight.w600, c: Mob.gray900)),
                                Text(
                                    '${r['subjectLabel'] ?? ''}${(r['subjectLabel'] ?? '') != '' ? ' · ' : ''}${r['requestNo']}'
                                    '${(r['fee'] as Map?)?['paid'] == true ? ' · paid ✓' : ''}',
                                    style: ss(11.5, c: Mob.gray500)),
                              ],
                            ),
                          ),
                          StatusChip('${r['status']}'.replaceAll('_', ' '),
                              StatusChip.forStatus('${r['status']}')),
                        ]),
                      ),
                      const SizedBox(height: 10),
                    ],
                    AiCard(
                      child: Text(
                        'Zero-touch services issue automatically once eligibility checks pass — agent A3 processes each gate in the assessor\'s order.',
                        style: ss(12.5, c: Mob.navy700, h: 1.45),
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
    );
  }

  void _openRequest(Map<String, dynamic> r) {
    Navigator.of(context)
        .push(MaterialPageRoute(
          builder: (_) => TrackScreen(requestId: '${r['_id']}'),
        ))
        .then((_) => _refresh());
  }
}
