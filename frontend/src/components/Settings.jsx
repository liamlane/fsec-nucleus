import { useEffect, useState } from 'react';
import { get, post, patch, del, fmt, setConfirmDestructive } from '../utils/api';
import { usePrefs } from '../contexts/PreferencesContext';
import { useAuth } from '../contexts/AuthContext';

const TABS = ['General', 'Appearance', 'Security', 'Data', 'Reference', 'About'];

const LANDING_OPTIONS = [
  { value: '/',           label: 'Dashboard' },
  { value: '/finance',    label: 'Finance' },
  { value: '/business',   label: 'Business' },
  { value: '/marketing',  label: 'Marketing' },
  { value: '/goals',      label: 'Goals' },
  { value: '/habits',     label: 'Habits' },
  { value: '/trackers',   label: 'Trackers' },
  { value: '/notes',      label: 'Notes' },
  { value: '/calendar',   label: 'Calendar' },
  { value: '/journal',    label: 'Journal' },
  { value: '/time',       label: 'Time' },
];

const ACCENT_PRESETS = [
  { value: '#7c6aff', name: 'Purple (default)' },
  { value: '#10d98f', name: 'Green' },
  { value: '#4da6ff', name: 'Blue' },
  { value: '#ff6eb4', name: 'Pink' },
  { value: '#ffb547', name: 'Amber' },
  { value: '#ff4d6d', name: 'Red' },
  { value: '#E97132', name: 'Lyon orange' },
];

const DATE_FORMATS = [
  { value: 'en-GB', label: 'DD/MM/YYYY (UK)' },
  { value: 'en-US', label: 'MM/DD/YYYY (US)' },
  { value: 'iso',   label: 'YYYY-MM-DD (ISO)' },
  { value: 'long',  label: '1 March 2026 (long)' },
];

const CURRENCY_SYMBOLS = ['£', '$', '€', '¥', 'kr', 'CHF', 'A$', 'C$'];

