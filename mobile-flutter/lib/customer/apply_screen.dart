import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../session.dart';
import '../theme.dart';
import '../widgets.dart';
import 'track_screen.dart';

/// Dynamic application form rendered from the service definition:
/// form fields (text/number/date/select/checkbox/textarea), the subject
/// picker when the service is lodged against a vessel/company/seafarer, and
/// the required-documents manifest.
class ApplyScreen extends StatefulWidget {
  const ApplyScreen({super.key, required this.serviceCode});
  final String serviceCode;

  @override
  State<ApplyScreen> createState() => _ApplyScreenState();
}

class _ApplyScreenState extends State<ApplyScreen> {
  Map<String, dynamic>? _def;
  String? _error;
  bool _busy = false;

  final Map<String, dynamic> _form = {};
  Map<String, dynamic>? _subject;
  final Set<String> _docs = {};

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _error = null);
    try {
      final d = await context
          .read<Session>()
          .api
          .get('/services/definitions/${widget.serviceCode}');
      setState(() => _def = d as Map<String, dynamic>);
    } catch (e) {
      setState(() => _error = e.toString());
    }
  }

  List<Map<String, dynamic>> get _fields =>
      ((_def?['formFields'] as List?) ?? const []).cast<Map<String, dynamic>>();
  List<Map<String, dynamic>> get _reqDocs =>
      ((_def?['requiredDocuments'] as List?) ?? const []).cast<Map<String, dynamic>>();
  bool get _needsSubject => _def?['subjectRequired'] == true;
  String get _subjectKind => '${_def?['subjectKind'] ?? 'VESSEL'}';

  bool get _complete {
    if (_needsSubject && _subject == null) return false;
    for (final f in _fields) {
      if (f['required'] == true) {
        final v = _form[f['key']];
        if (v == null || '$v'.isEmpty) return false;
      }
    }
    for (final doc in _reqDocs) {
      if (doc['mandatory'] == true && !_docs.contains(doc['key'])) return false;
    }
    return true;
  }

  Future<void> _pickSubject() async {
    final chosen = await showModalBottomSheet<Map<String, dynamic>>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(18))),
      builder: (_) => _SubjectPicker(kind: _subjectKind),
    );
    if (chosen != null) setState(() => _subject = chosen);
  }

  Future<void> _submit() async {
    setState(() => _busy = true);
    try {
      final s = context.read<Session>();
      final body = {
        'serviceCode': widget.serviceCode,
        if (_subject != null) 'subjectRef': _subject!['_id'],
        'formData': _form,
        'documents': [
          for (final doc in _reqDocs)
            if (_docs.contains(doc['key']))
              {
                'key': doc['key'],
                'label': doc['label'],
                'fileName': '${doc['key']}.pdf',
              },
        ],
      };
      final created = await s.api.post('/services/requests', body: body)
          as Map<String, dynamic>;
      if (!mounted) return;
      await Navigator.of(context).pushReplacement(MaterialPageRoute(
        builder: (_) => TrackScreen(
          requestId: '${created['_id']}',
          justSubmitted: true,
        ),
      ));
    } catch (e) {
      _toast(e.toString(), error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _toast(String msg, {bool error = false}) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
      content: Text(msg),
      backgroundColor: error ? Mob.red600 : Mob.navy800,
    ));
  }

  @override
  Widget build(BuildContext context) {
    final def = _def;
    return Scaffold(
      body: Column(
        children: [
          NavyHeader(
            leadingBack: true,
            title: def == null ? 'Apply' : '${def['name']}',
            subtitle: def == null
                ? null
                : '${def['code']} · fee ${fmtMoney(((def['fee'] as Map?)?['amount'] as num?) ?? 0, '${(def['fee'] as Map?)?['currency'] ?? 'INR'}')} · SLA ${def['slaDays']} days',
          ),
          Expanded(
            child: _error != null
                ? ErrorRetry(_error!, onRetry: _load)
                : def == null
                    ? const Center(
                        child: CircularProgressIndicator(color: Mob.cyan600))
                    : ListView(
                        padding: const EdgeInsets.all(16),
                        children: [
                          if ('${def['description'] ?? ''}'.isNotEmpty) ...[
                            Text('${def['description']}',
                                style: ss(12.5, c: Mob.gray500, h: 1.45)),
                            const SizedBox(height: 12),
                          ],
                          if (def['autoApprovable'] == true) ...[
                            AiCard(
                              child: Text(
                                'Zero-touch eligible: if every check passes, agent A3 issues this service without an officer in the loop.',
                                style: ss(12.5, c: Mob.navy700, h: 1.4),
                              ),
                            ),
                            const SizedBox(height: 12),
                          ],
                          if (_needsSubject) ...[
                            SectionLabel(_subjectKind.toLowerCase()),
                            const SizedBox(height: 8),
                            MobCard(
                              onTap: _pickSubject,
                              borderColor: _subject == null ? const Color(0xFFF0DFB9) : const Color(0xFFCBE9D8),
                              child: Row(children: [
                                Expanded(
                                  child: _subject == null
                                      ? Text('Select the ${_subjectKind.toLowerCase()} this application is for',
                                          style: ss(13, c: Mob.gray500))
                                      : Column(
                                          crossAxisAlignment: CrossAxisAlignment.start,
                                          children: [
                                            Text('${_subject!['name']}',
                                                style: ss(13.5, w: FontWeight.w600, c: Mob.gray900)),
                                            Text('Pre-filled from the register',
                                                style: ss(11.5, w: FontWeight.w600, c: Mob.green600)),
                                          ],
                                        ),
                                ),
                                const Icon(Icons.chevron_right, color: Mob.gray400),
                              ]),
                            ),
                            const SizedBox(height: 14),
                          ],
                          if (_fields.isNotEmpty) ...[
                            const SectionLabel('Application details'),
                            const SizedBox(height: 8),
                            for (final f in _fields) ...[
                              _FieldEditor(
                                field: f,
                                value: _form[f['key']],
                                onChanged: (v) => setState(() => _form['${f['key']}'] = v),
                              ),
                              const SizedBox(height: 10),
                            ],
                          ],
                          if (_reqDocs.isNotEmpty) ...[
                            const SectionLabel('Documents'),
                            const SizedBox(height: 4),
                            Text('Attach from your device or let the platform fetch registry-held documents.',
                                style: ss(11.5, c: Mob.gray400)),
                            const SizedBox(height: 8),
                            for (final doc in _reqDocs) ...[
                              MobCard(
                                onTap: () => setState(() {
                                  _docs.contains(doc['key'])
                                      ? _docs.remove(doc['key'])
                                      : _docs.add('${doc['key']}');
                                }),
                                child: Row(children: [
                                  Icon(
                                    _docs.contains(doc['key'])
                                        ? Icons.check_circle
                                        : Icons.upload_file_outlined,
                                    size: 18,
                                    color: _docs.contains(doc['key'])
                                        ? Mob.green600
                                        : Mob.gray400,
                                  ),
                                  const SizedBox(width: 10),
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: [
                                        Text('${doc['label']}',
                                            style: ss(13, w: FontWeight.w600, c: Mob.gray900)),
                                        Text(
                                            doc['mandatory'] == true
                                                ? 'Required'
                                                : 'Optional',
                                            style: ss(11.5, c: Mob.gray500)),
                                      ],
                                    ),
                                  ),
                                  if (_docs.contains(doc['key']))
                                    const StatusChip('ATTACHED', ChipTone.success),
                                ]),
                              ),
                              const SizedBox(height: 8),
                            ],
                          ],
                          const SizedBox(height: 80),
                        ],
                      ),
          ),
        ],
      ),
      bottomNavigationBar: def == null
          ? null
          : Container(
              padding: EdgeInsets.fromLTRB(
                  16, 12, 16, 12 + MediaQuery.paddingOf(context).bottom),
              decoration: const BoxDecoration(
                color: Colors.white,
                border: Border(top: BorderSide(color: Mob.gray200)),
              ),
              child: PrimaryButton(
                'Submit application',
                busy: _busy,
                onPressed: _complete ? _submit : null,
              ),
            ),
    );
  }
}

