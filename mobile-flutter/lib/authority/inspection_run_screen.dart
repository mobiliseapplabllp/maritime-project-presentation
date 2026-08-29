import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../session.dart';
import '../theme.dart';
import '../widgets.dart';

/// The inspection work screen: checklist capture (grouped by section), the
/// findings register, and close-out with a result — all live against the
/// platform's inspection lifecycle (PLANNED → IN_PROGRESS → CLOSED).
class InspectionRunScreen extends StatefulWidget {
  const InspectionRunScreen({super.key, required this.inspectionId});
  final String inspectionId;

  @override
  State<InspectionRunScreen> createState() => _InspectionRunScreenState();
}

class _InspectionRunScreenState extends State<InspectionRunScreen> {
  Map<String, dynamic>? _insp;
  Map<String, dynamic> _vesselInfo = const {};

  /// Mutation responses return `vessel` as a bare id — keep the populated map
  /// from the initial GET so the header never loses the vessel identity.
  Map<String, dynamic> _normalize(Map<String, dynamic> doc) {
    final v = doc['vessel'];
    if (v is Map) {
      _vesselInfo = v.cast<String, dynamic>();
      return doc;
    }
    return {...doc, 'vessel': _vesselInfo};
  }
  String? _error;
  bool _busy = false;
  bool _dirty = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _error = null);
    try {
      final d = await context.read<Session>().api.get('/inspections/${widget.inspectionId}');
      setState(() => _insp = _normalize(d as Map<String, dynamic>));
    } catch (e) {
      setState(() => _error = e.toString());
    }
  }

  List<Map<String, dynamic>> get _checklist =>
      ((_insp?['checklist'] as List?) ?? const []).cast<Map<String, dynamic>>();
  List<Map<String, dynamic>> get _findings =>
      ((_insp?['findings'] as List?) ?? const []).cast<Map<String, dynamic>>();
  String get _status => (_insp?['status'] as String?) ?? '';
  bool get _closed => _status == 'CLOSED';

  int get _answered =>
      _checklist.where((c) => (c['answer'] as String?)?.isNotEmpty == true).length;

  Future<void> _saveAnswers() async {
    final s = context.read<Session>();
    setState(() => _busy = true);
    try {
      final d = await s.api.put('/inspections/${widget.inspectionId}', body: {
        'checklist': _checklist
            .map((c) => {
                  'seq': c['seq'],
                  'text': c['text'],
                  'category': c['category'],
                  'answer': c['answer'] ?? '',
                  'note': c['note'] ?? '',
                })
            .toList(),
      });
      setState(() {
        _insp = _normalize(d as Map<String, dynamic>);
        _dirty = false;
      });
      _toast('Checklist saved — $_answered/${_checklist.length} answered');
    } catch (e) {
      _toast(e.toString(), error: true);
    } finally {
      setState(() => _busy = false);
    }
  }

  Future<void> _addFinding({String? presetCode, String? presetDesc}) async {
    final res = await showModalBottomSheet<Map<String, String>>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(18))),
      builder: (_) => _FindingSheet(presetCode: presetCode, presetDesc: presetDesc),
    );
    if (res == null || !mounted) return;
    setState(() => _busy = true);
    try {
      final d = await context.read<Session>().api.post(
          '/inspections/${widget.inspectionId}/findings',
          body: {
            'deficiencyCode': res['code'],
            'description': res['description'],
            'actionCode': res['action'] ?? '',
          });
      setState(() => _insp = _normalize(d as Map<String, dynamic>));
      _toast('Finding recorded — audit entry written');
    } catch (e) {
      _toast(e.toString(), error: true);
    } finally {
      setState(() => _busy = false);
    }
  }

  Future<void> _close() async {
    if (_dirty) await _saveAnswers();
    if (!mounted) return;
    final res = await showModalBottomSheet<Map<String, String>>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(18))),
      builder: (_) => _CloseSheet(openFindings: _findings.where((f) => f['status'] == 'OPEN').length),
    );
    if (res == null || !mounted) return;
    setState(() => _busy = true);
    try {
      final d = await context.read<Session>().api.post(
          '/inspections/${widget.inspectionId}/close',
          body: {'result': res['result'], 'remarks': res['remarks'] ?? ''});
      setState(() => _insp = _normalize(d as Map<String, dynamic>));
      if (mounted) {
        await showDialog<void>(
          context: context,
          builder: (_) => _ClosedDialog(inspection: _insp!),
        );
      }
    } catch (e) {
      _toast(e.toString(), error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _toast(String msg, {bool error = false}) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
      content: Text(msg),
      backgroundColor: error ? Mob.red600 : Mob.navy800,
    ));
  }

  @override
  Widget build(BuildContext context) {
    final s = context.watch<Session>();
    final canEdit = s.can('inspections.edit') && !_closed;
    final vessel = (_insp?['vessel'] as Map?) ?? const {};
    final sections = <String, List<Map<String, dynamic>>>{};
    for (final item in _checklist) {
      sections.putIfAbsent('${item['category'] ?? 'General'}', () => []).add(item);
    }
    return Scaffold(
      body: Column(
        children: [
          NavyHeader(
            leadingBack: true,
            title: _insp == null
                ? 'Inspection'
                : '${vessel['name'] ?? ''} · ${_insp!['type']}',
            subtitle: _insp == null
                ? null
                : '${_insp!['number']} · ${_status.replaceAll('_', ' ')}'
                  '${_closed ? ' · ${_insp!['result']}' : ''}',
            bottom: _insp == null
                ? null
                : Column(children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text('Progress', style: ss(11, c: Mob.onNavyMuted)),
                        Text('$_answered / ${_checklist.length} answered',
                            style: ss(11, c: Mob.onNavyMuted)),
                      ],
                    ),
                    const SizedBox(height: 5),
                    ClipRRect(
                      borderRadius: BorderRadius.circular(3),
                      child: LinearProgressIndicator(
                        value: _checklist.isEmpty ? 0 : _answered / _checklist.length,
                        minHeight: 5,
                        backgroundColor: Colors.white.withValues(alpha: .15),
                        color: Mob.cyan600,
                      ),
                    ),
                  ]),
          ),
          Expanded(
            child: _error != null
                ? ErrorRetry(_error!, onRetry: _load)
                : _insp == null
                    ? const Center(child: CircularProgressIndicator(color: Mob.cyan600))
                    : ListView(
                        padding: const EdgeInsets.all(16),
                        children: [
                          if (_status == 'PLANNED' && canEdit)
                            Padding(
                              padding: const EdgeInsets.only(bottom: 10),
                              child: AiCard(
                                child: Text(
                                  'Answering any item starts the inspection and stamps the start time on the record.',
                                  style: ss(12.5, c: Mob.navy700, h: 1.4),
                                ),
                              ),
                            ),
                          for (final entry in sections.entries) ...[
                            SectionLabel(entry.key),
                            const SizedBox(height: 8),
                            for (final item in entry.value) ...[
                              _ChecklistTile(
                                item: item,
                                enabled: canEdit,
                                onChanged: (answer) => setState(() {
                                  item['answer'] = answer;
                                  _dirty = true;
                                }),
                                onNote: (note) => setState(() {
                                  item['note'] = note;
                                  _dirty = true;
                                }),
                                onRaiseFinding: canEdit
                                    ? () => _addFinding(
                                          presetCode: '',
                                          presetDesc:
                                              'Item ${item['seq']}: ${item['text']} — ',
                                        )
                                    : null,
                              ),
                              const SizedBox(height: 8),
                            ],
                            const SizedBox(height: 8),
                          ],
                          Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              const SectionLabel('Findings'),
                              if (canEdit)
                                TextButton.icon(
                                  onPressed: _busy ? null : () => _addFinding(),
                                  icon: const Icon(Icons.add, size: 16, color: Mob.cyan700),
                                  label: Text('Add finding',
                                      style: ss(12.5, w: FontWeight.w700, c: Mob.cyan700)),
                                ),
                            ],
                          ),
                          if (_findings.isEmpty)
                            MobCard(
                                child: Text('No findings recorded.',
                                    style: ss(12.5, c: Mob.gray500))),
                          for (final f in _findings) ...[
                            MobCard(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Row(
                                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                    children: [
                                      StatusChip('DEFICIENCY ${f['deficiencyCode']}', ChipTone.danger),
                                      StatusChip('${f['status']}', StatusChip.forStatus('${f['status']}' == 'OPEN' ? 'MEDIUM' : 'CLOSED')),
                                    ],
                                  ),
                                  const SizedBox(height: 7),
                                  Text('${f['description']}', style: ss(13, c: Mob.gray900, h: 1.5)),
                                  if ((f['actionCode'] as String?)?.isNotEmpty == true)
                                    Padding(
                                      padding: const EdgeInsets.only(top: 6),
                                      child: Text('Action ${f['actionCode']}',
                                          style: ss(11.5, c: Mob.gray500)),
                                    ),
                                ],
                              ),
                            ),
                            const SizedBox(height: 8),
                          ],
                          const SizedBox(height: 90),
                        ],
                      ),
          ),
        ],
      ),
      bottomNavigationBar: _insp == null || !canEdit
          ? null
          : Container(
              padding: EdgeInsets.fromLTRB(
                  16, 12, 16, 12 + MediaQuery.paddingOf(context).bottom),
              decoration: const BoxDecoration(
                color: Colors.white,
                border: Border(top: BorderSide(color: Mob.gray200)),
              ),
              child: Row(children: [
                if (_dirty)
                  Expanded(
                    child: OutlineButtonMob('Save answers', onPressed: _busy ? null : _saveAnswers),
                  ),
                if (_dirty) const SizedBox(width: 8),
                Expanded(
                  child: PrimaryButton(
                    s.can('inspections.close') ? 'Close & sign report' : 'Save progress',
                    icon: s.can('inspections.close') ? Icons.draw_outlined : Icons.save_outlined,
                    busy: _busy,
                    onPressed: s.can('inspections.close')
                        ? (_answered == _checklist.length && _checklist.isNotEmpty ? _close : null)
                        : (_dirty ? _saveAnswers : null),
                  ),
                ),
              ]),
            ),
    );
  }
}

