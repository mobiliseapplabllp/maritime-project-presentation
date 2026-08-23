import { createSlice } from '@reduxjs/toolkit';

const stored = (() => {
  try { return JSON.parse(localStorage.getItem('mundra-session') || 'null'); } catch { return null; }
})();

const slice = createSlice({
  name: 'auth',
  initialState: { user: stored?.user || null, token: stored?.token || null, refreshToken: stored?.refreshToken || null },
  reducers: {
    setSession(state, { payload }) {
      state.user = payload.user; state.token = payload.token; state.refreshToken = payload.refreshToken;
      try { localStorage.setItem('mundra-session', JSON.stringify(payload)); } catch { /* ignore */ }
    },
    updateUser(state, { payload }) {
      state.user = payload;
      try { localStorage.setItem('mundra-session', JSON.stringify({ user: state.user, token: state.token, refreshToken: state.refreshToken })); } catch { /* ignore */ }
    },
    clearSession(state) {
      state.user = null; state.token = null; state.refreshToken = null;
      try { localStorage.removeItem('mundra-session'); } catch { /* ignore */ }
    },
  },
});

export const { setSession, updateUser, clearSession } = slice.actions;
export default slice.reducer;