class _FieldEditor extends StatelessWidget {
  const _FieldEditor({required this.field, this.value, required this.onChanged});
  final Map<String, dynamic> field;
  final dynamic value;
  final ValueChanged<dynamic> onChanged;

  @override
  Widget build(BuildContext context) {
    final type = '${field['type'] ?? 'text'}';
    final label = '${field['label']}${field['required'] == true ? ' *' : ''}';
    switch (type) {
      case 'select':
        final options = ((field['options'] as List?) ?? const []).cast<String>();
        return DropdownButtonFormField<String>(
          initialValue: value as String?,
          decoration: InputDecoration(labelText: label),
          items: [
            for (final o in options)
              DropdownMenuItem(value: o, child: Text(o, style: ss(13, c: Mob.gray900))),
          ],
          onChanged: onChanged,
        );
      case 'checkbox':
        return MobCard(
          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
          child: CheckboxListTile(
            value: value == true,
            dense: true,
            controlAffinity: ListTileControlAffinity.leading,
            activeColor: Mob.cyan600,
            title: Text(label, style: ss(13, c: Mob.gray900)),
            onChanged: (v) => onChanged(v ?? false),
          ),
        );
      case 'date':
        return TextFormField(
          initialValue: value as String?,
          decoration: InputDecoration(
            labelText: label,
            hintText: 'YYYY-MM-DD',
            suffixIcon: const Icon(Icons.calendar_today_outlined, size: 17),
          ),
          keyboardType: TextInputType.datetime,
          onChanged: onChanged,
        );
      case 'number':
        return TextFormField(
          initialValue: value?.toString(),
          decoration: InputDecoration(labelText: label),
          keyboardType: TextInputType.number,
          onChanged: (v) => onChanged(num.tryParse(v) ?? v),
        );
      case 'textarea':
        return TextFormField(
          initialValue: value as String?,
          decoration: InputDecoration(labelText: label),
          maxLines: 3,
          minLines: 2,
          onChanged: onChanged,
        );
      default:
        return TextFormField(
          initialValue: value as String?,
          decoration: InputDecoration(
              labelText: label,
              helperText: '${field['help'] ?? ''}'.isEmpty ? null : '${field['help']}',
              helperStyle: ss(11, c: Mob.gray400)),
          onChanged: onChanged,
        );
    }
  }
}

