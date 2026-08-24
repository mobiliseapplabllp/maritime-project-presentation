import React, { createContext, useContext, useEffect, useState } from "react";
import { api, setToken, getToken } from "./api.js";

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    async function boot() {
      if (getToken()) {
        try {
          const u = await api.me();
          if (alive) setUser(u);
        } catch (e) {
          setToken(null);
        }
      }
      if (alive) setLoading(false);
    }
    boot();
    const onLogout = () => setUser(null);
    window.addEventListener("sagar-logout", onLogout);
    return () => { alive = false; window.removeEventListener("sagar-logout", onLogout); };
  }, []);

  const login = async (username, password) => {
    const res = await api.login(username, password);
    setToken(res.access_token);
    setUser(res.user);
    return res.user;
  };
  const loginOtp = async (email, code) => {
    const res = await api.otpVerify(email, code);
    setToken(res.access_token);
    setUser(res.user);
    return res.user;
  };
  const logout = () => { setToken(null); setUser(null); };

  return (
    <AuthCtx.Provider value={{ user, loading, login, loginOtp, logout }}>
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);
