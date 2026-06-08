// frontend/src/contexts/PreferencesContext.jsx
//
// Single source of truth for user preferences. Loads from /settings/preferences
// on mount, applies side effects (CSS variables, body classes, fmt helper config),
// and exposes a stable hook for components.
//
// Components that want to react to preference changes use usePrefs().
// Components that just need to read in callbacks can use the cached values
// via api.js's fmt helpers — they're kept in sync automatically.

import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { get, patch, setFmtPrefs } from '../utils/api';
import { useAuth } from './AuthContext';

const DEFAULTS = {
    // General
    currency_symbol:     '£',
    currency:            'GBP',
    date_format:         'en-GB',      // en-GB | en-US | iso | long
    first_day_of_week:   1,            // 0 = Sunday, 1 = Monday
    time_format:         '24h',        // 12h | 24h
    default_landing:     '/',          // any valid route
    confirm_destructive: true,         // wrap deletes in window.confirm

    // Appearance
    accent_colour:       '#7c6aff',
    density:             'normal',     // compact | normal | spacious
    font_scale:          1.0,          // 0.875 | 1.0 | 1.125

    // Dashboard widget toggles
    show_widget_checkin: true,
    show_widget_timer:   true,
    show_widget_habits:  true,
    show_widget_goals:   true,
    show_widget_finance: true,
    show_widget_mood:    true,
};

const PrefsCtx = createContext(null);

const COERCE = (key, val) => {
    if (val === undefined || val === null) return DEFAULTS[key];
    if (typeof DEFAULTS[key] === 'boolean') return val === true || val === 'true';
    if (typeof DEFAULTS[key] === 'number')  return Number(val);
    return val;
};

const applySideEffects = (prefs) => {
    const root = document.documentElement;
    root.style.setProperty('--accent',       prefs.accent_colour);
    root.style.setProperty('--accent-dim',   hexAlpha(prefs.accent_colour, 0.15));
    root.style.setProperty('--accent-glow',  hexAlpha(prefs.accent_colour, 0.30));

    const body = document.body;
    body.classList.remove('density-compact', 'density-normal', 'density-spacious');
    body.classList.add(`density-${prefs.density}`);

    body.classList.remove('fs-small', 'fs-normal', 'fs-large');
    body.classList.add(prefs.font_scale <= 0.9 ? 'fs-small' : prefs.font_scale >= 1.1 ? 'fs-large' : 'fs-normal');

    // Keep the fmt helpers in api.js in sync with the latest prefs
    setFmtPrefs({
        currency_symbol:   prefs.currency_symbol,
        date_format:       prefs.date_format,
        time_format:       prefs.time_format,
        first_day_of_week: prefs.first_day_of_week,
    });
};

// Convert #RRGGBB to rgba() with given alpha for CSS variable
function hexAlpha(hex, alpha) {
    if (!hex || hex[0] !== '#') return `rgba(124,106,255,${alpha})`;
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${alpha})`;
}

export const PreferencesProvider = ({ children }) => {
    const { isAuth } = useAuth();
    const [prefs, setPrefs]   = useState(DEFAULTS);
    const [loaded, setLoaded] = useState(false);

    // Initial load (and reload on login)
    useEffect(() => {
        if (!isAuth) return;
        let cancelled = false;
        (async () => {
            try {
                const data = await get('/settings/preferences');
                if (cancelled) return;
                const merged = { ...DEFAULTS };
                if (data && typeof data === 'object') {
                    for (const k of Object.keys(DEFAULTS)) {
                        if (data[k] !== undefined) merged[k] = COERCE(k, data[k]);
                    }
                }
                setPrefs(merged);
                applySideEffects(merged);
                setLoaded(true);
            } catch (e) {
                // Non-fatal — use defaults
                console.warn('[prefs] could not load, using defaults:', e.message);
                applySideEffects(DEFAULTS);
                setLoaded(true);
            }
        })();
        return () => { cancelled = true; };
    }, [isAuth]);

    // Apply side effects whenever prefs change after the initial load
    useEffect(() => {
        if (loaded) applySideEffects(prefs);
    }, [prefs, loaded]);

    const setPref = useCallback(async (key, value) => {
        const coerced = COERCE(key, value);
        const next = { ...prefs, [key]: coerced };
        setPrefs(next);
        try {
            await patch('/settings/preferences', { [key]: coerced });
        } catch (e) {
            console.error('[prefs] save failed:', e.message);
        }
    }, [prefs]);

    const setManyPrefs = useCallback(async (patchObj) => {
        const coercedPatch = {};
        for (const [k, v] of Object.entries(patchObj)) {
            coercedPatch[k] = COERCE(k, v);
        }
        const next = { ...prefs, ...coercedPatch };
        setPrefs(next);
        try {
            await patch('/settings/preferences', coercedPatch);
        } catch (e) {
            console.error('[prefs] save failed:', e.message);
        }
    }, [prefs]);

    const resetToDefaults = useCallback(async () => {
        setPrefs(DEFAULTS);
        try {
            await patch('/settings/preferences', DEFAULTS);
        } catch (e) {
            console.error('[prefs] reset failed:', e.message);
        }
    }, []);

    return (
        <PrefsCtx.Provider value={{ prefs, loaded, setPref, setManyPrefs, resetToDefaults, DEFAULTS }}>
            {children}
        </PrefsCtx.Provider>
    );
};

export const usePrefs = () => {
    const ctx = useContext(PrefsCtx);
    if (!ctx) throw new Error('usePrefs must be inside <PreferencesProvider>');
    return ctx;
};
