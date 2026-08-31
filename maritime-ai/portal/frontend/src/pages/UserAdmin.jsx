import React, { useEffect, useState } from "react";
import { api } from "../lib/api.js";
import { useAuth } from "../lib/auth.jsx";
import { useLang } from "../lib/i18n.jsx";
import { Card, PageHeader, Loading, Hint } from "../components/ui.jsx";

const BLANK = { email: "", name: "", persona: "authority", org: "Port Authority", scope: "port", is_admin: false, active: true, password: "" };

const REPORT_KINDS = [
  { v: "port", label: "Port / Executive brief" },
  { v: "zone", label: "Zone" },
  { v: "terminal", label: "Terminal" },
  { v: "berth", label: "Berth" },
  { v: "crew", label: "Seafarer / crewing" },
  { v: "vessel", label: "Vessel" },
  { v: "research", label: "Market Intelligence daily digest" },
];
const SCOPE_HINT = { port: "(no scope — whole port)", zone: "e.g. Container", terminal: "e.g. CT3", berth: "e.g. CT3-1", crew: "e.g. MUM-52259 (CDC no.)", vessel: "e.g. 9700005 (IMO)", research: "(no scope — full digest)" };
const BLANK_SUB = { name: "", kind: "port", cadence: "daily", enabled: true, recipients: [{ email: "", scope: "" }] };