class _ChecklistTile extends StatelessWidget {
  const _ChecklistTile({
    required this.item,
    required this.enabled,
    required this.onChanged,
    required this.onNote,
    this.onRaiseFinding,
  });

  final Map<String, dynamic> item;
  final bool enabled;
  final ValueChanged<String> onChanged;
  final ValueChanged<String> onNote;
  final VoidCallback? onRaiseFinding;

  @override
  Widget build(BuildContext context) {
    final answer = (item['answer'] as String?) ?? '';
    return MobCard(
      padding: const EdgeInsets.fromLTRB(14, 13, 14, 13),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text('${item['seq']} — ${item['text']}',
              style: ss(13.5, w: FontWeight.w600, c: Mob.gray900, h: 1.4)),
          const SizedBox(height: 10),
          Row(children: [
            _seg('YES', answer == 'YES', Mob.green50, Mob.green600,
                enabled ? () => onChanged('YES') : null),
            const SizedBox(width: 6),
            _seg('NO', answer == 'NO', Mob.red50, Mob.red600,
                enabled ? () => onChanged('NO') : null),
            const SizedBox(width: 6),
            _seg('N/A', answer == 'NA', Mob.gray100, Mob.gray500,
                enabled ? () => onChanged('NA') : null),
          ]),
          if (answer == 'NO') ...[
            const SizedBox(height: 10),
            TextFormField(
              initialValue: (item['note'] as String?) ?? '',
              enabled: enabled,
              maxLines: 2,
              minLines: 1,
              style: ss(12.5, c: Mob.gray700),
              decoration: const InputDecoration(
                  hintText: 'Evidence note — what was observed'),
              onChanged: onNote,
            ),
            if (onRaiseFinding != null)
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: Material(
                  color: Mob.amber50,
                  borderRadius: BorderRadius.circular(7),
                  child: InkWell(
                    borderRadius: BorderRadius.circular(7),
                    onTap: onRaiseFinding,
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 9),
                      child: Row(children: [
                        const Icon(Icons.auto_awesome, size: 13, color: Mob.amber600),
                        const SizedBox(width: 7),
                        Expanded(
                          child: Text('Raise a deficiency finding from this item',
                              style: ss(11.5, w: FontWeight.w600, c: Mob.amber600)),
                        ),
                      ]),
                    ),
                  ),
                ),
              ),
          ],
        ],
      ),
    );
  }

  Widget _seg(String label, bool selected, Color bg, Color fg, VoidCallback? onTap) {
    return Expanded(
      child: Semantics(
        button: true,
        selected: selected,
        child: Material(
          color: selected ? bg : Colors.white,
          borderRadius: BorderRadius.circular(7),
          child: InkWell(
            borderRadius: BorderRadius.circular(7),
            onTap: onTap,
            child: Container(
              height: 40,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                border: Border.all(
                    color: selected ? fg : Mob.gray200, width: 1.5),
                borderRadius: BorderRadius.circular(7),
              ),
              child: Text(label,
                  style: ss(12.5, w: FontWeight.w700,
                      c: selected ? fg : Mob.gray500)),
            ),
          ),
        ),
      ),
    );
  }
}

