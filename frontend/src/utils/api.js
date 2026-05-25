// frontend/src/utils/api.js
const API_BASE = import.meta.env.VITE_API_URL || '/api';

function getToken() {
    return localStorage.getItem('nucleus_token');
}

async function request(endpoint, options = {}) {
    const token = getToken();
    const headers = {
        'Content-Type': 'application/json',
        ...options.headers,
    };
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await fetch(`${API_BASE}${endpoint}`, {
        ...options,
        headers,
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `HTTP ${res.status}`);
    }
    // Check for empty response (204 No Content or zero-length body)
    const contentLength = res.headers.get('content-length');
    if (res.status === 204 || (contentLength && contentLength === '0')) {
        return null;
    }
    const text = await res.text();
    if (!text) return null;
    try {
        return JSON.parse(text);
    } catch (e) {
        // If it's not JSON (e.g., plain text), return as is
        return text;
    }
}

export const get = (endpoint) => request(endpoint);
export const post = (endpoint, body) => request(endpoint, { method: 'POST', body: JSON.stringify(body) });
export const patch = (endpoint, body) => request(endpoint, { method: 'PATCH', body: JSON.stringify(body) });
export const del = (endpoint) => request(endpoint, { method: 'DELETE' });

export const fmt = {
    date: (iso) => new Date(iso).toLocaleDateString('en-GB'),
    dateShort: (iso) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
    duration: (secs) => {
        const h = Math.floor(secs / 3600);
        const m = Math.floor((secs % 3600) / 60);
        return h ? `${h}h ${m}m` : `${m}m`;
    },
    currency: (amount, currencySymbol = '£') => {
        const num = Number(amount);
        if (isNaN(num)) return `${currencySymbol}0.00`;
        return `${currencySymbol}${num.toFixed(2)}`;
    },
};