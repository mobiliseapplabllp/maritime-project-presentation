import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../session.dart';
import '../theme.dart';
import '../widgets.dart';

/// Vessel register with search; detail shows the certificate wallet (live
/// validity from the register) and the public-verification path.
class FleetScreen extends StatefulWidget {
  const FleetScreen({super.key});

  @override
  State<FleetScreen> createState() => _FleetScreenState();
}

class _FleetScreenState extends State<FleetScreen> {
  final _search = TextEditingController();
  Future<dynamic>? _future;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _future ??= _load();
  }

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  Future<dynamic> _load() => context.read<Session>().api.get('/vessels', query: {
        if (_search.text.isNotEmpty) 'q': _search.text,
        'limit': '30',
        'sort': 'name',
      });

  void _refresh() => setState(() { _future = _load(); });

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        NavyHeader(
          title: 'Fleet & registry',
          subtitle: 'Vessels and their live certificate wallets',
          bottom: TextField(
            controller: _search,
            style: ss(13, c: Mob.gray900),
            decoration: InputDecoration(
              hintText: 'Search by name, IMO or call sign',
              suffixIcon: const Icon(Icons.search, size: 18),
              isDense: true,
            ),
            onSubmitted: (_) => _refresh(),
          ),
        ),
        Expanded(
          child: AsyncBody<dynamic>(
            future: _future!,
            onRetry: _refresh,
            isEmpty: (d) => (d as List).isEmpty,
            emptyTitle: 'No vessels found',
            emptyBody: 'Adjust the search and try again.',
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
                    final v = rows[i];
                    final registry = (v['registry'] as Map?) ?? const {};
                    return MobCard(
                      semanticLabel: 'Open certificate wallet for ${v['name']}',
                      onTap: () => Navigator.of(context).push(MaterialPageRoute(
                        builder: (_) => VesselWalletScreen(vesselId: '${v['_id']}'),
                      )),
                      child: Row(children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text('${v['name']}', style: pop(14.5)),
                              Text(
                                  'IMO ${v['imo']} · ${v['type']} · ${v['flag']} · agent ${v['agent'] ?? '—'}',
                                  style: ss(11.5, c: Mob.gray500)),
                            ],
                          ),
                        ),
                        StatusChip('${registry['state'] ?? 'UNREGISTERED'}',
                            registry['state'] == 'REGISTERED'
                                ? ChipTone.success
                                : ChipTone.neutral),
                      ]),
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

/// Certificate wallet for one vessel: ship certificates with derived validity
/// plus issued statutory instruments (public-verifiable by licence number).
class VesselWalletScreen extends StatefulWidget {
  const VesselWalletScreen({super.key, required this.vesselId});
  final String vesselId;

  @override
  State<VesselWalletScreen> createState() => _VesselWalletScreenState();
}

class _WalletData {
  _WalletData(this.vessel, this.instruments);
  final Map<String, dynamic> vessel;
  final List instruments;
}

class _VesselWalletScreenState extends State<VesselWalletScreen> {
  late Future<_WalletData> _future;

  @override
  void initState() {
    super.initState();
    _future = _load();
  }

  Future<_WalletData> _load() async {
    final api = context.read<Session>().api;
    final vessel = await api.get('/vessels/${widget.vesselId}');
    List instruments = const [];
    try {
      instruments = await api.get('/vessels/${widget.vesselId}/instruments') as List;
    } catch (_) {/* role without instrument access still sees the wallet */}
    return _WalletData(vessel as Map<String, dynamic>, instruments);
  }

  @override
  Widget build(BuildContext context) {
    final base = context.read<Session>().api.baseUrl;
    return Scaffold(
      body: Column(
        children: [
          const NavyHeader(
            leadingBack: true,
            title: 'Certificate wallet',
            subtitle: 'Validity computed live from the register — never cached',
          ),
          Expanded(
            child: AsyncBody<_WalletData>(
              future: _future,
              onRetry: () => setState(() { _future = _load(); }),
              builder: (context, d) {
                final v = d.vessel;
                final certs = ((v['certificates'] as List?) ?? const [])
                    .cast<Map<String, dynamic>>();
                final position = v['lastPosition'] as Map?;
                return ListView(
                  padding: const EdgeInsets.all(16),
                  children: [
                    MobCard(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('${v['name']}', style: pop(16)),
                          Text('IMO ${v['imo']} · ${v['type']} · ${v['flag']} flag',
                              style: ss(12, c: Mob.gray500)),
                          if (position != null)
                            Padding(
                              padding: const EdgeInsets.only(top: 6),
                              child: Text(
                                'Last position: ${position['navStatus']} · ${position['destination'] ?? ''} · ${fmtDate(position['receivedAt'], time: true)}',
                                style: ss(11.5, c: Mob.gray400),
                              ),
                            ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 12),
                    const SectionLabel('Ship certificates'),
                    const SizedBox(height: 8),
                    if (certs.isEmpty)
                      MobCard(
                          child: Text('No certificates on record.',
                              style: ss(12.5, c: Mob.gray500))),
                    for (final c in certs) ...[
                      MobCard(
                        child: Row(children: [
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text('${c['certType']}',
                                    style: ss(13.5, w: FontWeight.w600, c: Mob.gray900)),
                                Text(
                                    '${c['number'] ?? ''} · ${c['issuer'] ?? ''} · expires ${fmtDate(c['expiryDate'])}',
                                    style: ss(11.5, c: Mob.gray500)),
                              ],
                            ),
                          ),
                          StatusChip('${c['status']}', StatusChip.forStatus('${c['status']}')),
                        ]),
                      ),
                      const SizedBox(height: 8),
                    ],
                    const SizedBox(height: 8),
                    const SectionLabel('Statutory instruments'),
                    const SizedBox(height: 4),
                    Text(
                        'Ed25519-signed. Anyone can verify a licence number without an account.',
                        style: ss(11.5, c: Mob.gray400)),
                    const SizedBox(height: 8),
                    if (d.instruments.isEmpty)
                      MobCard(
                          child: Text('No issued instruments for this vessel.',
                              style: ss(12.5, c: Mob.gray500))),
                    for (final lic in d.instruments.cast<Map<String, dynamic>>()) ...[
                      MobCard(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(children: [
                              Expanded(
                                child: Text('${lic['instrumentClass'] ?? lic['entityType'] ?? 'Instrument'}',
                                    style: ss(13.5, w: FontWeight.w600, c: Mob.gray900)),
                              ),
                              StatusChip('${lic['status']}', StatusChip.forStatus('${lic['status']}')),
                            ]),
                            const SizedBox(height: 4),
                            Text(
                                '${lic['licenseNo']} · issued ${fmtDate(lic['issueDate'])}'
                                '${lic['expiryDate'] != null ? ' · expires ${fmtDate(lic['expiryDate'])}' : ''}',
                                style: ss(11.5, c: Mob.gray500)),
                            const SizedBox(height: 8),
                            Container(
                              padding: const EdgeInsets.all(10),
                              decoration: BoxDecoration(
                                color: Mob.gray50,
                                borderRadius: BorderRadius.circular(7),
                              ),
                              child: Row(children: [
                                const Icon(Icons.qr_code_2, size: 30, color: Mob.navy800),
                                const SizedBox(width: 10),
                                Expanded(
                                  child: Text(
                                    'Public verify: $base/public/verify/${lic['licenseNo']}',
                                    style: ss(10.5, c: Mob.gray500),
                                  ),
                                ),
                              ]),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 8),
                    ],
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
}