class _FindingSheet extends StatefulWidget {
  const _FindingSheet({this.presetCode, this.presetDesc});
  final String? presetCode;
  final String? presetDesc;

  @override
  State<_FindingSheet> createState() => _FindingSheetState();
}

class _FindingSheetState extends State<_FindingSheet> {
  late final _code = TextEditingController(text: widget.presetCode ?? '');
  late final _desc = TextEditingController(text: widget.presetDesc ?? '');
  final _action = TextEditingController();

  @override
  void dispose() {
    _code.dispose();
    _desc.dispose();
    _action.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.fromLTRB(18, 18, 18, 18 + MediaQuery.viewInsetsOf(context).bottom),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text('Record a deficiency', style: pop(16)),
          const SizedBox(height: 4),
          Text('Written to the findings register with a full audit entry.',
              style: ss(12, c: Mob.gray500)),
          const SizedBox(height: 14),
          TextField(
            controller: _code,
            decoration: const InputDecoration(labelText: 'Deficiency code (e.g. 07108)'),
          ),
          const SizedBox(height: 10),
          TextField(
            controller: _desc,
            maxLines: 3,
            minLines: 2,
            decoration: const InputDecoration(labelText: 'Description'),
          ),
          const SizedBox(height: 10),
          TextField(
            controller: _action,
            decoration: const InputDecoration(
                labelText: 'Action code (e.g. 17 — rectify before departure)'),
          ),
          const SizedBox(height: 16),
          PrimaryButton('Record finding', onPressed: () {
            if (_code.text.trim().isEmpty || _desc.text.trim().isEmpty) return;
            Navigator.pop(context, {
              'code': _code.text.trim(),
              'description': _desc.text.trim(),
              'action': _action.text.trim(),
            });
          }),
        ],
      ),
    );
  }
}

