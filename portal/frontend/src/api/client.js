import axios from 'axios';
import { store } from '../store';
import { setSession, clearSession } from '../store/authSlice';
import { busyStart, busyEnd } from './busy';

const api = axios.create({ baseURL: '/api' });

api.interceptors.request.use((config) => {
  busyStart();
  const { token } = store.getState().auth;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let refreshing = null;
api.interceptors.response.use(
  (res) => { busyEnd(); return res.data; },
  async (err) => {
    busyEnd();
    const original = err.config;
    const status = err.response?.status;
    if (status === 401 && !original._retried && !original.url.includes('/auth/')) {
      original._retried = true;
      const { refreshToken } = store.getState().auth;
      if (refreshToken) {
        try {
          refreshing = refreshing || axios.post('/api/auth/refresh', { refreshToken });
          const { data } = await refreshing;
          refreshing = null;
          store.dispatch(setSession(data.data));
          original.headers.Authorization = `Bearer ${data.data.token}`;
          return api(original);
        } catch { refreshing = null; store.dispatch(clearSession()); }
      } else store.dispatch(clearSession());
    }
    const message = err.response?.data?.message || err.message || 'Request failed';
    return Promise.reject(new Error(message));
  },
);

export default api;