// ---------------------------------------------------------------- modal shell
function Modal({ title, chip, wide, foot, onClose, children }) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fd-overlay" onClick={onClose}>
      <div className="fd-modal" style={{ width: wide ? 620 : 520 }} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="fd-head" style={{ borderTopColor: "var(--accent)" }}>
          <div style={{ display: "flex", alignItems: "center" }}>
            {chip && <span className="chip">{chip}</span>}
            <button className="fd-x" onClick={onClose}>×</button>
          </div>
          <div className="fd-title">{title}</div>
        </div>
        <div className="fd-body">{children}</div>
        {foot && <div className="fd-foot">{foot}</div>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- user modal
function UserModal({ initial, isEdit, onSaved, onClose }) {
  const { t } = useLang();
  const [form, setForm] = useState(initial);
  const [err, setErr] = useState("");
  const save = async () => {
    if (!form.email.includes("@")) { setErr(t("A valid email is required")); return; }
    try { await api.post("/admin/users", form); onSaved(t("Saved {email}", { email: form.email })); }
    catch (e) { setErr(e.message); }
  };
  const foot = (
    <>
      <span className="mono">{t("Authority = whole-port lens · Operator = terminal lens")}</span>
      <div style={{ display: "flex", gap: 8 }}>
        <button className="btn" onClick={onClose}>{t("Cancel")}</button>
        <button className="btn primary" onClick={save}>{t("Save user")}</button>
      </div>
    </>
  );
  return (
    <Modal title={isEdit ? t("Edit {email}", { email: initial.email }) : t("Add a user")} chip={isEdit ? t("Edit user") : t("New user")} foot={foot} onClose={onClose}>
      {err && <div className="login-err" style={{ marginBottom: 10 }}>{err}</div>}
      <div className="ua-form">
        <label>{t("Email")}<input value={form.email} readOnly={isEdit} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="person@org.com" style={isEdit ? { opacity: 0.6 } : null} /></label>
        <label>{t("Full name")}<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={t("Full name")} /></label>
        <label>{t("Persona")}
          <select value={form.persona} onChange={(e) => setForm({ ...form, persona: e.target.value, org: e.target.value === "authority" ? "Port Authority" : "Terminal Operator" })}>
            <option value="authority">{t("Authority — Port")}</option>
            <option value="operator">{t("Operator — Terminal")}</option>
          </select></label>
        <label>{t("Organisation")}<input value={form.org} onChange={(e) => setForm({ ...form, org: e.target.value })} /></label>
        <label className="ua-check"><input type="checkbox" checked={form.is_admin} onChange={(e) => setForm({ ...form, is_admin: e.target.checked })} /> {t("Administrator (can manage users)")}</label>
        <label>{t("Password")} <span className="ua-opt">{t("(optional — OTP works without it)")}</span><input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder={isEdit ? t("leave blank to keep unchanged") : t("leave blank for OTP-only")} /></label>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------- report-list modal
function SubModal({ initial, isEdit, onSaved, onClose }) {
  const { t } = useLang();
  const [form, setForm] = useState(initial);
  const [err, setErr] = useState("");
  const showScope = form.kind !== "port" && form.kind !== "research";
  const setR = (i, k, v) => { const rs = [...form.recipients]; rs[i] = { ...rs[i], [k]: v }; setForm({ ...form, recipients: rs }); };
  const addR = () => setForm({ ...form, recipients: [...(form.recipients || []), { email: "", scope: "" }] });
  const rmR = (i) => setForm({ ...form, recipients: form.recipients.filter((_, j) => j !== i) });
  const save = async () => {
    if (!form.name) { setErr(t("Give the list a name")); return; }
    const recipients = (form.recipients || []).filter((r) => r.email && r.email.includes("@"));
    if (!recipients.length) { setErr(t("Add at least one recipient email")); return; }
    try { await api.post("/admin/reports/subscriptions", { ...form, recipients }); onSaved(t("List saved ✓")); }
    catch (e) { setErr(e.message); }
  };
  const foot = (
    <>
      <span className="mono">{t("Same scope for all = broadcast · a scope each = personalised")}</span>
      <div style={{ display: "flex", gap: 8 }}>
        <button className="btn" onClick={onClose}>{t("Cancel")}</button>
        <button className="btn primary" onClick={save}>{t("Save list")}</button>
      </div>
    </>
  );
  return (
    <Modal wide title={isEdit ? t("Edit “{name}”", { name: initial.name }) : t("New report list")} chip={isEdit ? t("Edit list") : t("New list")} foot={foot} onClose={onClose}>
      {err && <div className="login-err" style={{ marginBottom: 10 }}>{err}</div>}
      <div className="ua-form">
        <label>{t("List name")}<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={t("e.g. Port leadership — daily brief")} /></label>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <label style={{ flex: 1, minWidth: 180 }}>{t("Report type")}
            <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
              {REPORT_KINDS.map((k) => <option key={k.v} value={k.v}>{t(k.label)}</option>)}
            </select></label>
          <label style={{ flex: 1, minWidth: 120 }}>{t("Frequency")}
            <select value={form.cadence} onChange={(e) => setForm({ ...form, cadence: e.target.value })}>
              <option value="daily">{t("Daily")}</option><option value="weekly">{t("Weekly")}</option><option value="monthly">{t("Monthly")}</option>
            </select></label>
          <label className="ua-check" style={{ alignSelf: "flex-end" }}><input type="checkbox" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} /> {t("Enabled")}</label>
        </div>
        <div className="ds-sec-h" style={{ marginTop: 6 }}>{t("Recipients")} {showScope && <span className="ua-opt">{t("— set a scope per person to personalise; leave same to broadcast")}</span>}</div>
        {(form.recipients || []).map((r, i) => (
          <div key={i} style={{ display: "flex", gap: 8, marginBottom: 6 }}>
            <input style={{ flex: 2 }} value={r.email} onChange={(e) => setR(i, "email", e.target.value)} placeholder="person@org.com" />
            {showScope && <input style={{ flex: 2 }} value={r.scope || ""} onChange={(e) => setR(i, "scope", e.target.value)} placeholder={t(SCOPE_HINT[form.kind])} />}
            <button className="ua-a del" onClick={() => rmR(i)} type="button">✕</button>
          </div>
        ))}
        <div><button className="btn" onClick={addR} type="button">{t("+ Recipient")}</button></div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------- AI reports tab
function ReportSubscriptions() {
  const { t } = useLang();
  const [subs, setSubs] = useState(null);
  const [msg, setMsg] = useState("");
  const [modal, setModal] = useState(null); // { initial, isEdit } | null
  const load = () => api.get("/admin/reports/subscriptions").then((d) => setSubs(d.subscriptions)).catch(() => setSubs([]));
  useEffect(() => { load(); }, []);
  const flash = (m) => { setMsg(m); setTimeout(() => setMsg(""), 6000); };
  const del = async (id) => { await api.del(`/admin/reports/subscriptions/${id}`); load(); };
  const toggle = async (s) => { await api.post("/admin/reports/subscriptions", { ...s, enabled: !s.enabled }); load(); };
  const sendNow = async (id) => {
    flash(t("Generating & sending… (the AI brief takes a few seconds)"));
    const r = await api.post(`/admin/reports/subscriptions/${id}/send`, {});
    const res = r.result || {};
    flash(res.errors && res.errors.length
      ? t("Sent {n} · {m} failed ({err})", { n: res.sent || 0, m: res.errors.length, err: res.errors[0] })
      : t("Sent {n} ✓", { n: res.sent || 0 }));
    load();
  };
  const onSaved = (m) => { setModal(null); flash(m); load(); };

  return (
    <Card pad={false} title="Recurring AI report subscriptions"
      cap="Define who receives which AI summary, and how often. Everyone on a list with the SAME scope gets one broadcast (e.g. all of port leadership gets the port brief); give each recipient a different scope to personalise (each terminal manager their own terminal, each berth supervisor their own berth). Reports send as a formatted email with a branded PDF attached. Nothing sends until a list is enabled.">
      <div className="ua-toolbar">
        <button className="btn primary" onClick={() => setModal({ initial: BLANK_SUB, isEdit: false })}>{t("＋ New report list")}</button>
        <span className="spacer" />
        {msg && <span className="login-info" style={{ margin: 0 }}>{msg}</span>}
      </div>
      {subs === null ? <div style={{ padding: "4px 16px 18px" }}><Loading /></div>
        : subs.length === 0 ? <div style={{ padding: "0 16px 18px" }}><Hint>{t("No report lists yet — create one with “＋ New report list”.")}</Hint></div> : (
          <div className="tbl-wrap"><table className="tbl">
            <thead><tr><th>{t("List")}</th><th>{t("Report")}</th><th>{t("Frequency")}</th><th>{t("Recipients")}</th><th>{t("Status")}</th><th>{t("Last sent")}</th><th>{t("Actions")}</th></tr></thead>
            <tbody>{subs.map((s) => (
              <tr key={s.id}>
                <td>{s.name}</td>
                <td>{t((REPORT_KINDS.find((k) => k.v === s.kind) || {}).label || s.kind)}</td>
                <td>{t(s.cadence)}</td>
                <td className="num">{(s.recipients || []).length}</td>
                <td style={{ color: s.enabled ? "var(--good)" : "var(--muted)" }}>{s.enabled ? t("enabled") : t("paused")}</td>
                <td style={{ fontSize: 12 }}>{s.last_sent ? String(s.last_sent).slice(0, 16).replace("T", " ") : t("never")}</td>
                <td style={{ whiteSpace: "nowrap" }}>
                  <button className="ua-a" onClick={() => sendNow(s.id)}>{t("send now")}</button>
                  <button className="ua-a" onClick={() => setModal({ initial: { ...s, recipients: (s.recipients && s.recipients.length) ? s.recipients : [{ email: "", scope: "" }] }, isEdit: true })}>{t("edit")}</button>
                  <button className="ua-a" onClick={() => toggle(s)}>{s.enabled ? t("pause") : t("enable")}</button>
                  <button className="ua-a del" onClick={() => del(s.id)}>{t("delete")}</button>
                </td>
              </tr>))}
            </tbody></table></div>
        )}
      {modal && <SubModal initial={modal.initial} isEdit={modal.isEdit} onSaved={onSaved} onClose={() => setModal(null)} />}
    </Card>
  );
}

// ---------------------------------------------------------------- page
export default function UserAdmin() {
  const { user } = useAuth();
  const { t } = useLang();
  const [tab, setTab] = useState("users");
  const [users, setUsers] = useState(null);
  const [smtp, setSmtp] = useState(null);
  const [userModal, setUserModal] = useState(null); // { initial, isEdit } | null
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [testTo, setTestTo] = useState("");

  const load = () => {
    api.get("/admin/users").then((d) => setUsers(d.users)).catch((e) => setErr(e.message));
    api.get("/admin/smtp").then((d) => { setSmtp(d.config); setTestTo(user?.email || ""); }).catch(() => {});
  };
  useEffect(() => { load(); }, []);

  if (!user?.is_admin) return <Card>{t("Admin access required. Sign in as an administrator.")}</Card>;
  if (err && !users) return <Card>{err}</Card>;
  if (!users) return <Loading text="Loading users…" />;

  const flash = (m) => { setMsg(m); setErr(""); setTimeout(() => setMsg(""), 3500); };
  const toggle = async (u) => { await api.patch(`/admin/users/${encodeURIComponent(u.email)}`, { active: !u.active }); load(); };
  const del = async (u) => { try { await api.del(`/admin/users/${encodeURIComponent(u.email)}`); flash(t("Removed {email}", { email: u.email })); load(); } catch (e) { setErr(e.message); } };
  const sendOtp = async (u) => { const r = await api.post(`/admin/users/${encodeURIComponent(u.email)}/send-otp`, {}); flash(r.email_ok ? t("Code emailed to {email}", { email: u.email }) : t("Send failed: {detail}", { detail: r.detail })); };
  const testEmail = async () => { const r = await api.post("/admin/smtp/test", { to: testTo }); flash(r.ok ? t("Test email sent to {to}", { to: r.to }) : t("Failed: {detail}", { detail: r.detail })); };
  const saveSmtp = async () => { const r = await api.put("/admin/smtp", smtp); setSmtp(r.config); flash(t("SMTP settings saved")); };
  const onUserSaved = (m) => { setUserModal(null); flash(m); load(); };

  const TABS = [
    { v: "users", label: t("Users ({n})", { n: users.length }) },
    { v: "smtp", label: t("Email (SMTP)") },
    { v: "reports", label: t("AI reports") },
  ];

  return (
    <>
      <PageHeader title="Users & Email"
        sub="Control who can sign in, how mail is delivered, and which AI summaries go out on a schedule." />
      {msg && <div className="login-info" style={{ marginBottom: 12 }}>{msg}</div>}
      {err && <div className="login-err" style={{ marginBottom: 12 }}>{err}</div>}

      <div className="ua-tabs">
        {TABS.map((tb) => (
          <button key={tb.v} className={tab === tb.v ? "on" : ""} onClick={() => setTab(tb.v)}>{tb.label}</button>
        ))}
      </div>

      {tab === "users" && (
        <>
          <div className="ua-toolbar">
            <button className="btn primary" onClick={() => setUserModal({ initial: BLANK, isEdit: false })}>{t("＋ Add user")}</button>
            <span className="spacer" />
            <span className="ua-opt" style={{ fontSize: 12 }}>{users.length === 1 ? t("1 account") : t("{n} accounts", { n: users.length })}</span>
          </div>
          <Card pad={false} title={t("Users ({n})", { n: users.length })}>
            <div className="tbl-wrap">
              <table className="tbl">
                <thead><tr><th>{t("Email")}</th><th>{t("Name")}</th><th>{t("Persona")}</th><th>{t("Admin")}</th><th>{t("Status")}</th><th>{t("Last login")}</th><th>{t("Actions")}</th></tr></thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.email}>
                      <td className="mono" style={{ fontSize: 12 }}>{u.email}</td>
                      <td>{u.name}</td>
                      <td>{u.persona === "authority" ? t("Port Authority") : t("Terminal Operator")}</td>
                      <td>{u.is_admin ? "✓" : "—"}</td>
                      <td style={{ color: u.active ? "var(--good)" : "var(--muted)" }}>{u.active ? t("active") : t("disabled")}</td>
                      <td style={{ fontSize: 12 }}>{u.last_login ? String(u.last_login).slice(0, 16).replace("T", " ") : t("never")}</td>
                      <td style={{ whiteSpace: "nowrap" }}>
                        <button className="ua-a" onClick={() => setUserModal({ initial: { ...BLANK, ...u, password: "" }, isEdit: true })}>{t("edit")}</button>
                        <button className="ua-a" onClick={() => sendOtp(u)}>{t("send code")}</button>
                        <button className="ua-a" onClick={() => toggle(u)}>{u.active ? t("disable") : t("enable")}</button>
                        {!u.is_admin && <button className="ua-a del" onClick={() => del(u)}>{t("delete")}</button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
          <Hint>{t("Users sign in at the login screen with the “Email code” option — no password needed. Passwords remain only for the built-in demo accounts.")}</Hint>
        </>
      )}

      {tab === "smtp" && (
        <Card title="Email (SMTP)" cap="One-time sign-in codes, notifications and scheduled AI reports are all delivered through this server.">
          {smtp ? (
            <div className="ua-form" style={{ maxWidth: 520 }}>
              <label>{t("Host")}<input value={smtp.host || ""} onChange={(e) => setSmtp({ ...smtp, host: e.target.value })} /></label>
              <label>{t("Port")}<input value={smtp.port || ""} onChange={(e) => setSmtp({ ...smtp, port: e.target.value })} /></label>
              <label>{t("Username")}<input value={smtp.user || ""} onChange={(e) => setSmtp({ ...smtp, user: e.target.value })} /></label>
              <label>{t("Password")}<input type="password" value={smtp.password || ""} onChange={(e) => setSmtp({ ...smtp, password: e.target.value })} placeholder={t("unchanged")} /></label>
              <label>{t("From email")}<input value={smtp.from_email || ""} onChange={(e) => setSmtp({ ...smtp, from_email: e.target.value })} /></label>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <button className="btn primary" onClick={saveSmtp}>{t("Save SMTP")}</button>
                <input value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder={t("test recipient")} style={{ flex: 1, minWidth: 140 }} />
                <button className="btn" onClick={testEmail}>{t("Send test")}</button>
              </div>
            </div>
          ) : <Loading />}
        </Card>
      )}

      {tab === "reports" && <ReportSubscriptions />}

      {userModal && <UserModal initial={userModal.initial} isEdit={userModal.isEdit} onSaved={onUserSaved} onClose={() => setUserModal(null)} />}
    </>
  );
}
