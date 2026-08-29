import { useState } from 'react';
import {
  Home, LayoutGrid, Clock3, ChevronLeft, ChevronRight, Sparkles, Check, TriangleAlert, ShieldCheck,
} from 'lucide-react';

const ACTIVE = '#00265D';
const DIM = '#8B96A5';

const APPS = {
  nav: { id: 'APP-2026-04431', sub: 'Navigation licence renewal · MV Dana 3' },
  csr: { id: 'APP-2026-04412', sub: 'Certificate renewal — CSR · MV Gulf Horizon' },
};

export default function CustomerApp({ showAiHints = true }) {
  const [screen, setScreen] = useState('home');
  const [paid, setPaid] = useState(false);
  const [trackApp, setTrackApp] = useState('csr');

  const tabColor = {
    home: screen === 'home' ? ACTIVE : DIM,
    services: screen === 'apply' || screen === 'pay' ? ACTIVE : DIM,
    track: screen === 'track' || screen === 'receipt' ? ACTIVE : DIM,
  };

  return (
    <div className="app">
      <div className="app-body">
        {screen === 'home' && (
          <div className="screen" key="home">
            <div className="hdr" style={{ paddingBottom: 18 }}>
              <div className="hdr-row" style={{ marginBottom: 14 }}>
                <div>
                  <div className="hdr-date">Gulf Star Shipping LLC</div>
                  <div className="hdr-name">Marhaba, Ahmed</div>
                </div>
                <div className="pass-pill">
                  <ShieldCheck size={13} strokeWidth={1.75} /> UAE PASS
                </div>
              </div>
              <div className="stat-row">
                <div className="stat-tile"><div className="stat-num">3</div><div className="stat-label">Vessels</div></div>
                <div className="stat-tile"><div className="stat-num">{paid ? 3 : 2}</div><div className="stat-label">In progress</div></div>
                <div className="stat-tile">
                  <div className="stat-num" style={{ color: '#F5B942' }}>{paid ? 0 : 1}</div>
                  <div className="stat-label">Action due</div>
                </div>
              </div>
            </div>
            <div className="content">
              {!paid && (
                <div className="card pad-lg warn-border" style={{ boxShadow: 'none' }}>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 12 }}>
                    <div style={{
                      width: 34, height: 34, borderRadius: 8, background: '#FDF3E1', color: '#B9770E',
                      display: 'grid', placeItems: 'center', flex: 'none',
                    }}
                    >
                      <TriangleAlert size={16} strokeWidth={1.75} />
                    </div>
                    <div>
                      <div className="card-title sm">Navigation licence expires in 21 days</div>
                      <div style={{ fontSize: 12.5, color: '#647080', marginTop: 2 }}>MV Dana 3 · expires 19 Sep 2026</div>
                    </div>
                  </div>
                  <button className="btn btn-primary" onClick={() => setScreen('apply')}>
                    Renew now — pre-filled, AED 2,400
                  </button>
                </div>
              )}
              {paid && (
                <button className="card ok-border row-between" onClick={() => { setTrackApp('nav'); setScreen('track'); }}>
                  <div>
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: '#131C2B' }}>Navigation licence renewal</div>
                    <div style={{ fontSize: 11.5, color: '#647080', marginTop: 2 }}>MV Dana 3 · APP-2026-04431 · paid ✓</div>
                  </div>
                  <span className="badge badge-ai pad9">IN REVIEW</span>
                </button>
              )}
              <button className="card row-between" onClick={() => { setTrackApp('csr'); setScreen('track'); }}>
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: '#131C2B' }}>Certificate renewal — CSR</div>
                  <div style={{ fontSize: 11.5, color: '#647080', marginTop: 2 }}>MV Gulf Horizon · APP-2026-04412</div>
                </div>
                <span className="badge badge-ai pad9">IN REVIEW</span>
              </button>
              {showAiHints && (
                <div className="ai-card center">
                  <div className="ai-chip"><Sparkles size={14} strokeWidth={1.75} /></div>
                  <div className="ai-text" style={{ lineHeight: 1.4 }}>
                    Ask the assistant — "What do I need to transfer ownership of a vessel?"
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {screen === 'apply' && (
          <div className="screen" key="apply">
            <div className="hdr compact">
              <div className="hdr-back-row" style={{ marginBottom: 12 }}>
                <button className="back-btn" onClick={() => setScreen('home')} aria-label="Back">
                  <ChevronLeft size={20} strokeWidth={1.75} />
                </button>
                <div>
                  <div className="hdr-title">Renew navigation licence</div>
                  <div className="hdr-sub">Step 1 of 2 — Confirm details</div>
                </div>
              </div>
              <div className="step-track">
                <div className="step-seg done" />
                <div className="step-seg" />
              </div>
            </div>
            <div className="content tight">
              <div className="notice notice-ok">
                <Check size={13} strokeWidth={2.5} />
                <span>Pre-filled from the vessel register — nothing to upload.</span>
              </div>
              <div className="card">
                <div style={{ fontSize: 11, color: '#8B96A5', marginBottom: 3 }}>Vessel</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#131C2B' }}>MV Dana 3 · IMO 9354201</div>
                <div style={{ fontSize: 11.5, color: '#647080', marginTop: 2 }}>Supply vessel · 499 GT · Abu Dhabi home port</div>
              </div>
              <div className="card">
                <div style={{ fontSize: 11, color: '#8B96A5', marginBottom: 3 }}>Operating area</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#131C2B' }}>Coastal — UAE waters</div>
              </div>
              <div className="card row-between" style={{ padding: '12px 14px' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#131C2B' }}>Class certificate</div>
                  <div style={{ fontSize: 11, color: '#1E8E5A', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Check size={11} strokeWidth={2.5} /> Fetched from registry — valid
                  </div>
                </div>
                <span style={{ fontSize: 11, color: '#8B96A5' }}>auto</span>
              </div>
            </div>
            <div className="footer-bar">
              <button className="btn btn-primary" style={{ padding: 12 }} onClick={() => setScreen('pay')}>
                Continue to payment <ChevronRight size={15} strokeWidth={1.75} style={{ margin: '0 0 0 -3px' }} />
              </button>
            </div>
          </div>
        )}

        {screen === 'pay' && (
          <div className="screen" key="pay">
            <div className="hdr compact">
              <div className="hdr-back-row" style={{ marginBottom: 12 }}>
                <button className="back-btn" onClick={() => setScreen('apply')} aria-label="Back">
                  <ChevronLeft size={20} strokeWidth={1.75} />
                </button>
                <div>
                  <div className="hdr-title">Review &amp; pay</div>
                  <div className="hdr-sub">Step 2 of 2 · APP-2026-04431</div>
                </div>
              </div>
              <div className="step-track">
                <div className="step-seg done" />
                <div className="step-seg done" />
              </div>
            </div>
            <div className="content tight">
              <div className="fee-card">
                <div className="fee-row"><span className="fee-k">Licence fee</span><span className="fee-v">AED 2,200</span></div>
                <div className="fee-row"><span className="fee-k">Knowledge &amp; innovation fee</span><span className="fee-v">AED 200</span></div>
                <div className="fee-total"><span>Total</span><span>AED 2,400</span></div>
              </div>
              <div className="pay-method">
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: '#131C2B' }}>Apple Pay</div>
                  <div style={{ fontSize: 11, color: '#647080' }}>via national payment gateway</div>
                </div>
                <span className="pay-check"><Check size={11} strokeWidth={2.5} /></span>
              </div>
            </div>
            <div className="footer-bar">
              <button
                className="btn btn-primary"
                style={{ padding: 13, fontSize: 14 }}
                onClick={() => { setPaid(true); setScreen('receipt'); }}
              >
                Pay AED 2,400
              </button>
            </div>
          </div>
        )}

        {screen === 'receipt' && (
          <div className="screen" key="receipt">
            <div className="success-wrap">
              <div className="success-ring"><Check size={32} strokeWidth={2.5} /></div>
              <div className="success-title">Payment successful</div>
              <div className="success-text">
                AED 2,400.00 · receipt RCPT-88191<br />
                Zero-touch eligible — expected issue tomorrow 14:00.
              </div>
              <div style={{ display: 'flex', gap: 9 }}>
                <button
                  className="btn btn-primary"
                  style={{ width: 'auto', padding: '12px 20px' }}
                  onClick={() => { setTrackApp('nav'); setScreen('track'); }}
                >
                  Track application
                </button>
                <button
                  className="btn btn-outline"
                  style={{ width: 'auto', padding: '12px 20px', borderColor: '#C3CBD6' }}
                  onClick={() => setScreen('home')}
                >
                  Home
                </button>
              </div>
            </div>
          </div>
        )}

        {screen === 'track' && (
          <div className="screen" key="track">
            <div className="hdr compact hdr-back-row">
              <button className="back-btn" onClick={() => setScreen('home')} aria-label="Back">
                <ChevronLeft size={20} strokeWidth={1.75} />
              </button>
              <div>
                <div className="hdr-title">{APPS[trackApp].id}</div>
                <div className="hdr-sub">{APPS[trackApp].sub}</div>
              </div>
            </div>
            <div className="content" style={{ padding: 16 }}>
              <div className="ai-card center row-between" style={{ gap: 0 }}>
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: '#0A3A7D' }}>In technical review</div>
                  <div style={{ fontSize: 11.5, color: '#647080', marginTop: 2 }}>Expected completion: tomorrow 14:00</div>
                </div>
                <span className="badge badge-white pad9">ON TRACK</span>
              </div>
              <div className="card" style={{ padding: '16px 15px' }}>
                <div className="tl-row">
                  <div className="tl-rail">
                    <div className="tl-node done"><Check size={11} strokeWidth={2.5} /></div>
                    <div className="tl-line done" />
                  </div>
                  <div className="tl-body">
                    <div className="tl-title">Submitted &amp; paid</div>
                    <div className="tl-sub">Today, 11:04 · receipt RCPT-88191</div>
                  </div>
                </div>
                <div className="tl-row">
                  <div className="tl-rail">
                    <div className="tl-node now"><span style={{ fontSize: 10 }}>●</span></div>
                    <div className="tl-line todo" />
                  </div>
                  <div className="tl-body">
                    <div className="tl-title now">Technical review — now</div>
                    <div className="tl-sub">Automated checks passed · with surveyor team</div>
                  </div>
                </div>
                <div className="tl-row">
                  <div className="tl-rail">
                    <div className="tl-node todo" />
                  </div>
                  <div>
                    <div className="tl-title todo">Licence issued</div>
                    <div className="tl-sub todo">Lands in your wallet automatically</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="tabbar">
        <button className="tab" style={{ color: tabColor.home }} onClick={() => setScreen('home')}>
          <Home size={18} strokeWidth={1.75} />
          <span className="tab-label home">Home</span>
        </button>
        <button className="tab" style={{ color: tabColor.services }} onClick={() => setScreen('apply')}>
          <LayoutGrid size={18} strokeWidth={1.75} />
          <span className="tab-label">Services</span>
        </button>
        <button className="tab" style={{ color: tabColor.track }} onClick={() => { setTrackApp(paid ? 'nav' : 'csr'); setScreen('track'); }}>
          <Clock3 size={18} strokeWidth={1.75} />
          <span className="tab-label">Track</span>
        </button>
      </div>
    </div>
  );
}
