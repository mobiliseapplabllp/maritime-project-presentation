import { createSlice } from '@reduxjs/toolkit';

const storedMode = (() => { try { return localStorage.getItem('maritime-mode'); } catch { return null; } })();

const slice = createSlice({
  name: 'ui',
  initialState: { mode: storedMode === 'dark' ? 'dark' : 'light', snackbar: null },
  reducers: {
    toggleMode(state) {
      state.mode = state.mode === 'dark' ? 'light' : 'dark';
      try { localStorage.setItem('maritime-mode', state.mode); } catch { /* ignore */ }
    },
    notify(state, { payload }) {
      state.snackbar = typeof payload === 'string' ? { message: payload, severity: 'success' } : payload;
    },
    clearSnackbar(state) { state.snackbar = null; },
  },
});

export const { toggleMode, notify, clearSnackbar } = slice.actions;
export default slice.reducer;
