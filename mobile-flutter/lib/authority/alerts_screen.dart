import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../session.dart';
import '../theme.dart';
import '../widgets.dart';

/// Alerts: open incidents (severity-ranked) and the notification feed.
class AlertsScreen extends StatefulWidget {
  const AlertsScreen({super.key});

  @override
  State<AlertsScreen> createState() => _AlertsScreenState();
}

class _AlertsScreenState extends State<AlertsScreen>
    with SingleTickerProviderStateMixin {
  late final TabController _tabs = TabController(length: 2, vsync: this);
  Future<dynamic>? _incidents;
  Future<(dynamic, Map<String, dynamic>)>? _notifications;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final s = context.read<Session>();
    _incidents ??= s.can('incidents.view')
        ? s.api.get('/incidents',
            query: {'open': 'true', 'limit': '30', 'sort': '-reportedAt'})
        : Future.value(const []);
    _notifications ??= s.api.getWithMeta('/notifications');
  }

  @override
  void dispose() {
    _tabs.dispose();
    super.dispose();
  }

  void _refresh() {
    final s = context.read<Session>();
    setState(() {
      _incidents = s.can('incidents.view')
          ? s.api.get('/incidents',
              query: {'open': 'true', 'limit': '30', 'sort': '-reportedAt'})
          : Future.value(const []);
      _notifications = s.api.getWithMeta('/notifications');
    });
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        NavyHeader(
          title: 'Alerts',
          subtitle: 'Live incidents and platform notifications',
          bottom: Container(
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: .12),
              borderRadius: BorderRadius.circular(8),
            ),
            child: TabBar(
              controller: _tabs,
              indicator: BoxDecoration(
                color: Mob.cyan600,
                borderRadius: BorderRadius.circular(8),
              ),
              indicatorSize: TabBarIndicatorSize.tab,
              dividerHeight: 0,
              labelStyle: ss(12.5, w: FontWeight.w700, c: Colors.white),
              unselectedLabelStyle: ss(12.5, w: FontWeight.w600, c: Colors.white),
              labelColor: Colors.white,
              unselectedLabelColor: Colors.white,
              tabs: const [Tab(text: 'Incidents', height: 36), Tab(text: 'Notifications', height: 36)],
            ),
          ),
        ),
        Expanded(
          child: TabBarView(
            controller: _tabs,
            children: [
              AsyncBody<dynamic>(
                future: _incidents!,
                onRetry: _refresh,
                isEmpty: (d) => (d as List).isEmpty,
                emptyTitle: 'No open incidents',
                emptyBody: 'The picture is clear.',
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
                        final inc = rows[i];
                        return MobCard(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(children: [
                                Expanded(child: Text('${inc['title']}', style: pop(14))),
                                StatusChip('${inc['severity']}',
                                    StatusChip.forStatus('${inc['severity']}')),
                              ]),
                              const SizedBox(height: 3),
                              Text(
                                '${inc['number']} · ${inc['type']} · ${'${inc['status']}'.replaceAll('_', ' ')}'
                                ' · ${fmtDate(inc['reportedAt'], time: true)}'
                                '${inc['vesselName'] != null && '${inc['vesselName']}'.isNotEmpty ? ' · ${inc['vesselName']}' : ''}',
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
              AsyncBody<(dynamic, Map<String, dynamic>)>(
                future: _notifications!,
                onRetry: _refresh,
                isEmpty: (d) => (d.$1 as List).isEmpty,
                emptyTitle: 'No notifications',
                emptyBody: 'You are fully caught up.',
                builder: (context, d) {
                  final rows = (d.$1 as List).cast<Map<String, dynamic>>();
                  final unread = (d.$2['unread'] as num?)?.toInt() ?? 0;
                  final s = context.read<Session>();
                  return RefreshIndicator(
                    onRefresh: () async => _refresh(),
                    color: Mob.cyan600,
                    child: ListView.separated(
                      padding: const EdgeInsets.all(16),
                      itemCount: rows.length + 1,
                      separatorBuilder: (_, _) => const SizedBox(height: 10),
                      itemBuilder: (context, i) {
                        if (i == 0) {
                          return Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              Text('$unread unread', style: ss(11.5, c: Mob.gray400)),
                              if (unread > 0)
                                TextButton(
                                  onPressed: () async {
                                    await s.api.post('/notifications/read-all');
                                    _refresh();
                                  },
                                  child: Text('Mark all read',
                                      style: ss(12, w: FontWeight.w700, c: Mob.cyan700)),
                                ),
                            ],
                          );
                        }
                        final n = rows[i - 1];
                        final read = n['read'] == true;
                        final tone = switch ('${n['severity']}') {
                          'error' => ChipTone.danger,
                          'warning' => ChipTone.warning,
                          'success' => ChipTone.success,
                          _ => ChipTone.info,
                        };
                        return MobCard(
                          onTap: read
                              ? null
                              : () async {
                                  await s.api.post('/notifications/${n['_id']}/read');
                                  _refresh();
                                },
                          child: Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Padding(
                                padding: const EdgeInsets.only(top: 5),
                                child: Container(
                                  width: 8, height: 8,
                                  decoration: BoxDecoration(
                                    shape: BoxShape.circle,
                                    color: read ? Mob.gray200 : Mob.cyan600,
                                  ),
                                ),
                              ),
                              const SizedBox(width: 10),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text('${n['title']}',
                                        style: ss(13.5,
                                            w: read ? FontWeight.w600 : FontWeight.w700,
                                            c: Mob.gray900)),
                                    Text('${n['body']}',
                                        style: ss(12, c: Mob.gray500, h: 1.4)),
                                    Text(fmtDate(n['createdAt'], time: true),
                                        style: ss(11, c: Mob.gray400)),
                                  ],
                                ),
                              ),
                              const SizedBox(width: 8),
                              StatusChip('${n['severity']}'.toUpperCase(), tone),
                            ],
                          ),
                        );
                      },
                    ),
                  );
                },
              ),
            ],
          ),
        ),
      ],
    );
  }
}
