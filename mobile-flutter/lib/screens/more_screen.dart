import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../screens/launcher.dart';
import '../session.dart';
import '../theme.dart';
import '../widgets.dart';

/// Profile, live stat cards for the signed-in role, and sign-out.
class MoreScreen extends StatefulWidget {
  const MoreScreen({super.key, required this.appLabel, this.statsScope});
  final String appLabel;
  final String? statsScope;

  @override
  State<MoreScreen> createState() => _MoreScreenState();
}

class _MoreScreenState extends State<MoreScreen> {
  Future<dynamic>? _stats;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final s = context.read<Session>();
    final scope = widget.statsScope ??
        (s.can('inspections.view') ? 'inspections' : 'portcalls');
    _stats ??= s.api.get('/stats/$scope').catchError((_) => {'cards': []});
  }

  @override
  Widget build(BuildContext context) {
    final s = context.watch<Session>();
    return Column(
      children: [
        NavyHeader(title: 'More', subtitle: widget.appLabel),
        Expanded(
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              MobCard(
                child: Row(children: [
                  Container(
                    width: 44, height: 44,
                    decoration: const BoxDecoration(
                        color: Mob.navy700, shape: BoxShape.circle),
                    alignment: Alignment.center,
                    child: Text(
                      s.name.isEmpty ? '?' : s.name.characters.first,
                      style: pop(18, c: Colors.white),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(s.name, style: pop(15)),
                        Text('${s.designation} · ${s.roleName}',
                            style: ss(12, c: Mob.gray500)),
                        Text('${s.user?['email'] ?? ''}',
                            style: ss(11.5, c: Mob.gray400)),
                      ],
                    ),
                  ),
                ]),
              ),
              const SizedBox(height: 10),
              MobCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('ACCESS', style: pop(12, c: Mob.cyan600).copyWith(letterSpacing: .8)),
                    const SizedBox(height: 7),
                    Text(
                      s.perms.contains('*')
                          ? 'Super Admin — all permissions.'
                          : '${s.perms.length} permissions held. Every screen and action in this app is gated by the same deny-by-default catalogue the platform enforces server-side.',
                      style: ss(12.5, c: Mob.gray700, h: 1.45),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 10),
              FutureBuilder<dynamic>(
                future: _stats,
                builder: (context, snap) {
                  final cards = ((snap.data as Map<String, dynamic>?)?['cards']
                              as List? ??
                          const [])
                      .cast<Map<String, dynamic>>();
                  if (cards.isEmpty) return const SizedBox.shrink();
                  return Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const SectionLabel('Live indicators'),
                      const SizedBox(height: 8),
                      GridView.count(
                        crossAxisCount: 2,
                        shrinkWrap: true,
                        physics: const NeverScrollableScrollPhysics(),
                        mainAxisSpacing: 8,
                        crossAxisSpacing: 8,
                        childAspectRatio: 2.1,
                        children: [
                          for (final c in cards.take(6))
                            MobCard(
                              padding: const EdgeInsets.all(12),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                mainAxisAlignment: MainAxisAlignment.center,
                                children: [
                                  Text('${c['value']}',
                                      style: pop(17, w: FontWeight.w700,
                                          c: _toneColor('${c['tone']}'))),
                                  Text('${c['label']}',
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                      style: ss(11, c: Mob.gray500)),
                                ],
                              ),
                            ),
                        ],
                      ),
                    ],
                  );
                },
              ),
              const SizedBox(height: 16),
              OutlineButtonMob('Sign out', onPressed: () {
                s.logout();
                Navigator.of(context).pushAndRemoveUntil(
                  MaterialPageRoute(builder: (_) => const LauncherScreen()),
                  (_) => false,
                );
              }),
              const SizedBox(height: 24),
            ],
          ),
        ),
      ],
    );
  }

  Color _toneColor(String tone) => switch (tone) {
        'success' => Mob.green600,
        'warning' => Mob.amber600,
        'error' => Mob.red600,
        _ => Mob.navy800,
      };
}
