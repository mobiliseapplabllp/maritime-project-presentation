import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
dayjs.extend(relativeTime);

export const fmtDT = (d) => (d ? dayjs(d).format('DD MMM YYYY, HH:mm') : '—');
export const fmtD = (d) => (d ? dayjs(d).format('DD MMM YYYY') : '—');
export const fromNow = (d) => (d ? dayjs(d).fromNow() : '—');
export const fmtNum = (n) => (n === null || n === undefined ? '—' : new Intl.NumberFormat('en-IN').format(Math.round(n)));
export const fmtINR = (n) => (n === null || n === undefined ? '—' : new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(n));
export const fmtINRShort = (n) => {
  if (n === null || n === undefined) return '—';
  const abs = Math.abs(n);
  if (abs >= 1e7) return `₹${(n / 1e7).toFixed(2)} Cr`;
  if (abs >= 1e5) return `₹${(n / 1e5).toFixed(1)} L`;
  return `₹${new Intl.NumberFormat('en-IN').format(Math.round(n))}`;
};
export const fmtMT = (n) => {
  if (n === null || n === undefined) return '—';
  if (Math.abs(n) >= 1e6) return `${(n / 1e6).toFixed(2)} M MT`;
  if (Math.abs(n) >= 1e3) return `${(n / 1e3).toFixed(1)}k MT`;
  return `${fmtNum(n)} MT`;
};
export const toInputDT = (d) => (d ? dayjs(d).format('YYYY-MM-DDTHH:mm') : '');
export const toInputD = (d) => (d ? dayjs(d).format('YYYY-MM-DD') : '');
