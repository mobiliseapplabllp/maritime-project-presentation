/* Grounded port-operations assistant — deterministic core.
 * Runs identically in the backend (Node require(esm)) and in the browser demo.
 * `data` is a set of async accessors over live records; every reply cites its source screens.
 * When an Anthropic key is configured, the backend uses this engine's findings as grounding
 * context for Claude (claude-opus-5) and falls back to the engine text on any error. */

const fmtNum = (n) => new Intl.NumberFormat('en-IN').format(Math.round(n || 0));
const fmtINR = (n) => {
  const abs = Math.abs(n || 0);
  if (abs >= 1e7) return `₹${(n / 1e7).toFixed(2)} Cr`;
  if (abs >= 1e5) return `₹${(n / 1e5).toFixed(1)} L`;
  return `₹${fmtNum(n)}`;
};
const dt = (d) => (d ? new Date(d).toISOString().slice(0, 16).replace('T', ' ') : '—');

export const SUGGESTIONS = [
  'What is the berth occupancy right now?',
  'Which vessels are arriving in the next 72 hours?',
  'Show certificates that are expired or expiring',
  'Who are the highest-risk vessels today?',
  'Any open incidents at the moment?',
  'Revenue position this month',
];

export async function answer({ message, data }) {
  const q = String(message || '').toLowerCase();
  const has = (...words) => words.some((w) => q.includes(w));

  // --- specific record lookups first ---
  const vcnMatch = q.toUpperCase().match(/MUN-\d{4}-\d{4}/);
  if (vcnMatch) {
    const call = await data.portCallByVcn(vcnMatch[0]);
    if (!call) return { reply: `I could not find port call **${vcnMatch[0]}** in the system.`, sources: [], suggestions: SUGGESTIONS.slice(0, 3) };
    return {
      reply: `**${call.vcn} — ${call.vesselName}**\n\nStatus: **${call.status.replace(/_/g, ' ')}**${call.berthCode ? ` at berth **${call.berthCode}**` : ''}.\nETA ${dt(call.eta)}${call.atb ? ` · Berthed ${dt(call.atb)}` : ''}${call.atd ? ` · Sailed ${dt(call.atd)}` : ''}.\nAgent: ${call.agentName || '—'}. Cargo operations: ${call.cargoSummary || 'none recorded yet'}.`,
      sources: [{ label: `Open ${call.vcn}`, link: `/port-calls/${call.id}` }],
      suggestions: ['Which vessels are at berth?', 'Any berth conflicts expected?'],
    };
  }

  if (has('where is', 'status of', 'find vessel', 'position of')) {
    const name = message.replace(/.*(?:where is|status of|find vessel|position of)/i, '').replace(/[?.]/g, '').trim();
    if (name.length > 2) {
      const v = await data.vesselByName(name);
      if (v) {
        return {
          reply: `**${v.name}** (IMO ${v.imo}, ${v.type}, ${v.flag} flag)\n\n${v.situation}${v.certAlert ? `\n\n⚠ ${v.certAlert}` : ''}`,
          sources: [{ label: `Open ${v.name}`, link: `/vessels/${v.id}` }],
          suggestions: [`Risk score of ${v.name}`, 'Show the berth board'],
        };
      }
    }
  }

  if (has('risk', 'targeting', 'psc target', 'inspect next', 'highest-risk', 'highest risk')) {
    const top = await data.riskTop(5);
    if (!top.length) return { reply: 'No active vessels currently carry an elevated risk profile.', sources: [], suggestions: SUGGESTIONS.slice(0, 3) };
    const lines = top.map((r, i) => `${i + 1}. **${r.name}** — score **${r.score}** (${r.band}) · ${r.topFactor}`).join('\n');
    return {
      reply: `Highest-risk vessels right now (explainable score, factor-weighted):\n\n${lines}\n\nEach score opens to its full factor breakdown in the Risk module.`,
      sources: [{ label: 'Open risk register', link: '/risk' }, { label: 'Targeting list', link: '/risk/targeting' }],
      suggestions: ['Which arrivals should we inspect?', 'Show open deficiencies'],
    };
  }

  if (has('berth occupancy', 'berth board', 'berths free', 'which berth', 'at berth', 'berthed')) {
    const b = await data.berthBoard();
    const occ = b.filter((x) => x.vessel);
    return {
      reply: `**${occ.length} of ${b.length} berths are occupied** (${Math.round((occ.length / Math.max(1, b.length)) * 100)}%).\n\n${occ.map((x) => `• **${x.code}** — ${x.vessel}${x.etd ? ` (ETD ${dt(x.etd)})` : ''}`).join('\n') || 'All berths free.'}`,
      sources: [{ label: 'Open berth board', link: '/berth-board' }],
      suggestions: ['Which vessels are arriving next?', 'Any vessels waiting at anchorage?'],
    };
  }

  if (has('arriv', 'expected', 'eta', 'inbound', 'next 72')) {
    const arr = await data.arrivals();
    if (!arr.length) return { reply: 'No arrivals are currently announced or confirmed.', sources: [{ label: 'Port calls', link: '/port-calls' }], suggestions: SUGGESTIONS.slice(0, 3) };
    return {
      reply: `**${arr.length} vessels inbound:**\n\n${arr.slice(0, 6).map((a) => `• **${a.vessel}** (${a.vcn}) — ${a.status.replace(/_/g, ' ')}, ETA ${dt(a.eta)}`).join('\n')}`,
      sources: [{ label: 'Open port calls', link: '/port-calls' }],
      suggestions: ['Who should we target for inspection?', 'Berth occupancy right now'],
    };
  }

  if (has('certificat', 'expir', 'lapsed')) {
    const certs = await data.expiringCerts();
    const expired = certs.filter((c) => c.status === 'EXPIRED');
    const expiring = certs.filter((c) => c.status === 'EXPIRING');
    return {
      reply: `**${expired.length} expired** and **${expiring.length} expiring** statutory certificates across the active fleet.\n\n${certs.slice(0, 6).map((c) => `• ${c.status === 'EXPIRED' ? '🔴' : '🟠'} **${c.vessel}** — ${c.certType} (${dt(c.expiryDate).slice(0, 10)})`).join('\n')}`,
      sources: [{ label: 'Certificate register', link: '/certificates' }],
      suggestions: ['Highest-risk vessels', 'Any of these vessels inbound?'],
    };
  }

  if (has('incident', 'sar', 'search and rescue', 'pollution', 'emergency', 'mrcc')) {
    const inc = await data.openIncidents();
    if (!inc.length) return { reply: 'No open incidents — the maritime centre picture is clear. ✅', sources: [{ label: 'Maritime centre', link: '/nmc/incidents' }], suggestions: SUGGESTIONS.slice(0, 3) };
    return {
      reply: `**${inc.length} open incident(s):**\n\n${inc.map((i) => `• **${i.number}** ${i.type} (${i.severity}) — ${i.title} · status ${i.status}`).join('\n')}`,
      sources: [{ label: 'Open incident log', link: '/nmc/incidents' }],
      suggestions: ['Show the live traffic picture', 'Any MDA alerts?'],
    };
  }

  if (has('revenue', 'invoice', 'billing', 'collection', 'outstanding', 'paid')) {
    const inv = await data.invoicesSummary();
    return {
      reply: `**Revenue this month:** ${fmtINR(inv.mtd)} billed.\n\n• Outstanding (issued, unpaid): **${fmtINR(inv.outstanding)}** across ${inv.outstandingCount} invoices\n• Drafts awaiting issue: ${inv.drafts}\n• Collected this month: ${fmtINR(inv.collectedMtd)}`,
      sources: [{ label: 'Open invoices', link: '/invoices' }],
      suggestions: ['Which invoices are overdue?', 'Cargo handled this month'],
    };
  }

  if (has('deficien', 'detention', 'inspection')) {
    const k = await data.kpis();
    return {
      reply: `**${k.openDeficiencies} open deficiencies** across current inspections, with **${k.detentionsYTD} detention(s)** so far this year. ${k.openInspections} inspection(s) are in progress right now.`,
      sources: [{ label: 'Open inspections', link: '/inspections' }],
      suggestions: ['Highest-risk vessels', 'Certificates needing attention'],
    };
  }

  if (has('circular', 'legislation', 'notice', 'dgs', 'instrument', 'regulation')) {
    const ins = await data.instrumentsLatest();
    return {
      reply: `Latest instruments in force:\n\n${ins.map((i) => `• **${i.refNo}** — ${i.title}${i.ackRequired ? ' *(acknowledgment required)*' : ''}`).join('\n')}`,
      sources: [{ label: 'Legislation & circulars', link: '/legislation' }],
      suggestions: ['Which circulars need my acknowledgment?'],
    };
  }

  if (has('cargo', 'throughput', 'teu', 'tonnage')) {
    const k = await data.kpis();
    return {
      reply: `**Cargo this month:** ${fmtNum(k.cargoMTD)} MT handled, including ${fmtNum(k.teuMTD)} TEU. Average vessel turnaround over the last 30 days is **${k.avgTurnaroundHrs} hours**.`,
      sources: [{ label: 'Dashboard', link: '/' }],
      suggestions: ['Revenue this month', 'Berth occupancy'],
    };
  }

  // --- default: daily position ---
  const k = await data.kpis();
  return {
    reply: `Here's the port at a glance:\n\n• **${k.vesselsAtBerth} vessels at berth** (${k.berthOccupancyPct}% occupancy), ${k.atAnchorage} at anchorage\n• **${k.expectedArrivals72h} arrivals** expected in 72 h\n• ${fmtNum(k.cargoMTD)} MT and ${fmtNum(k.teuMTD)} TEU handled this month\n• ${fmtINR(k.revenueMTD)} billed MTD · ${k.openDeficiencies} open deficiencies\n\nAsk me about any vessel, call number, berth, certificate, risk profile, incident or invoice.`,
    sources: [{ label: 'Dashboard', link: '/' }],
    suggestions: SUGGESTIONS,
  };
}