class _CloseSheet extends StatefulWidget {
  const _CloseSheet({required this.openFindings});
  final int openFindings;

  @override
  State<_CloseSheet> createState() => _CloseSheetState();
}

class _CloseSheetState extends State<_CloseSheet> {
  String? _result;
  final _remarks = TextEditingController();

  @override
  void dispose() {
    _remarks.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final options = [
      ('SATISFACTORY', 'No open deficiencies', ChipTone.success),
      ('DEFICIENCIES', 'Deficiencies recorded, vessel may sail', ChipTone.warning),
      ('DETAINED', 'Vessel detained until rectification', ChipTone.danger),
    ];
    return Padding(
      padding: EdgeInsets.fromLTRB(18, 18, 18, 18 + MediaQuery.viewInsetsOf(context).bottom),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text('Close & sign the report', style: pop(16)),
          const SizedBox(height: 4),
          Text(
            widget.openFindings > 0
                ? '${widget.openFindings} open finding(s) on the record. A satisfactory close will be refused by the platform until they are closed.'
                : 'The score is computed from the weighted checklist at close.',
            style: ss(12, c: Mob.gray500, h: 1.4),
          ),
          const SizedBox(height: 14),
          for (final (value, hint, tone) in options)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Semantics(
                button: true,
                selected: _result == value,
                child: MobCard(
                  onTap: () => setState(() => _result = value),
                  borderColor: _result == value ? Mob.cyan600 : null,
                  child: Row(children: [
                    Expanded(
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Text(value, style: ss(13.5, w: FontWeight.w700, c: Mob.gray900)),
                        Text(hint, style: ss(11.5, c: Mob.gray500)),
                      ]),
                    ),
                    if (_result == value) StatusChip('SELECTED', tone),
                  ]),
                ),
              ),
            ),
          const SizedBox(height: 4),
          TextField(
            controller: _remarks,
            maxLines: 2,
            decoration: const InputDecoration(labelText: 'Remarks (optional)'),
          ),
          const SizedBox(height: 16),
          PrimaryButton(
            'Sign & issue report',
            icon: Icons.draw_outlined,
            onPressed: _result == null
                ? null
                : () => Navigator.pop(context, {
                      'result': _result!,
                      'remarks': _remarks.text.trim(),
                    }),
          ),
          const SizedBox(height: 6),
          Text('Signed under your identity · immutable audit entry · master notified.',
              textAlign: TextAlign.center, style: ss(10.5, c: Mob.gray400)),
        ],
      ),
    );
  }
}

class _ClosedDialog extends StatelessWidget {
  const _ClosedDialog({required this.inspection});
  final Map<String, dynamic> inspection;

  @override
  Widget build(BuildContext context) {
    final score = inspection['scorePct'];
    final detained = inspection['detention'] == true;
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
              child: Icon(detained ? Icons.gavel : Icons.check,
                  size: 32, color: detained ? Mob.red600 : Mob.green600),
            ),
            const SizedBox(height: 14),
            Text('Report issued', style: pop(20, w: FontWeight.w700)),
            const SizedBox(height: 8),
            Text(
              '${inspection['number']} closed as ${inspection['result']}'
              '${score != null ? ' · compliance ${(score as num).toStringAsFixed(0)}%' : ''}.\n'
              '${detained ? 'Detention notification raised to all inspection users.' : 'Findings tracked to close-out.'}',
              textAlign: TextAlign.center,
              style: ss(13, c: Mob.gray500, h: 1.5),
            ),
            const SizedBox(height: 16),
            PrimaryButton('Done', onPressed: () {
              Navigator.of(context).pop();
              Navigator.of(context).pop();
            }),
          ],
        ),
      ),
    );
  }
}
