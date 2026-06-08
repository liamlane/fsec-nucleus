// frontend/src/utils/api.js
//
// Thin fetch wrapper + formatting helpers.
// fmt.* helpers honour user preferences set via PreferencesContext, falling
// back to sensible defaults when prefs aren't loaded yet.

const API_BASE = import.meta.env.VITE_API_URL || '/api';

function getToken() {
    return localStorage.getItem('nucleus_token');
}

function handleAuthFailure() {
    localStorage.removeItem('nucleus_token');
    if (window.location.pathname !== '/login') {
        window.location.href = '/login';
    }
}

async function request(endpoint, options = {}) {
    const token = getToken();
    const headers = {
        'Content-Type': 'application/json',
        ...options.headers,
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`${API_BASE}${endpoint}`, { ...options, headers });

    if (res.status === 401) {
        handleAuthFailure();
        throw new Error('Session expired — please log in again');
    }

    if (!res.ok) {
        const text = await res.text();
        try {
            const parsed = JSON.parse(text);
            throw new Error(parsed.error || `HTTP ${res.status}`);
        } catch {
            throw new Error(text || `HTTP ${res.status}`);
        }
    }

    const contentLength = res.headers.get('content-length');
    if (res.status === 204 || (contentLength && contentLength === '0')) return null;
    const text = await res.text();
    if (!text) return null;
    try { return JSON.parse(text); } catch { return text; }
}

export const get   = (endpoint)       => request(endpoint);
export const post  = (endpoint, body) => request(endpoint, { method: 'POST',   body: JSON.stringify(body) });
export const patch = (endpoint, body) => request(endpoint, { method: 'PATCH',  body: JSON.stringify(body) });
export const del   = (endpoint)       => request(endpoint, { method: 'DELETE' });

// ── Formatting prefs (set by PreferencesContext) ────────────────────────
let fmtPrefs = {
    currency_symbol:   '£',
    date_format:       'en-GB',
    time_format:       '24h',
    first_day_of_week: 1,
};

export function setFmtPrefs(next) {
    fmtPrefs = { ...fmtPrefs, ...next };
}

export function getFmtPrefs() {
    return { ...fmtPrefs };
}

// ── Confirm helper for destructive actions ──────────────────────────────
// Components call: `if (!confirmDestructive('Delete?')) return;`
// Honours the `confirm_destructive` preference — when off, returns true without prompting.
let confirmEnabled = true;
export function setConfirmDestructive(enabled) { confirmEnabled = !!enabled; }
export function confirmDestructive(message) {
    if (!confirmEnabled) return true;
    return window.confirm(message);
}

// ── Date formatting ─────────────────────────────────────────────────────
function formatDate(iso, kind = 'full') {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';

    const f = fmtPrefs.date_format;
    if (f === 'iso') {
        return d.toISOString().split('T')[0];
    }
    if (f === 'long') {
        return kind === 'short'
            ? d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
            : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    }
    const locale = f === 'en-US' ? 'en-US' : 'en-GB';
    return kind === 'short'
        ? d.toLocaleDateString(locale, { day: 'numeric', month: 'short' })
        : d.toLocaleDateString(locale);
}

function formatTime(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleTimeString(fmtPrefs.date_format === 'en-US' ? 'en-US' : 'en-GB', {
        hour:   '2-digit',
        minute: '2-digit',
        hour12: fmtPrefs.time_format === '12h',
    });
}

function formatDateTime(iso) {
    if (!iso) return '';
    return `${formatDate(iso)} ${formatTime(iso)}`;
}

// ── fmt helpers ─────────────────────────────────────────────────────────
export const fmt = {
    date:      (iso) => formatDate(iso, 'full'),
    dateShort: (iso) => formatDate(iso, 'short'),
    time:      (iso) => formatTime(iso),
    dateTime:  (iso) => formatDateTime(iso),
    duration:  (secs) => {
        const h = Math.floor(secs / 3600);
        const m = Math.floor((secs % 3600) / 60);
        return h ? `${h}h ${m}m` : `${m}m`;
    },
    currency: (amount, overrideSymbol) => {
        const num = Number(amount);
        if (isNaN(num)) return `${overrideSymbol || fmtPrefs.currency_symbol}0.00`;
        return `${overrideSymbol || fmtPrefs.currency_symbol}${num.toFixed(2)}`;
    },
    percent: (n, total) => {
        const num = Number(n), tot = Number(total);
        if (!tot || isNaN(num) || isNaN(tot)) return 0;
        return Math.round((num / tot) * 100);
    },
};
