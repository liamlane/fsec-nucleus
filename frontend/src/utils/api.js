const BASE = import.meta.env.VITE_API_URL || '/api';

export const api = async (path, options = {}) => {
  const token = localStorage.getItem('nucleus_token');
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (res.status === 401) {
    localStorage.removeItem('nucleus_token');
    window.location.href = '/login';
    return;
  }
  if (res.status === 204) return null;
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
};

export const get = (path) => api(path, { method: 'GET' });
export const post = (path, body) => api(path, { method: 'POST', body });
export const patch = (path, body) => api(path, { method: 'PATCH', body });
export const del = (path) => api(path, { method: 'DELETE' });

export const fmt = {
  currency: (n, currency = 'GBP') =>
    new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(n),
  date: (d) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
  dateShort: (d) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
  percent: (n, t) => t > 0 ? Math.round((n / t) * 100) : 0,
  duration: (s) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  },
};
