import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../authority/authority_shell.dart';
import '../customer/customer_shell.dart';
import '../session.dart';
import '../theme.dart';
import '../widgets.dart';

/// Entry point: choose the app persona and sign in against the platform.
/// Demo identities are offered as quick-select chips; RBAC downstream is
/// entirely driven by the signed-in user's permissions.
class LauncherScreen extends StatefulWidget {
  const LauncherScreen({super.key});

  @override
  State<LauncherScreen> createState() => _LauncherScreenState();
}

class _DemoUser {
  const _DemoUser(this.label, this.email, this.hint);
  final String label;
  final String email;
  final String hint;
}

class _LauncherScreenState extends State<LauncherScreen> {
  static const _authorityUsers = [
    _DemoUser('Marine Surveyor', 'surveyor@maritime.example', 'Inspections end-to-end'),
    _DemoUser('Harbour Master', 'harbour@maritime.example', 'Operations view'),
    _DemoUser('NMC Duty Officer', 'nmc@maritime.example', 'Incidents & alerts'),
    _DemoUser('Super Admin', 'admin@maritime.example', 'Everything'),
  ];
  static const _customerUsers = [
    _DemoUser('Shipping Agent', 'agent@maritime.example', 'Apply, track, pay'),
    _DemoUser('Finance Officer', 'finance@maritime.example', 'Billing view'),
  ];

  final _email = TextEditingController();
  final _password = TextEditingController(text: 'Demo@2026');
  String _app = 'authority';
  bool _busy = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _email.text = _authorityUsers.first.email;
  }

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _signIn() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    final session = context.read<Session>();
    try {
      await session.login(_email.text.trim(), _password.text);
      if (!mounted) return;
      final target = _app == 'authority'
          ? const AuthorityShell()
          : const CustomerShell();
      await Navigator.of(context).pushReplacement(
        MaterialPageRoute(builder: (_) => target),
      );
    } catch (e) {
      setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final users = _app == 'authority' ? _authorityUsers : _customerUsers;
    return Scaffold(
      backgroundColor: Mob.gray100,
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text('MARITIME TRANSFORMATION PROGRAMME',
                      style: pop(11, c: Mob.cyan600).copyWith(letterSpacing: 1.2)),
                  const SizedBox(height: 4),
                  Text('Maritime Mobile', style: pop(24, w: FontWeight.w700)),
                  Text('Two apps over the Unified Maritime Platform — pick a side, sign in with a seeded identity.',
                      style: ss(13, c: Mob.gray500)),
                  const SizedBox(height: 18),
                  Row(
                    children: [
                      _AppChoice(
                        label: 'Marine Ops',
                        sub: 'Authority',
                        icon: Icons.anchor,
                        selected: _app == 'authority',
                        onTap: () => setState(() {
                          _app = 'authority';
                          _email.text = _authorityUsers.first.email;
                        }),
                      ),
                      const SizedBox(width: 12),
                      _AppChoice(
                        label: 'Maritime Services',
                        sub: 'Customer',
                        icon: Icons.directions_boat_outlined,
                        selected: _app == 'customer',
                        onTap: () => setState(() {
                          _app = 'customer';
                          _email.text = _customerUsers.first.email;
                        }),
                      ),
                    ],
                  ),
                  const SizedBox(height: 18),
                  MobCard(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Text('Sign in', style: pop(15)),
                        const SizedBox(height: 12),
                        Wrap(
                          spacing: 8,
                          runSpacing: 8,
                          children: [
                            for (final u in users)
                              Semantics(
                                button: true,
                                selected: _email.text == u.email,
                                child: Tooltip(
                                  message: u.hint,
                                  child: ChoiceChip(
                                    label: Text(u.label, style: ss(12, w: FontWeight.w600)),
                                    selected: _email.text == u.email,
                                    selectedColor: Mob.cyan50,
                                    onSelected: (_) => setState(() => _email.text = u.email),
                                  ),
                                ),
                              ),
                          ],
                        ),
                        const SizedBox(height: 12),
                        TextField(
                          controller: _email,
                          keyboardType: TextInputType.emailAddress,
                          autocorrect: false,
                          decoration: const InputDecoration(labelText: 'Email'),
                        ),
                        const SizedBox(height: 10),
                        TextField(
                          controller: _password,
                          obscureText: true,
                          decoration: const InputDecoration(labelText: 'Password'),
                          onSubmitted: (_) => _signIn(),
                        ),
                        if (_error != null) ...[
                          const SizedBox(height: 10),
                          Text(_error!, style: ss(12.5, c: Mob.red600, w: FontWeight.w600)),
                        ],
                        const SizedBox(height: 14),
                        PrimaryButton(
                          _app == 'authority' ? 'Enter Marine Ops' : 'Enter Maritime Services',
                          busy: _busy,
                          onPressed: _signIn,
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 14),
                  Text(
                    'All identities use the seeded demo password. Every screen is live against the platform API — RBAC, audit and agents included.',
                    textAlign: TextAlign.center,
                    style: ss(11.5, c: Mob.gray400),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _AppChoice extends StatelessWidget {
  const _AppChoice({
    required this.label,
    required this.sub,
    required this.icon,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final String sub;
  final IconData icon;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Semantics(
        button: true,
        selected: selected,
        label: '$label — $sub app',
        child: Material(
          color: selected ? Mob.navy800 : Colors.white,
          borderRadius: BorderRadius.circular(12),
          child: InkWell(
            borderRadius: BorderRadius.circular(12),
            onTap: onTap,
            child: Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                border: Border.all(color: selected ? Mob.navy800 : Mob.gray200),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Icon(icon, color: selected ? Mob.cyanBright : Mob.cyan700, size: 22),
                  const SizedBox(height: 10),
                  Text(label,
                      style: pop(14, c: selected ? Colors.white : Mob.navy800)),
                  Text(sub,
                      style: ss(11.5,
                          c: selected ? Mob.onNavyMuted : Mob.gray500)),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
