import React, { useState } from "react";
import { useAuth } from "../lib/auth.jsx";
import { api } from "../lib/api.js";
import { useLang } from "../lib/i18n.jsx";

const DEMO = [
  { u: "harbour.master", r: "Harbour Master · Port Administrator" },
  { u: "head.container", r: "Head — Container Business · Container zone" },
  { u: "tm.mict", r: "Terminal Manager — MICT" },
  { u: "hse.chief", r: "Chief — HSE & Environment" },
  { u: "finance", r: "Controller — Revenue & Billing" },
  { u: "analyst", r: "Data Analyst — Port MIS" },
];
const PW = "Demo@2026";

export default function Login() {
  const { t } = useLang();
  const { login, loginOtp } = useAuth();
  const [mode, setMode] = useState("otp"); // otp | password
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [info, setInfo] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setErr(""); setBusy(true);
    try {
      await login(username, password);
    } catch (ex) {
      setErr(ex.message || t("Sign-in failed"));
    } finally {
      setBusy(false);
    }
  };

  const requestOtp = async (e) => {
    e.preventDefault();
    setErr(""); setInfo(""); setBusy(true);
    try {
      const r = await api.otpRequest(email);
      if (r.sent === false) {
        setErr(r.message || t("No account found for that email. Ask your administrator to add you."));
        return;
      }
      setOtpSent(true);
      setInfo(r.email_ok === false ? t("Code generated, but email delivery failed — ask your admin.")
        : t("A 6-digit code has been emailed. Enter it below."));
    } catch (ex) { setErr(ex.message || t("Could not send code")); }
    finally { setBusy(false); }
  };
  const verifyOtp = async (e) => {
    e.preventDefault();
    setErr(""); setBusy(true);
    try { await loginOtp(email, code); }
    catch (ex) { setErr(ex.message || t("Invalid or expired code")); }
    finally { setBusy(false); }
  };

  return (
    <div className="login-wrap">
      <div className="login-hero">
        <div>
          <div className="mark">◈</div>
          <h1>{t("Maritime AI Analytics")}</h1>
          <p>{t("Maritime AI analytics — vessel traffic and berth performance, pre-berthing waits and turnarounds, HSE incidents and revenue, with an assistant that cites its sources.")}</p>
        </div>
        <div>
          <div className="stat"><b>Maritime AI Analytics</b> · Reference deployment</div>
          <div className="stat" style={{ marginTop: 6 }}>
            <b>31</b> {t("vessels")} · <b>24</b> {t("berths")} · <b>10</b> {t("terminals")} · <b>3</b> {t("zones")}
          </div>
        </div>
      </div>
      <div className="login-panel">
        <div className="login-form">
          <h2>{t("Sign in")}</h2>
          <div className="login-modes">
            <button className={mode === "otp" ? "on" : ""} onClick={() => { setMode("otp"); setErr(""); }}>{t("Email code")}</button>
            <button className={mode === "password" ? "on" : ""} onClick={() => { setMode("password"); setErr(""); }}>{t("Password")}</button>
          </div>
          {err && <div className="login-err">{err}</div>}
          {info && <div className="login-info">{info}</div>}

          {mode === "otp" ? (
            !otpSent ? (
              <form onSubmit={requestOtp}>
                <div className="sub">{t("Enter your work email — we'll send a one-time sign-in code.")}</div>
                <div className="field">
                  <label>{t("Email")}</label>
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email" placeholder="you@organisation.com" autoFocus />
                </div>
                <button className="btn primary full" disabled={busy || !email}>{busy ? t("Sending…") : t("Send code")}</button>
              </form>
            ) : (
              <form onSubmit={verifyOtp}>
                <div className="sub">{t("Enter the 6-digit code sent to {email}.", { email })}</div>
                <div className="field">
                  <label>{t("Sign-in code")}</label>
                  <input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    inputMode="numeric" placeholder="000000" autoFocus
                    style={{ letterSpacing: "6px", fontFamily: "monospace", fontSize: 18 }} />
                </div>
                <button className="btn primary full" disabled={busy || code.length < 6}>{busy ? t("Verifying…") : t("Verify & sign in")}</button>
                <div className="login-alt" onClick={() => { setOtpSent(false); setCode(""); setInfo(""); }}>{t("← use a different email")}</div>
              </form>
            )
          ) : (
            <form onSubmit={submit}>
              <div className="sub">{t("Username & password (demo / legacy accounts).")}</div>
              <div className="field">
                <label>{t("Username or email")}</label>
                <input value={username} onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username" placeholder={t("e.g. harbour.master")} autoFocus />
              </div>
              <div className="field">
                <label>{t("Password")}</label>
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password" placeholder="••••••••" />
              </div>
              <button className="btn primary full" disabled={busy}>{busy ? t("Signing in…") : t("Sign in")}</button>
              <div className="demo-accts">
                <div className="h">{t("Demo accounts — click to fill (password: {pw})", { pw: PW })}</div>
                {DEMO.map((d) => (
                  <div className="demo-acct" key={d.u} onClick={() => { setUsername(d.u); setPassword(PW); }}>
                    <span className="mono">{d.u}</span><span className="r">{t(d.r)}</span>
                  </div>
                ))}
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