class _SubjectPicker extends StatefulWidget {
  const _SubjectPicker({required this.kind});
  final String kind;

  @override
  State<_SubjectPicker> createState() => _SubjectPickerState();
}

class _SubjectPickerState extends State<_SubjectPicker> {
  final _search = TextEditingController();
  Future<dynamic>? _future;

  String get _path => switch (widget.kind) {
        'COMPANY' => '/companies',
        'SEAFARER' => '/seafarers',
        _ => '/vessels',
      };

  @override
  void initState() {
    super.initState();
    _future = _load();
  }

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  Future<dynamic> _load() => context.read<Session>().api.get(_path, query: {
        if (_search.text.isNotEmpty) 'q': _search.text,
        'limit': '20',
      });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
      child: SizedBox(
        height: 480,
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(18, 18, 18, 8),
              child: TextField(
                controller: _search,
                autofocus: true,
                decoration: InputDecoration(
                  labelText: 'Search ${widget.kind.toLowerCase()}s',
                  suffixIcon: const Icon(Icons.search, size: 18),
                ),
                onChanged: (_) => setState(() { _future = _load(); }),
              ),
            ),
            Expanded(
              child: AsyncBody<dynamic>(
                future: _future!,
                builder: (context, d) {
                  final rows = (d as List).cast<Map<String, dynamic>>();
                  return ListView.builder(
                    itemCount: rows.length,
                    itemBuilder: (context, i) {
                      final r = rows[i];
                      final title = '${r['name'] ?? r['fullName'] ?? '—'}';
                      final sub = widget.kind == 'VESSEL'
                          ? 'IMO ${r['imo'] ?? '—'} · ${r['type'] ?? ''}'
                          : '${r['category'] ?? r['rank'] ?? ''}';
                      return ListTile(
                        title: Text(title, style: ss(13.5, w: FontWeight.w600, c: Mob.gray900)),
                        subtitle: Text(sub, style: ss(11.5, c: Mob.gray500)),
                        onTap: () => Navigator.pop(context, {'_id': r['_id'], 'name': title}),
                      );
                    },
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
  }
}