export default function Settings() {
  const { prefs, setPref, setManyPrefs, resetToDefaults, DEFAULTS } = usePrefs();
  const { logout } = useAuth();
  const [tab, setTab] = useState('General');

  // Keep the api.js confirm helper in sync with the pref
  useEffect(() => { setConfirmDestructive(prefs.confirm_destructive); }, [prefs.confirm_destructive]);

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1>Settings</h1>
          <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Customise Nucleus to your taste.</div>
        </div>
      </div>

      <div className="tabs" style={{ display: 'flex', gap: 4, marginBottom: 24, borderBottom: '1px solid var(--border)', overflowX: 'auto' }}>
        {TABS.map(t => (
          <button key={t}
            onClick={() => setTab(t)}
            style={{
              padding: '10px 16px',
              background: 'transparent',
              border: 'none',
              borderBottom: tab === t ? '2px solid var(--accent)' : '2px solid transparent',
              color: tab === t ? 'var(--text-primary)' : 'var(--text-muted)',
              fontSize: 14, fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap',
              transition: 'all 0.15s',
            }}>{t}</button>
        ))}
      </div>

      {tab === 'General'    && <GeneralTab    prefs={prefs} setPref={setPref} />}
      {tab === 'Appearance' && <AppearanceTab prefs={prefs} setPref={setPref} resetToDefaults={resetToDefaults} DEFAULTS={DEFAULTS} />}
      {tab === 'Security'   && <SecurityTab   logout={logout} />}
      {tab === 'Data'       && <DataTab />}
      {tab === 'Reference'  && <ReferenceTab />}
      {tab === 'About'      && <AboutTab />}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
// GENERAL TAB
// ════════════════════════════════════════════════════════════════════════
function GeneralTab({ prefs, setPref }) {
  const today = new Date().toISOString();
  return (
    <div style={{ maxWidth: 720 }}>
      <Section title="Regional">
        <Row label="Currency symbol" hint="Used throughout the app for all monetary values.">
          <select value={prefs.currency_symbol} onChange={e => setPref('currency_symbol', e.target.value)} style={{ maxWidth: 200 }}>
            {CURRENCY_SYMBOLS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </Row>
        <Row label="Date format" hint={`Preview: ${fmt.date(today)}`}>
          <select value={prefs.date_format} onChange={e => setPref('date_format', e.target.value)} style={{ maxWidth: 280 }}>
            {DATE_FORMATS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </Row>
        <Row label="Time format" hint={`Preview: ${fmt.time(today)}`}>
          <Toggle options={[{ v: '24h', l: '24-hour' }, { v: '12h', l: '12-hour' }]}
                  value={prefs.time_format} onChange={v => setPref('time_format', v)} />
        </Row>
        <Row label="First day of week" hint="Affects week views in Calendar and Habits.">
          <Toggle options={[{ v: 1, l: 'Monday' }, { v: 0, l: 'Sunday' }]}
                  value={prefs.first_day_of_week} onChange={v => setPref('first_day_of_week', v)} />
        </Row>
      </Section>

      <Section title="Behaviour">
        <Row label="Default landing page" hint="Where you go when opening the app or clicking the logo.">
          <select value={prefs.default_landing} onChange={e => setPref('default_landing', e.target.value)} style={{ maxWidth: 280 }}>
            {LANDING_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </Row>
        <Row label="Confirm before deleting" hint="Show a confirmation dialog before destructive actions.">
          <Toggle options={[{ v: true, l: 'On' }, { v: false, l: 'Off' }]}
                  value={prefs.confirm_destructive} onChange={v => setPref('confirm_destructive', v)} />
        </Row>
      </Section>

      <Section title="Dashboard widgets" hint="Hide widgets you don't use.">
        <WidgetToggle k="show_widget_checkin" label="Daily check-in card" prefs={prefs} setPref={setPref} />
        <WidgetToggle k="show_widget_timer"   label="Running timer card"  prefs={prefs} setPref={setPref} />
        <WidgetToggle k="show_widget_habits"  label="Today's habits"      prefs={prefs} setPref={setPref} />
        <WidgetToggle k="show_widget_goals"   label="Active goals"        prefs={prefs} setPref={setPref} />
        <WidgetToggle k="show_widget_finance" label="Finance summary"     prefs={prefs} setPref={setPref} />
        <WidgetToggle k="show_widget_mood"    label="Mood trend"          prefs={prefs} setPref={setPref} />
      </Section>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
// APPEARANCE TAB
// ════════════════════════════════════════════════════════════════════════
function AppearanceTab({ prefs, setPref, resetToDefaults, DEFAULTS }) {
  const [customColour, setCustomColour] = useState(prefs.accent_colour);

  return (
    <div style={{ maxWidth: 720 }}>
      <Section title="Accent colour" hint="Used for buttons, highlights, and active states.">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
          {ACCENT_PRESETS.map(c => (
            <button key={c.value}
              onClick={() => { setPref('accent_colour', c.value); setCustomColour(c.value); }}
              title={c.name}
              style={{
                width: 44, height: 44, borderRadius: 10,
                background: c.value,
                border: prefs.accent_colour === c.value ? '3px solid var(--text-primary)' : '3px solid transparent',
                cursor: 'pointer',
                transition: 'transform 0.1s',
              }}
            />
          ))}
        </div>
        <Row label="Custom colour" hint="Or pick any hex value.">
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input type="color" value={customColour}
                   onChange={e => setCustomColour(e.target.value)}
                   style={{ width: 50, height: 36, padding: 0, border: 'none', background: 'transparent' }} />
            <input type="text" value={customColour}
                   onChange={e => setCustomColour(e.target.value)}
                   placeholder="#7c6aff"
                   style={{ width: 110, fontFamily: 'var(--font-mono)' }} />
            <button className="btn btn-ghost btn-sm"
                    onClick={() => setPref('accent_colour', customColour)}
                    disabled={!/^#[0-9a-fA-F]{6}$/.test(customColour)}>Apply</button>
          </div>
        </Row>
      </Section>

      <Section title="Density" hint="Tighter or looser spacing throughout the app.">
        <Toggle
          options={[{ v: 'compact', l: 'Compact' }, { v: 'normal', l: 'Normal' }, { v: 'spacious', l: 'Spacious' }]}
          value={prefs.density}
          onChange={v => setPref('density', v)} />
      </Section>

      <Section title="Font size" hint="Make text bigger or smaller.">
        <Toggle
          options={[{ v: 0.875, l: 'Small' }, { v: 1.0, l: 'Normal' }, { v: 1.125, l: 'Large' }]}
          value={prefs.font_scale}
          onChange={v => setPref('font_scale', v)} />
      </Section>

      <div style={{ marginTop: 32, padding: 16, background: 'rgba(255,77,109,0.08)', border: '1px solid rgba(255,77,109,0.2)', borderRadius: 8 }}>
        <div style={{ fontSize: 13, marginBottom: 10 }}>Reset all appearance preferences to defaults.</div>
        <button className="btn btn-ghost"
                onClick={() => {
                  if (window.confirm('Reset ALL preferences (including general settings) to defaults?')) {
                    resetToDefaults();
                  }
                }}>Reset all preferences</button>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
// SECURITY TAB
// ════════════════════════════════════════════════════════════════════════
function SecurityTab({ logout }) {
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin]         = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [status, setStatus]         = useState(null);

  const submit = async () => {
    setStatus(null);
    if (newPin !== confirmPin) {
      setStatus({ kind: 'err', message: 'New PINs do not match.' }); return;
    }
    if (!/^\d{4,8}$/.test(newPin)) {
      setStatus({ kind: 'err', message: 'PIN must be 4–8 digits.' }); return;
    }
    try {
      const r = await post('/settings/change-pin', { current_pin: currentPin, new_pin: newPin });
      setStatus({ kind: 'ok', message: r.note || 'PIN hash generated — see below.', hash: r.hash });
      setCurrentPin(''); setNewPin(''); setConfirmPin('');
    } catch (e) {
      setStatus({ kind: 'err', message: e.message });
    }
  };

  return (
    <div style={{ maxWidth: 720 }}>
      <Section title="Change PIN" hint="Replaces your login PIN. The new hash must be copied into your .env on the server.">
        <Row label="Current PIN">
          <input type="password" value={currentPin} onChange={e => setCurrentPin(e.target.value)} style={{ maxWidth: 200 }} />
        </Row>
        <Row label="New PIN" hint="4–8 digits.">
          <input type="password" value={newPin} onChange={e => setNewPin(e.target.value)} style={{ maxWidth: 200 }} />
        </Row>
        <Row label="Confirm new PIN">
          <input type="password" value={confirmPin} onChange={e => setConfirmPin(e.target.value)} style={{ maxWidth: 200 }} />
        </Row>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
          <button className="btn btn-primary" onClick={submit} disabled={!currentPin || !newPin || !confirmPin}>Generate new PIN hash</button>
        </div>

        {status && (
          <div style={{ marginTop: 16, padding: 12, borderRadius: 6, fontSize: 13,
            background: status.kind === 'ok' ? 'rgba(16,217,143,0.10)' : 'rgba(255,77,109,0.10)',
            border: `1px solid ${status.kind === 'ok' ? 'rgba(16,217,143,0.3)' : 'rgba(255,77,109,0.3)'}`,
            color: status.kind === 'ok' ? 'var(--green)' : 'var(--red)' }}>
            <div>{status.message}</div>
            {status.hash && (
              <div style={{ marginTop: 12, padding: 10, background: 'var(--bg-secondary)', borderRadius: 4, fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-primary)', wordBreak: 'break-all', userSelect: 'all' }}>
                {status.hash}
              </div>
            )}
            {status.hash && (
              <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text-secondary)' }}>
                Add to <code>/mnt/FSec-Data/data/nucleus/.env</code> as <code>PIN_HASH='{status.hash}'</code> (with single quotes), then restart the backend container.
              </div>
            )}
          </div>
        )}
      </Section>

      <Section title="Session">
        <Row label="Log out of this device" hint="Clears your token from this browser only.">
          <button className="btn btn-ghost" onClick={() => { if (window.confirm('Log out now?')) logout(); }}>Log out</button>
        </Row>
      </Section>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
// DATA TAB — export, log viewer, log purge
// ════════════════════════════════════════════════════════════════════════
function DataTab() {
  const [exporting, setExporting] = useState(false);
  const [logs, setLogs]           = useState([]);
  const [logLevel, setLogLevel]   = useState('');
  const [logModule, setLogModule] = useState('');

const loadLogs = async () => {
    const params = new URLSearchParams();
    params.set('limit', '100');
    if (logLevel)  params.set('level',  logLevel);
    if (logModule) params.set('module', logModule);
    try {
      const data = await get(`/settings/logs?${params}`);
      if (Array.isArray(data))       setLogs(data);
      else if (data && data.logs)    setLogs(data.logs);
      else                           setLogs([]);
    } catch (e) {
      console.error('[logs] load failed:', e.message);
      setLogs([]);
    }
  };

  useEffect(() => { loadLogs(); }, [logLevel, logModule]);

  const handleExport = async () => {
    setExporting(true);
    try {
      const token = localStorage.getItem('nucleus_token');
      const resp = await fetch('/api/settings/export', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!resp.ok) throw new Error('Export failed');
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `nucleus-export-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert('Export failed: ' + e.message);
    } finally {
      setExporting(false);
    }
  };

  const purgeLogs = async () => {
    const days = window.prompt('Purge logs older than how many days?', '30');
    if (!days) return;
    await del(`/settings/logs?older_than_days=${parseInt(days, 10) || 30}`);
    loadLogs();
  };

  const levelColour = (lvl) => ({
    error: 'var(--red)', warn: 'var(--amber)', info: 'var(--text-secondary)', debug: 'var(--text-muted)',
  }[lvl] || 'var(--text-muted)');

  return (
    <div style={{ maxWidth: 960 }}>
      <Section title="Export your data" hint="Download a complete JSON dump of all your Nucleus data — keep a copy off the host.">
        <button className="btn btn-primary" onClick={handleExport} disabled={exporting}>
          {exporting ? 'Preparing…' : 'Download full export (JSON)'}
        </button>
      </Section>

      <Section title="Application logs" hint="Server-side events. Useful for debugging.">
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          <select value={logLevel} onChange={e => setLogLevel(e.target.value)} style={{ maxWidth: 140 }}>
            <option value="">All levels</option>
            <option value="error">Error</option>
            <option value="warn">Warn</option>
            <option value="info">Info</option>
            <option value="debug">Debug</option>
          </select>
          <input placeholder="Filter by module" value={logModule} onChange={e => setLogModule(e.target.value)} style={{ maxWidth: 200 }} />
          <button className="btn btn-ghost btn-sm" onClick={loadLogs}>Refresh</button>
          <button className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto' }} onClick={purgeLogs}>Purge old logs…</button>
        </div>
        <div className="card" style={{ padding: 0, maxHeight: 500, overflow: 'auto' }}>
          <table>
            <thead><tr><th style={{ width: 150 }}>Time</th><th style={{ width: 70 }}>Level</th><th style={{ width: 110 }}>Module</th><th>Message</th></tr></thead>
            <tbody>
              {logs.length === 0 && <tr><td colSpan="4" style={{ textAlign: 'center', padding: 20, color: 'var(--text-muted)' }}>No logs match these filters</td></tr>}
              {logs.map(l => (
                <tr key={l.id}>
                  <td style={{ fontSize: 11, fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>{fmt.dateTime(l.created_at)}</td>
                  <td style={{ fontSize: 11, fontWeight: 600, color: levelColour(l.level), textTransform: 'uppercase' }}>{l.level}</td>
                  <td style={{ fontSize: 11, color: 'var(--text-muted)' }}>{l.module || '—'}</td>
                  <td style={{ fontSize: 12 }}>{l.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
// REFERENCE TAB — life areas, categories, notebooks
// ════════════════════════════════════════════════════════════════════════
function ReferenceTab() {
  const [sub, setSub] = useState('life-areas');
  return (
    <div>
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, background: 'var(--bg-secondary)', borderRadius: 8, padding: 3, maxWidth: 480 }}>
        {[
          { v: 'life-areas', l: 'Life areas' },
          { v: 'categories', l: 'Categories' },
          { v: 'notebooks',  l: 'Notebooks' },
        ].map(o => (
          <button key={o.v} onClick={() => setSub(o.v)} style={{
            flex: 1, padding: '8px 12px', borderRadius: 6, fontSize: 13, fontWeight: 500,
            background: sub === o.v ? 'var(--bg-card)' : 'transparent',
            color:      sub === o.v ? 'var(--text-primary)' : 'var(--text-muted)',
            border: 'none', cursor: 'pointer',
          }}>{o.l}</button>
        ))}
      </div>

      {sub === 'life-areas' && <ReferenceList kind="life-areas" label="Life area"
        fields={[{ k: 'name', label: 'Name' }, { k: 'colour', label: 'Colour', type: 'color' }, { k: 'icon', label: 'Icon', placeholder: '🎯' }]} />}
      {sub === 'categories' && <ReferenceList kind="categories" label="Category"
        fields={[{ k: 'name', label: 'Name' }, { k: 'type', label: 'Type', type: 'select', options: ['expense', 'income'] }, { k: 'colour', label: 'Colour', type: 'color' }, { k: 'icon', label: 'Icon', placeholder: '🛒' }]} />}
      {sub === 'notebooks' && <ReferenceList kind="notebooks" label="Notebook"
        fields={[{ k: 'name', label: 'Name' }, { k: 'colour', label: 'Colour', type: 'color' }, { k: 'icon', label: 'Icon', placeholder: '📓' }]} />}
    </div>
  );
}

function ReferenceList({ kind, label, fields }) {
  const [items, setItems] = useState([]);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});

  const load = async () => {
    const data = await get(`/settings/${kind}`);
    if (data) setItems(data);
  };
  useEffect(() => { load(); }, [kind]);

  const startNew = () => {
    const init = {};
    for (const f of fields) {
      if (f.type === 'color') init[f.k] = '#7c6aff';
      else if (f.type === 'select') init[f.k] = f.options[0];
      else init[f.k] = '';
    }
    setEditing('new');
    setForm(init);
  };
  const startEdit = (it) => { setEditing(it.id); setForm(it); };
  const cancel    = () => { setEditing(null); setForm({}); };
  const save = async () => {
    if (editing === 'new') await post(`/settings/${kind}`,            form);
    else                   await patch(`/settings/${kind}/${editing}`, form);
    setEditing(null); setForm({}); load();
  };
  const remove = async (id) => {
    if (!window.confirm(`Delete this ${label.toLowerCase()}?`)) return;
    await del(`/settings/${kind}/${id}`);
    load();
  };

  return (
    <div style={{ maxWidth: 720 }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <button className="btn btn-primary" onClick={startNew}>+ New {label.toLowerCase()}</button>
      </div>
      <div className="card" style={{ padding: 0 }}>
        <table>
          <thead><tr>{fields.map(f => <th key={f.k}>{f.label}</th>)}<th></th></tr></thead>
          <tbody>
            {items.length === 0 && <tr><td colSpan={fields.length + 1} style={{ textAlign: 'center', padding: 20, color: 'var(--text-muted)' }}>No items yet</td></tr>}
            {items.map(it => (
              <tr key={it.id}>
                {fields.map(f => (
                  <td key={f.k} style={{ fontSize: 13 }}>
                    {f.type === 'color'
                      ? <span style={{ display: 'inline-block', width: 18, height: 18, borderRadius: 4, background: it[f.k], verticalAlign: 'middle' }} />
                      : (it[f.k] || '—')}
                  </td>
                ))}
                <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                  <button className="btn-icon btn-sm" onClick={() => startEdit(it)}>✎</button>
                  <button className="btn-icon btn-sm" onClick={() => remove(it.id)}>×</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <div className="modal-overlay" onClick={cancel}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">{editing === 'new' ? `New ${label.toLowerCase()}` : `Edit ${label.toLowerCase()}`}</div>
            {fields.map(f => (
              <div key={f.k} className="form-group">
                <label className="form-label">{f.label}</label>
                {f.type === 'select'
                  ? <select value={form[f.k] || ''} onChange={e => setForm({ ...form, [f.k]: e.target.value })}>
                      {f.options.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  : f.type === 'color'
                    ? <input type="color" value={form[f.k] || '#7c6aff'} onChange={e => setForm({ ...form, [f.k]: e.target.value })} />
                    : <input value={form[f.k] || ''} placeholder={f.placeholder || ''} onChange={e => setForm({ ...form, [f.k]: e.target.value })} />}
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
              <button className="btn btn-ghost" onClick={cancel}>Cancel</button>
              <button className="btn btn-primary" onClick={save}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
// ABOUT TAB
// ════════════════════════════════════════════════════════════════════════
function AboutTab() {
  return (
    <div style={{ maxWidth: 720 }}>
      <Section title="Nucleus">
        <div style={{ fontSize: 13, lineHeight: 1.7 }}>
          <p>Your personal life-management and Fast Lane Technology business app.</p>
          <p style={{ marginTop: 12, color: 'var(--text-secondary)' }}>
            Self-hosted, single-user, runs entirely on your own infrastructure.
          </p>
        </div>
      </Section>

      <Section title="Build">
        <Row label="Frontend">
          <code>{import.meta.env.MODE}</code>
        </Row>
        <Row label="API base">
          <code>{import.meta.env.VITE_API_URL || '/api'}</code>
        </Row>
      </Section>

      <Section title="Useful">
        <div style={{ fontSize: 13, lineHeight: 2 }}>
          <div>Logs: see <strong>Data → Application logs</strong></div>
          <div>Backups: nightly at 03:00 to <code>/mnt/FSec-Data/data/nucleus/backups/</code></div>
          <div>Database migrations: applied automatically on backend startup</div>
        </div>
      </Section>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
// SHARED PRIMITIVES
// ════════════════════════════════════════════════════════════════════════
function Section({ title, hint, children }) {
  return (
    <div style={{ marginBottom: 32 }}>
      <h3 style={{ fontSize: 13, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>{title}</h3>
      {hint && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>{hint}</div>}
      <div className="card">{children}</div>
    </div>
  );
}

function Row({ label, hint, children }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 500 }}>{label}</div>
        {hint && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{hint}</div>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center' }}>{children}</div>
    </div>
  );
}

function Toggle({ options, value, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 4, background: 'var(--bg-secondary)', borderRadius: 8, padding: 3 }}>
      {options.map(o => (
        <button key={String(o.v)} onClick={() => onChange(o.v)} style={{
          padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 500,
          background: value === o.v ? 'var(--bg-card)' : 'transparent',
          color:      value === o.v ? 'var(--text-primary)' : 'var(--text-muted)',
          border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
        }}>{o.l}</button>
      ))}
    </div>
  );
}

function WidgetToggle({ k, label, prefs, setPref }) {
  return (
    <Row label={label}>
      <Toggle options={[{ v: true, l: 'Show' }, { v: false, l: 'Hide' }]}
              value={prefs[k]} onChange={v => setPref(k, v)} />
    </Row>
  );
}
