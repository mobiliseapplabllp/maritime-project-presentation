import 'package:flutter/material.dart';

import 'theme.dart';

/// Navy header band used at the top of every screen.
class NavyHeader extends StatelessWidget {
  const NavyHeader({
    super.key,
    this.title,
    this.subtitle,
    this.leadingBack = false,
    this.onBack,
    this.trailing,
    this.eyebrow,
    this.bottom,
  });

  final String? eyebrow;
  final String? title;
  final String? subtitle;
  final bool leadingBack;
  final VoidCallback? onBack;
  final Widget? trailing;
  final Widget? bottom;

  @override
  Widget build(BuildContext context) {
    return Container(
      color: Mob.navy800,
      padding: EdgeInsets.fromLTRB(
          leadingBack ? 8 : 18, MediaQuery.paddingOf(context).top + 10, 18, 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              if (leadingBack)
                IconButton(
                  onPressed: onBack ?? () => Navigator.of(context).maybePop(),
                  icon: const Icon(Icons.chevron_left, color: Colors.white, size: 26),
                  tooltip: 'Back',
                ),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if (eyebrow != null)
                      Text(eyebrow!, style: ss(12, c: Mob.onNavyMuted)),
                    if (title != null)
                      Text(title!, style: pop(18, c: Colors.white)),
                    if (subtitle != null)
                      Padding(
                        padding: const EdgeInsets.only(top: 1),
                        child: Text(subtitle!, style: ss(11.5, c: Mob.onNavyMuted)),
                      ),
                  ],
                ),
              ),
              ?trailing,
            ],
          ),
          if (bottom != null) Padding(padding: const EdgeInsets.only(top: 12), child: bottom!),
        ],
      ),
    );
  }
}

class StatTile extends StatelessWidget {
  const StatTile(this.value, this.label, {super.key, this.valueColor});
  final String value;
  final String label;
  final Color? valueColor;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        decoration: BoxDecoration(
          color: Colors.white.withValues(alpha: .10),
          borderRadius: BorderRadius.circular(8),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(value, style: pop(20, w: FontWeight.w700, c: valueColor ?? Colors.white)),
            Text(label, style: ss(11, c: Mob.onNavyMuted)),
          ],
        ),
      ),
    );
  }
}

class MobCard extends StatelessWidget {
  const MobCard(
      {super.key,
      required this.child,
      this.onTap,
      this.borderColor,
      this.padding,
      this.semanticLabel});
  final Widget child;
  final VoidCallback? onTap;
  final Color? borderColor;
  final EdgeInsets? padding;
  final String? semanticLabel;

  @override
  Widget build(BuildContext context) {
    final card = Container(
      width: double.infinity,
      padding: padding ?? const EdgeInsets.fromLTRB(15, 13, 15, 13),
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border.all(color: borderColor ?? Mob.gray200),
        borderRadius: BorderRadius.circular(10),
      ),
      child: child,
    );
    if (onTap == null) return card;
    return Semantics(
      button: true,
      label: semanticLabel,
      child: Material(
        color: Colors.transparent,
        child: InkWell(borderRadius: BorderRadius.circular(10), onTap: onTap, child: card),
      ),
    );
  }
}

class SectionLabel extends StatelessWidget {
  const SectionLabel(this.text, {super.key});
  final String text;
  @override
  Widget build(BuildContext context) =>
      Text(text.toUpperCase(), style: pop(13, c: Mob.navy800));
}

/// Small status chip. Tone decides the palette.
enum ChipTone { info, ai, success, warning, danger, neutral }

class StatusChip extends StatelessWidget {
  const StatusChip(this.text, this.tone, {super.key});
  final String text;
  final ChipTone tone;

  static ChipTone forStatus(String s) => switch (s.toUpperCase()) {
        'PLANNED' || 'DRAFT' || 'SUBMITTED' || 'ANNOUNCED' => ChipTone.info,
        'IN_PROGRESS' || 'UNDER_ASSESSMENT' || 'ISSUED' || 'IN REVIEW' => ChipTone.ai,
        'CLOSED' || 'PAID' || 'APPROVED' || 'SATISFACTORY' || 'VALID' || 'RESOLVED' => ChipTone.success,
        'INFO_REQUESTED' || 'EXPIRING' || 'DEFICIENCIES' || 'MEDIUM' || 'SUSPENDED' => ChipTone.warning,
        'DETAINED' || 'REJECTED' || 'EXPIRED' || 'REVOKED' || 'HIGH' || 'CRITICAL' || 'CANCELLED' => ChipTone.danger,
        _ => ChipTone.neutral,
      };

  @override
  Widget build(BuildContext context) {
    final (bg, fg) = switch (tone) {
      ChipTone.info => (Mob.navy50, Mob.navy700),
      ChipTone.ai => (Mob.cyan50, Mob.cyan700),
      ChipTone.success => (Mob.green50, Mob.greenOnTint),
      ChipTone.warning => (Mob.amber50, Mob.amberOnTint),
      ChipTone.danger => (Mob.red50, Mob.redOnTint),
      ChipTone.neutral => (Mob.gray100, Mob.gray500),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(6)),
      child: Text(text, style: ss(11, w: FontWeight.w700, c: fg)),
    );
  }
}

