import axios from 'axios';
import { store } from '../store';
import { setSession, clearSession } from '../store/authSlice';
import { busyStart, busyEnd } from './busy';

const api = axios.create({ baseURL: '/api' });

const quiet = (config) => config?.headers?.['X-Quiet'];

api.interceptors.request.use((config) => {
  if (!quiet(config)) busyStart();
  const { token } = store.getState().auth;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let refreshing = null;
api.interceptors.response.use(
  (res) => { if (!quiet(res.config)) busyEnd(); return res.data; },
  async (err) => {
    if (!quiet(err.config)) busyEnd();
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
    const wrapped = new Error(message);
    wrapped.status = status;
    wrapped.payload = err.response?.data;
    return Promise.reject(wrapped);
  },
);

export default api;
