import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../session.dart';
import '../theme.dart';
import '../widgets.dart';
import 'apply_screen.dart';

const kDomainNames = {
  1: 'Ships', 2: 'Seafarers', 3: 'Legislation', 4: 'Maritime Centre',
  5: 'Inspection', 6: 'Ports', 7: 'Marine Facilities',
};

/// The service catalogue, grouped by RFP domain.
class ServicesScreen extends StatefulWidget {
  const ServicesScreen({super.key});

  @override
  State<ServicesScreen> createState() => _ServicesScreenState();
}

class _ServicesScreenState extends State<ServicesScreen> {
  Future<dynamic>? _future;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _future ??= context.read<Session>().api.get('/services/catalogue');
  }

  void _refresh() => setState(() {
        _future = context.read<Session>().api.get('/services/catalogue');
      });

  @override
  Widget build(BuildContext context) {
    final s = context.watch<Session>();
    return Column(
      children: [
        const NavyHeader(
          title: 'Service catalogue',
          subtitle: 'Apply online — pre-filled from the register where possible',
        ),
        Expanded(
          child: AsyncBody<dynamic>(
            future: _future!,
            onRetry: _refresh,
            builder: (context, d) {
              final data = d as Map<String, dynamic>;
              final domains = (data['domains'] as List).cast<Map<String, dynamic>>();
              return ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  Text(
                      '${data['total']} services · ${data['autoApprovable']} eligible for zero-touch issue',
                      style: ss(11.5, c: Mob.gray400)),
                  const SizedBox(height: 10),
                  for (final dom in domains) ...[
                    SectionLabel(
                        'Domain ${dom['domain']} — ${kDomainNames[dom['domain']] ?? ''}'),
                    const SizedBox(height: 8),
                    for (final svc in (dom['services'] as List).cast<Map<String, dynamic>>()) ...[
                      MobCard(
                        onTap: !s.can('services.apply')
                            ? null
                            : () => Navigator.of(context).push(MaterialPageRoute(
                                  builder: (_) => ApplyScreen(serviceCode: '${svc['code']}'),
                                )),
                        child: Row(children: [
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text('${svc['name']}',
                                    style: ss(13.5, w: FontWeight.w600, c: Mob.gray900)),
                                Text(
                                  '${svc['code']} · ${fmtMoney(((svc['fee'] as Map?)?['amount'] as num?) ?? 0, '${(svc['fee'] as Map?)?['currency'] ?? 'INR'}')}'
                                  ' · SLA ${svc['slaDays']}d'
                                  '${svc['issuesInstrument'] != null && '${svc['issuesInstrument']}'.isNotEmpty ? ' · issues certificate' : ''}',
                                  style: ss(11.5, c: Mob.gray500),
                                ),
                              ],
                            ),
                          ),
                          if (svc['autoApprovable'] == true)
                            const StatusChip('ZERO-TOUCH', ChipTone.ai),
                          const SizedBox(width: 6),
                          if (s.can('services.apply'))
                            const Icon(Icons.chevron_right, color: Mob.gray400),
                        ]),
                      ),
                      const SizedBox(height: 8),
                    ],
                    const SizedBox(height: 8),
                  ],
                  const SizedBox(height: 24),
                ],
              );
            },
          ),
        ),
      ],
    );
  }
}
