import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../session.dart';
import '../theme.dart';
import '../widgets.dart';

/// Billing: issued invoices payable in-app; history of paid invoices.
/// Payment posts through the platform's invoice lifecycle and is audited.
class BillingScreen extends StatefulWidget {
  const BillingScreen({super.key});

  @override
  State<BillingScreen> createState() => _BillingScreenState();
}

class _BillingScreenState extends State<BillingScreen> {
  String _status = 'ISSUED';
  Future<dynamic>? _future;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _future ??= _load();
  }

  Future<dynamic> _load() => context.read<Session>().api.get('/invoices', query: {
        'status': _status,
        'limit': '30',
        'sort': _status == 'PAID' ? '-paidAt' : '-issuedAt',
      });

  void _refresh() => setState(() { _future = _load(); });

  @override
  Widget build(BuildContext context) {
    final s = context.watch<Session>();
    if (!s.can('invoices.view')) {
      return Column(children: const [
        NavyHeader(title: 'Billing'),
        Expanded(
          child: EmptyState('Not available for this role',
              'Requires the invoices.view permission.', icon: Icons.lock_outline),
        ),
      ]);
    }
    return Column(
      children: [
        NavyHeader(
          title: 'Billing',
          subtitle: 'Computed invoicing from the published rate book',
          bottom: Row(children: [
            for (final (label, value) in const [('Payable', 'ISSUED'), ('Paid', 'PAID')]) ...[
              Expanded(
                child: Semantics(
                  button: true,
                  selected: _status == value,
                  child: Material(
                    color: _status == value
                        ? Mob.cyan600
                        : Colors.white.withValues(alpha: .12),
                    borderRadius: BorderRadius.circular(7),
                    child: InkWell(
                      borderRadius: BorderRadius.circular(7),
                      onTap: () {
                        _status = value;
                        _refresh();
                      },
                      child: Container(
                        height: 34,
                        alignment: Alignment.center,
                        child: Text(label,
                            style: ss(12, w: FontWeight.w700, c: Colors.white)),
                      ),
                    ),
                  ),
                ),
              ),
              if (value == 'ISSUED') const SizedBox(width: 8),
            ],
          ]),
        ),
        Expanded(
          child: AsyncBody<dynamic>(
            future: _future!,
            onRetry: _refresh,
            isEmpty: (d) => (d as List).isEmpty,
            emptyTitle: 'Nothing here',
            emptyBody: 'No invoices in this state.',
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
                    final inv = rows[i];
                    return MobCard(
                      onTap: () => Navigator.of(context)
                          .push(MaterialPageRoute(
                            builder: (_) => InvoiceScreen(invoiceId: '${inv['_id']}'),
                          ))
                          .then((_) => _refresh()),
                      child: Row(children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text('${inv['number']}',
                                  style: ss(13.5, w: FontWeight.w600, c: Mob.gray900)),
                              Text(
                                  '${(inv['vessel'] as Map?)?['name'] ?? (inv['billTo'] as Map?)?['name'] ?? ''}'
                                  ' · ${_status == 'PAID' ? 'paid ${fmtDate(inv['paidAt'])}' : 'issued ${fmtDate(inv['issuedAt'])}'}',
                                  style: ss(11.5, c: Mob.gray500)),
                            ],
                          ),
                        ),
                        Text(fmtMoney(inv['total'] as num?, '${inv['currency'] ?? 'INR'}'),
                            style: pop(14, w: FontWeight.w700)),
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

/// Invoice detail with line items and in-app payment.
class InvoiceScreen extends StatefulWidget {
  const InvoiceScreen({super.key, required this.invoiceId});
  final String invoiceId;

  @override
  State<InvoiceScreen> createState() => _InvoiceScreenState();
}

class _InvoiceScreenState extends State<InvoiceScreen> {
  late Future<dynamic> _future;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _future = _load();
  }

  Future<dynamic> _load() =>
      context.read<Session>().api.get('/invoices/${widget.invoiceId}');

  Future<void> _pay(Map<String, dynamic> inv) async {
    final confirmed = await showModalBottomSheet<bool>(
      context: context,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(18))),
      builder: (_) => _PaySheet(invoice: inv),
    );
    if (confirmed != true || !mounted) return;
    setState(() => _busy = true);
    try {
      final ref = 'MOB-${DateTime.now().millisecondsSinceEpoch}';
      await context.read<Session>().api.post(
          '/invoices/${widget.invoiceId}/pay',
          body: {'paymentRef': ref});
      setState(() { _future = _load(); });
      if (mounted) {
        await showDialog<void>(
            context: context, builder: (_) => _ReceiptDialog(reference: ref, invoice: inv));
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
            content: Text('Payment failed — you have not been charged. $e'),
            backgroundColor: Mob.red600));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = context.watch<Session>();
    return Scaffold(
      body: Column(
        children: [
          const NavyHeader(leadingBack: true, title: 'Invoice'),
          Expanded(
            child: AsyncBody<dynamic>(
              future: _future,
              onRetry: () => setState(() { _future = _load(); }),
              builder: (context, d) {
                final inv = d as Map<String, dynamic>;
                final lines = ((inv['lines'] as List?) ?? const [])
                    .cast<Map<String, dynamic>>();
                final cur = '${inv['currency'] ?? 'INR'}';
                final payable = inv['status'] == 'ISSUED' && s.can('invoices.pay');
                return ListView(
                  padding: const EdgeInsets.all(16),
                  children: [
                    MobCard(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(children: [
                            Expanded(child: Text('${inv['number']}', style: pop(15))),
                            StatusChip('${inv['status']}', StatusChip.forStatus('${inv['status']}')),
                          ]),
                          const SizedBox(height: 4),
                          Text(
                              '${(inv['billTo'] as Map?)?['name'] ?? ''} · ${(inv['vessel'] as Map?)?['name'] ?? ''}'
                              '${inv['status'] == 'PAID' ? ' · paid ${fmtDate(inv['paidAt'], time: true)} · ref ${inv['paymentRef']}' : ''}',
                              style: ss(12, c: Mob.gray500)),
                        ],
                      ),
                    ),
                    const SizedBox(height: 10),
                    MobCard(
                      padding: const EdgeInsets.fromLTRB(15, 4, 15, 4),
                      child: Column(children: [
                        for (final l in lines)
                          Container(
                            padding: const EdgeInsets.symmetric(vertical: 10),
                            decoration: const BoxDecoration(
                              border: Border(bottom: BorderSide(color: Mob.gray100)),
                            ),
                            child: Row(children: [
                              Expanded(
                                child: Text(
                                    '${l['description']}${(l['qty'] as num? ?? 1) != 1 ? ' × ${l['qty']}' : ''}',
                                    style: ss(13, c: Mob.gray500)),
                              ),
                              Text(fmtMoney(l['amount'] as num?, cur),
                                  style: ss(13, w: FontWeight.w600, c: Mob.gray900)),
                            ]),
                          ),
                        Padding(
                          padding: const EdgeInsets.symmetric(vertical: 10),
                          child: Row(children: [
                            Expanded(child: Text('Tax (${inv['gstRate']}%)', style: ss(13, c: Mob.gray500))),
                            Text(fmtMoney(inv['gstAmount'] as num?, cur),
                                style: ss(13, w: FontWeight.w600, c: Mob.gray900)),
                          ]),
                        ),
                        Container(
                          padding: const EdgeInsets.symmetric(vertical: 11),
                          decoration: const BoxDecoration(
                            border: Border(top: BorderSide(color: Mob.gray100)),
                          ),
                          child: Row(children: [
                            Expanded(
                                child: Text('Total',
                                    style: ss(14.5, w: FontWeight.w700, c: Mob.navy800))),
                            Text(fmtMoney(inv['total'] as num?, cur),
                                style: ss(14.5, w: FontWeight.w700, c: Mob.navy800)),
                          ]),
                        ),
                      ]),
                    ),
                    const SizedBox(height: 14),
                    if (payable)
                      PrimaryButton(
                        'Pay ${fmtMoney(inv['total'] as num?, cur)}',
                        busy: _busy,
                        onPressed: () => _pay(inv),
                      )
                    else if (inv['status'] == 'ISSUED')
                      MobCard(
                        child: Text(
                            'This account cannot settle invoices. Payment requires the invoices.pay permission.',
                            style: ss(12.5, c: Mob.gray500)),
                      ),
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

class _PaySheet extends StatelessWidget {
  const _PaySheet({required this.invoice});
  final Map<String, dynamic> invoice;

  @override
  Widget build(BuildContext context) {
    final cur = '${invoice['currency'] ?? 'INR'}';
    return Padding(
      padding: const EdgeInsets.all(18),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text('Review & pay', style: pop(16)),
          const SizedBox(height: 4),
          Text('${invoice['number']} · ${(invoice['billTo'] as Map?)?['name'] ?? ''}',
              style: ss(12, c: Mob.gray500)),
          const SizedBox(height: 14),
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              border: Border.all(color: Mob.cyan600, width: 1.5),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Row(children: [
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text('National payment gateway', style: ss(13.5, w: FontWeight.w700, c: Mob.gray900)),
                  Text('Settlement posts to the register instantly',
                      style: ss(11, c: Mob.gray500)),
                ]),
              ),
              const Icon(Icons.check_circle, color: Mob.cyan600, size: 20),
            ]),
          ),
          const SizedBox(height: 16),
          PrimaryButton(
            'Pay ${fmtMoney(invoice['total'] as num?, cur)}',
            onPressed: () => Navigator.pop(context, true),
          ),
          const SizedBox(height: 6),
          Text('You will not be charged if the payment does not complete.',
              textAlign: TextAlign.center, style: ss(10.5, c: Mob.gray400)),
        ],
      ),
    );
  }
}

class _ReceiptDialog extends StatelessWidget {
  const _ReceiptDialog({required this.reference, required this.invoice});
  final String reference;
  final Map<String, dynamic> invoice;

  @override
  Widget build(BuildContext context) {
    final cur = '${invoice['currency'] ?? 'INR'}';
    return Dialog(
      backgroundColor: Colors.white,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 70, height: 70,
              decoration: const BoxDecoration(color: Mob.green50, shape: BoxShape.circle),
              child: const Icon(Icons.check, size: 32, color: Mob.green600),
            ),
            const SizedBox(height: 14),
            Text('Payment successful', style: pop(20, w: FontWeight.w700)),
            const SizedBox(height: 8),
            Text(
              '${fmtMoney(invoice['total'] as num?, cur)} · ${invoice['number']}\nReference $reference · receipt posted to the register.',
              textAlign: TextAlign.center,
              style: ss(13, c: Mob.gray500, h: 1.5),
            ),
            const SizedBox(height: 16),
            PrimaryButton('Done', onPressed: () => Navigator.of(context).pop()),
          ],
        ),
      ),
    );
  }
}
