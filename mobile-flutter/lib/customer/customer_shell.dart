import 'package:flutter/material.dart';

import '../screens/more_screen.dart';
import '../theme.dart';
import 'billing_screen.dart';
import 'customer_home.dart';
import 'fleet_screen.dart';
import 'services_screen.dart';

/// Maritime Services (Customer): Home · Services · Fleet · Billing · More.
class CustomerShell extends StatefulWidget {
  const CustomerShell({super.key});

  @override
  State<CustomerShell> createState() => _CustomerShellState();
}

class _CustomerShellState extends State<CustomerShell> {
  int _index = 0;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: _LazyStack(index: _index, builders: [
        () => CustomerHome(onGoToTab: (i) => setState(() => _index = i)),
        () => const ServicesScreen(),
        () => const FleetScreen(),
        () => const BillingScreen(),
        () => const MoreScreen(appLabel: 'Maritime Services — Customer', statsScope: 'portcalls'),
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
          NavigationDestination(icon: Icon(Icons.grid_view_outlined), selectedIcon: Icon(Icons.grid_view, color: Mob.navy800), label: 'Services'),
          NavigationDestination(icon: Icon(Icons.directions_boat_outlined), selectedIcon: Icon(Icons.directions_boat, color: Mob.navy800), label: 'Fleet'),
          NavigationDestination(icon: Icon(Icons.account_balance_wallet_outlined), selectedIcon: Icon(Icons.account_balance_wallet, color: Mob.navy800), label: 'Billing'),
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