class PrimaryButton extends StatelessWidget {
  const PrimaryButton(this.label, {super.key, this.onPressed, this.icon, this.busy = false});
  final String label;
  final VoidCallback? onPressed;
  final IconData? icon;
  final bool busy;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: double.infinity,
      height: 46,
      child: FilledButton(
        style: FilledButton.styleFrom(
          backgroundColor: Mob.navy800,
          disabledBackgroundColor: Mob.gray400,
          disabledForegroundColor: Colors.white,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
        ),
        onPressed: busy ? null : onPressed,
        child: busy
            ? const SizedBox(
                width: 18, height: 18,
                child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
            : Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  ?icon == null ? null : Icon(icon, size: 16),
                  ?icon == null ? null : const SizedBox(width: 7),
                  Flexible(
                    child: Text(label,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: ss(13.5, w: FontWeight.w700, c: Colors.white)),
                  ),
                ],
              ),
      ),
    );
  }
}

class OutlineButtonMob extends StatelessWidget {
  const OutlineButtonMob(this.label, {super.key, this.onPressed});
  final String label;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: double.infinity,
      height: 46,
      child: OutlinedButton(
        style: OutlinedButton.styleFrom(
          side: const BorderSide(color: Mob.gray300),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
        ),
        onPressed: onPressed,
        child: Text(label, style: ss(13.5, w: FontWeight.w700, c: Mob.navy800)),
      ),
    );
  }
}

/// AI accent card (cyan tint) for agent-derived content.
class AiCard extends StatelessWidget {
  const AiCard({super.key, required this.child});
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
      decoration: BoxDecoration(
        color: Mob.cyan50,
        border: Border.all(color: Mob.cyan100),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Semantics(
            label: 'AI-generated',
            child: Container(
              width: 26, height: 26,
              decoration: BoxDecoration(color: Mob.cyan600, borderRadius: BorderRadius.circular(6)),
              child: const Icon(Icons.auto_awesome, size: 14, color: Colors.white),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(child: child),
        ],
      ),
    );
  }
}

class ErrorRetry extends StatelessWidget {
  const ErrorRetry(this.message, {super.key, this.onRetry});
  final String message;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.cloud_off, color: Mob.gray400, size: 34),
            const SizedBox(height: 10),
            Text(message, textAlign: TextAlign.center, style: ss(13, c: Mob.gray500)),
            if (onRetry != null) ...[
              const SizedBox(height: 12),
              TextButton(onPressed: onRetry, child: Text('Retry', style: ss(13, w: FontWeight.w700, c: Mob.cyan700))),
            ],
          ],
        ),
      ),
    );
  }
}

class EmptyState extends StatelessWidget {
  const EmptyState(this.title, this.body, {super.key, this.icon = Icons.inbox_outlined});
  final String title;
  final String body;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(28),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 36, color: Mob.gray300),
            const SizedBox(height: 12),
            Text(title, style: pop(15)),
            const SizedBox(height: 5),
            Text(body, textAlign: TextAlign.center, style: ss(12.5, c: Mob.gray500)),
          ],
        ),
      ),
    );
  }
}

/// Async list body: loading / error / empty / data.
class AsyncBody<T> extends StatelessWidget {
  const AsyncBody({
    super.key,
    required this.future,
    required this.builder,
    this.onRetry,
    this.emptyTitle = 'Nothing here yet',
    this.emptyBody = '',
    this.isEmpty,
  });

  final Future<T> future;
  final Widget Function(BuildContext, T) builder;
  final VoidCallback? onRetry;
  final String emptyTitle;
  final String emptyBody;
  final bool Function(T)? isEmpty;

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<T>(
      future: future,
      builder: (context, snap) {
        if (snap.connectionState != ConnectionState.done) {
          return const Center(child: CircularProgressIndicator(color: Mob.cyan600));
        }
        if (snap.hasError) {
          return ErrorRetry(snap.error.toString(), onRetry: onRetry);
        }
        final data = snap.data as T;
        if (isEmpty?.call(data) ?? false) {
          return EmptyState(emptyTitle, emptyBody);
        }
        return builder(context, data);
      },
    );
  }
}

String fmtDate(dynamic iso, {bool time = false}) {
  if (iso == null) return '—';
  final d = DateTime.tryParse(iso.toString())?.toLocal();
  if (d == null) return '—';
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  final base = '${d.day} ${months[d.month - 1]} ${d.year}';
  if (!time) return base;
  final hh = d.hour.toString().padLeft(2, '0');
  final mm = d.minute.toString().padLeft(2, '0');
  return '$base $hh:$mm';
}

String fmtMoney(num? amount, [String currency = 'INR']) {
  if (amount == null) return '—';
  final s = amount.toStringAsFixed(2);
  final parts = s.split('.');
  final digits = parts[0];
  final buf = StringBuffer();
  for (var i = 0; i < digits.length; i++) {
    buf.write(digits[i]);
    final left = digits.length - i - 1;
    if (left > 0 && left % 3 == 0) buf.write(',');
  }
  final sym = switch (currency) { 'INR' => '₹', 'AED' => 'AED ', _ => '$currency ' };
  return '$sym$buf.${parts[1]}';
}
