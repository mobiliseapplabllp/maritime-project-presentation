import 'package:flutter/material.dart';

import '../screens/more_screen.dart';
import '../theme.dart';
import 'alerts_screen.dart';
import 'authority_home.dart';
import 'inspections_screen.dart';
import 'targets_screen.dart';

/// Marine Ops (Authority): Home · Targets · Inspect · Alerts · More.
class AuthorityShell extends StatefulWidget {
  const AuthorityShell({super.key});

  @override
  State<AuthorityShell> createState() => _AuthorityShellState();
}

class _AuthorityShellState extends State<AuthorityShell> {
  int _index = 0;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: _LazyStack(index: _index, builders: [
        () => AuthorityHome(onGoToTab: (i) => setState(() => _index = i)),
        () => const TargetsScreen(),
        () => const InspectionsScreen(),
        () => const AlertsScreen(),
        () => const MoreScreen(appLabel: 'Marine Ops — Authority'),
      ]),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _index,
        onDestinationSelected: (i) => setState(() => _index = i),
        backgroundColor: Colors.white,
        indicatorColor: Mob.navy50,
        height: 64,
        labelBehavior: NavigationDestinationLabelBehavior.alwaysShow,
        destinations: const [
          NavigationDestination(icon: Icon(Icons.home_outlined), selectedIcon: Icon(Icons.home, color: Mob.navy800), label: 'Home'),
          NavigationDestination(icon: Icon(Icons.gps_fixed_outlined), selectedIcon: Icon(Icons.gps_fixed, color: Mob.navy800), label: 'Targets'),
          NavigationDestination(icon: Icon(Icons.checklist_outlined), selectedIcon: Icon(Icons.checklist, color: Mob.navy800), label: 'Inspect'),
          NavigationDestination(icon: Icon(Icons.notifications_outlined), selectedIcon: Icon(Icons.notifications, color: Mob.navy800), label: 'Alerts'),
          NavigationDestination(icon: Icon(Icons.more_horiz_outlined), selectedIcon: Icon(Icons.more_horiz, color: Mob.navy800), label: 'More'),
        ],
      ),
    );
  }
}

/// Lazy tab stack: a tab's screen is built (and starts fetching) only when
/// first visited; after that its state is preserved offstage.
class _LazyStack extends StatefulWidget {
  const _LazyStack({required this.index, required this.builders});
  final int index;
  final List<Widget Function()> builders;

  @override
  State<_LazyStack> createState() => _LazyStackState();
}

class _LazyStackState extends State<_LazyStack> {
  final Map<int, Widget> _built = {};

  @override
  Widget build(BuildContext context) {
    _built.putIfAbsent(widget.index, () => widget.builders[widget.index]());
    return IndexedStack(
      index: widget.index,
      children: [
        for (var i = 0; i < widget.builders.length; i++)
          _built[i] ?? const SizedBox.shrink(),
      ],
    );
  }
}
