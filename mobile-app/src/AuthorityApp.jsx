import { useState } from 'react';
import {
  Home, ListChecks, PenLine, ChevronLeft, Sparkles, Check, Camera, Mic,
} from 'lucide-react';

const segCls = (v, want) => `seg${v === want ? ` sel-${want}` : ''}`;

const ACTIVE = '#00265D';
const DIM = '#8B96A5';

export default function AuthorityApp({ offlineMode = true, showAiHints = true }) {
  const [screen, setScreen] = useState('home');
  const [q1, setQ1] = useState(null);
  const [q2, setQ2] = useState(null);
  const [approved, setApproved] = useState(false);

  const checked = (q1 ? 1 : 0) + (q2 ? 1 : 0);

  const tabColor = {
    home: screen === 'home' ? ACTIVE : DIM,
    inspect: screen === 'checklist' || screen === 'dossier' ? ACTIVE : DIM,
    report: screen === 'report' || screen === 'signed' ? ACTIVE : DIM,
  };

  return (
    <div className="app">
      <div className="app-body">
        {screen === 'home' && (
          <div className="screen" key="home">
            <div className="hdr">
              <div className="hdr-row" style={{ marginBottom: 12 }}>
                <div>
                  <div className="hdr-date">Thursday 29 Aug · Port Zayed</div>
                  <div className="hdr-name">Insp. R. Al Marzooqi</div>
                </div>
                <div className="conn-pill">
                  <span
                    className="conn-dot"
                    style={{ background: offlineMode ? '#F5B942' : '#4BD48B' }}
                  />
                  {offlineMode ? 'Offline · 3 queued' : 'Online · synced'}
                </div>
              </div>
              <div className="stat-row">
                <div className="stat-tile"><div className="stat-num">2</div><div className="stat-label">Inspections today</div></div>
                <div className="stat-tile"><div className="stat-num">4</div><div className="stat-label">Open findings</div></div>
                <div className="stat-tile"><div className="stat-num" style={{ color: '#63D3EC' }}>1</div><div className="stat-label">Flash alert</div></div>
              </div>
            </div>
            <div className="content">
              <div className="section-label">TODAY'S BOARDINGS</div>
              <div className="card pad-lg">
                <div className="row-between top" style={{ marginBottom: 8 }}>
                  <div>
                    <div className="card-title">MV Gulf Pioneer</div>
                    <div className="card-sub">IMO 9412375 · Bulk carrier · Berth 07</div>
                  </div>
                  <span className="badge badge-danger">RISK 78</span>
                </div>
                <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                  <span className="badge badge-info w6">PSC · 09:30</span>
                  <span className="badge badge-ai w6"><Check size={11} strokeWidth={2.5} /> Dossier cached</span>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-primary" onClick={() => setScreen('dossier')}>Open dossier</button>
                  <button className="btn btn-outline" onClick={() => setScreen('checklist')}>Start inspection</button>
                </div>
              </div>
              {showAiHints && (
                <div className="ai-card">
                  <div className="ai-chip"><Sparkles size={14} strokeWidth={1.75} /></div>
                  <div className="ai-text">
                    <strong>Focus advisory:</strong> Gulf Pioneer — 3 fire-safety deficiencies on last
                    2 PSC records. Checklist section 07 pre-expanded.
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {screen === 'dossier' && (
          <div className="screen" key="dossier">
            <div className="hdr compact hdr-back-row">
              <button className="back-btn" onClick={() => setScreen('home')} aria-label="Back">
                <ChevronLeft size={20} strokeWidth={1.75} />
              </button>
              <div>
                <div className="hdr-title">Pre-inspection dossier</div>
                <div className="hdr-sub">MV Gulf Pioneer · generated 06:12 · cached ✓</div>
              </div>
            </div>
            <div className="content tight">
              <div className="card">
                <div className="card-label">SUMMARY</div>
                <div style={{ fontSize: 13, lineHeight: 1.55, color: '#3B4757' }}>
                  Elevated fire-safety risk. Two prior PSC detentions (2024, 2025), both
                  fire-related. Crew changed 60% at last port call.
                </div>
              </div>
              <div className="card">
                <div className="card-label">FOCUS AREAS</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12.5, color: '#131C2B' }}>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <span style={{ color: '#C43D3D', fontWeight: 700 }}>1</span>
                    <span>Fire dampers &amp; doors — repeat deficiency class</span>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <span style={{ color: '#B9770E', fontWeight: 700 }}>2</span>
                    <span>Crew familiarisation — high turnover</span>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <span style={{ color: '#B9770E', fontWeight: 700 }}>3</span>
                    <span>Oil record book — gap flagged by analytics</span>
                  </div>
                </div>
              </div>
              <button className="btn btn-primary" style={{ padding: 13, fontSize: 13.5 }} onClick={() => setScreen('checklist')}>
                Start inspection with this dossier
              </button>
            </div>
          </div>
        )}

        {screen === 'checklist' && (
          <div className="screen" key="checklist">
            <div className="hdr compact">
              <div className="hdr-back-row">
                <button className="back-btn" onClick={() => setScreen('home')} aria-label="Back">
                  <ChevronLeft size={20} strokeWidth={1.75} />
                </button>
                <div>
                  <div className="hdr-title sm">MV Gulf Pioneer · PSC</div>
                  <div className="hdr-sub">Section 07 — Fire Safety</div>
                </div>
              </div>
              <div style={{ marginTop: 12 }}>
                <div className="progress-labels"><span>Progress</span><span>{checked} / 2 answered</span></div>
                <div className="progress-track">
                  <div className="progress-fill" style={{ width: `${(checked / 2) * 100}%` }} />
                </div>
              </div>
            </div>
            <div className="content tight">
              <div className="card" style={{ padding: '13px 14px' }}>
                <div className="q-text">07.1 — Fire doors close and latch from the release station</div>
                <div className="seg-row">
                  <button className={segCls(q1, 'yes')} onClick={() => setQ1('yes')}>YES</button>
                  <button className={segCls(q1, 'no')} onClick={() => setQ1('no')}>NO</button>
                </div>
              </div>
              <div className="card" style={{ padding: '13px 14px' }}>
                <div className="q-text">07.2 — Fire dampers operable, marked and tested</div>
                <div className="seg-row">
                  <button className={segCls(q2, 'yes')} onClick={() => setQ2('yes')}>YES</button>
                  <button className={segCls(q2, 'no')} onClick={() => setQ2('no')}>NO</button>
                </div>
                {q2 === 'no' && (
                  <>
                    <div className="evidence">
                      Damper #4, engine room supply — seized in open position.
                      <span className="ev-ic"><Camera size={13} strokeWidth={1.75} /></span>2 photos ·
                      <span className="ev-ic"><Mic size={13} strokeWidth={1.75} /></span>voice 0:38
                    </div>
                    <div className="ai-suggest">
                      <Sparkles size={13} strokeWidth={1.75} />
                      <span>Suggested: code 07108 · action 17 (rectify before departure)</span>
                    </div>
                  </>
                )}
              </div>
            </div>
            <div className="footer-bar">
              <button
                className={`btn btn-primary${checked === 2 ? '' : ' disabled-look'}`}
                style={{ padding: 12 }}
                aria-disabled={checked !== 2}
                onClick={() => { if (checked === 2) setScreen('report'); }}
              >
                Finish section → AI draft report
              </button>
            </div>
          </div>
        )}

        {screen === 'report' && (
          <div className="screen" key="report">
            <div className="hdr compact hdr-back-row">
              <button className="back-btn" onClick={() => setScreen('checklist')} aria-label="Back">
                <ChevronLeft size={20} strokeWidth={1.75} />
              </button>
              <div>
                <div className="hdr-title">Inspection report — draft</div>
                <div className="hdr-sub">AI-drafted from your captures</div>
              </div>
            </div>
            <div className="content tight">
              <div className="notice notice-warn">
                <Sparkles size={13} strokeWidth={1.75} />
                <span>Draft only. Nothing is issued until you approve and sign.</span>
              </div>
              <div className="card">
                <div className="row-between" style={{ marginBottom: 7 }}>
                  <span className="badge-tag badge-danger">DEFICIENCY 07108</span>
                  <span style={{ fontSize: 11, color: '#8B96A5' }}>from item 07.2</span>
                </div>
                <div style={{ fontSize: 13, lineHeight: 1.5, color: '#131C2B' }}>
                  Engine room supply damper #4 seized in open position; quick-closing function
                  inoperative. SOLAS II-2/9.7 refers.
                </div>
                <div style={{ fontSize: 11.5, color: '#647080', margin: '7px 0' }}>
                  Action 17 — rectify before departure
                </div>
                <button
                  className={`approve-btn${approved ? ' approved' : ''}`}
                  onClick={() => setApproved((v) => !v)}
                >
                  {approved && <Check size={13} strokeWidth={2.5} />}
                  {approved ? 'Approved' : 'Tap to approve'}
                </button>
              </div>
            </div>
            <div className="footer-bar">
              <button
                className={`btn btn-primary${approved ? '' : ' disabled-look'}`}
                style={{ padding: 13, fontSize: 13.5 }}
                onClick={() => { if (approved) setScreen('signed'); }}
              >
                Sign &amp; issue report <PenLine size={15} strokeWidth={1.75} />
              </button>
              <div className="footer-hint">
                {approved
                  ? 'Digitally signed as Insp. R. Al Marzooqi · immutable audit trail'
                  : 'Approve all findings to enable signing'}
              </div>
            </div>
          </div>
        )}

        {screen === 'signed' && (
          <div className="screen" key="signed">
            <div className="success-wrap">
              <div className="success-ring"><Check size={32} strokeWidth={2.5} /></div>
              <div className="success-title">Report issued</div>
              <div className="success-text">
                PSC-2026-0871 signed as Insp. R. Al Marzooqi.<br />
                Master notified · deficiency tracked to close-out.
              </div>
              <button
                className="btn btn-primary"
                style={{ width: 'auto', padding: '12px 26px', fontSize: 13.5 }}
                onClick={() => setScreen('home')}
              >
                Back to home
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="tabbar">
        <button className="tab" style={{ color: tabColor.home }} onClick={() => setScreen('home')}>
          <Home size={18} strokeWidth={1.75} />
          <span className="tab-label home">Home</span>
        </button>
        <button className="tab" style={{ color: tabColor.inspect }} onClick={() => setScreen('checklist')}>
          <ListChecks size={18} strokeWidth={1.75} />
          <span className="tab-label">Inspect</span>
        </button>
        <button className="tab" style={{ color: tabColor.report }} onClick={() => setScreen('report')}>
          <PenLine size={18} strokeWidth={1.75} />
          <span className="tab-label">Report</span>
        </button>
      </div>
    </div>
  );
}
