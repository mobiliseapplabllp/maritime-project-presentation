import { useState } from 'react';
import AuthorityApp from './AuthorityApp.jsx';
import CustomerApp from './CustomerApp.jsx';

function Toggle({ label, value, onChange }) {
  return (
    <button
      className="scenario-toggle"
      role="switch"
      aria-checked={value}
      onClick={() => onChange(!value)}
      onKeyDown={(e) => { if (e.key === ' ') e.preventDefault(); }}
      onKeyUp={(e) => { if (e.key === ' ') onChange(!value); }}
      type="button"
    >
      <span className={`switch${value ? ' on' : ''}`} />
      {label}
    </button>
  );
}

export default function App() {
  const [offlineMode, setOfflineMode] = useState(true);
  const [showAiHints, setShowAiHints] = useState(true);

  // ?app=authority|customer renders one app full-viewport (phone use / screenshots)
  const solo = new URLSearchParams(window.location.search).get('app');
  if (solo === 'authority' || solo === 'customer') {
    return (
      <div className="standalone">
        <div className="phone-shell">
          {solo === 'authority'
            ? <AuthorityApp offlineMode={offlineMode} showAiHints={showAiHints} />
            : <CustomerApp showAiHints={showAiHints} />}
        </div>
      </div>
    );
  }

  return (
    <div className="canvas">
      <div>
        <div className="canvas-eyebrow">Maritime Transformation Programme</div>
        <div className="canvas-title">Interactive prototype — tap through both apps</div>
        <div className="canvas-sub">
          Authority: home → dossier → checklist → report → sign. Customer: home → renew →
          pay → receipt → track. Tab bars work.
        </div>
      </div>
      <div className="scenario-bar">
        <Toggle label="Offline mode" value={offlineMode} onChange={setOfflineMode} />
        <Toggle label="AI hints" value={showAiHints} onChange={setShowAiHints} />
      </div>
      <div className="phones">
        <div className="phone-col">
          <div className="phone-col-label">Marine Ops — Authority</div>
          <div className="phone-shell">
            <AuthorityApp offlineMode={offlineMode} showAiHints={showAiHints} />
          </div>
        </div>
        <div className="phone-col">
          <div className="phone-col-label">Maritime Services — Customer</div>
          <div className="phone-shell">
            <CustomerApp showAiHints={showAiHints} />
          </div>
        </div>
      </div>
      <div className="canvas-footnote">
        Open a single app full-screen with <code>?app=authority</code> or <code>?app=customer</code>.
        Static 36-screen reference: design-reference/Maritime&nbsp;Mobile&nbsp;Apps.dc.html
      </div>
    </div>
  );
}
