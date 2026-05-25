import { useState, useEffect, useRef } from 'react';
import { get, post, fmt } from '../../utils/api.js';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

export default function TimeTracking() {
  const [projects, setProjects] = useState([]);
  const [entries, setEntries]   = useState([]);
  const [running, setRunning]   = useState(null);
  const [elapsed, setElapsed]   = useState(0);
  const [modal, setModal]       = useState(null);
  const [form, setForm]         = useState({});
  const interval = useRef(null);

  const load = async () => {
    const [p, e, r] = await Promise.allSettled([
      get('/time/projects'),
      get('/time/entries?from=' + new Date(Date.now() - 7 * 86400000).toISOString()),
      get('/time/running'),
    ]);
    if (p.value) setProjects(p.value);
    if (e.value) setEntries(e.value);
    if (r.value) {
      setRunning(r.value);
      setElapsed(Math.floor((Date.now() - new Date(r.value.start_time)) / 1000));
    } else {
      setRunning(null);
      clearInterval(interval.current);
    }
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (running) {
      interval.current = setInterval(() => {
        setElapsed(Math.floor((Date.now() - new Date(running.start_time)) / 1000));
      }, 1000);
    }
    return () => clearInterval(interval.current);
  }, [running]);

  const handleStart = async () => {
    if (!form.project_id) return;
    await post('/time/start', form);
    setForm({});
    load();
  };

  const handleStop = async () => {
    await post('/time/stop', {});
    setRunning(null);
    setElapsed(0);
    clearInterval(interval.current);
    load();
  };

  const formatElapsed = (s) => {
    const h   = Math.floor(s / 3600);
    const m   = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  };

  const byDate = {};
  entries.forEach(e => {
    const d = e.start_time.split('T')[0];
    if (!byDate[d]) byDate[d] = [];
    byDate[d].push(e);
  });

  const chartData = Object.entries(byDate).map(([date, es]) => {
    const row = { date: date.slice(5) };
    projects.forEach(p => {
      row[p.name] = Math.round(
        es.filter(e => e.project_id === p.id).reduce((s, e) => s + (e.duration_seconds || 0), 0) / 3600 * 10
      ) / 10;
    });
    return row;
  }).slice(-7);

  const totalThisWeek = entries.reduce((s, e) => s + (e.duration_seconds || 0), 0);

  return (
    <div className="page animate-fade">
      <div className="page-header">
        <div>
          <h1 className="page-title">Time Tracking</h1>
          <p className="page-subtitle">{fmt.duration(totalThisWeek)} tracked this week</p>
        </div>
        <button className="btn btn-primary" onClick={() => setModal('project')}>+ Project</button>
      </div>

      {/* ── Timer ────────────────────────────────────────────────────────── */}
      <div className="card" style={{
        marginBottom: 24, textAlign: 'center', padding: '32px 24px',
        background: running
          ? 'linear-gradient(135deg, rgba(124,106,255,0.12), rgba(77,166,255,0.08))'
          : 'var(--bg-card)',
        borderColor: running ? 'rgba(124,106,255,0.3)' : 'var(--border)',
      }}>
        {/* timer-display class lets CSS shrink font on mobile */}
        <div className="timer-display" style={{
          color: running ? 'var(--accent)' : 'var(--text-primary)',
        }}>
          {formatElapsed(elapsed)}
        </div>

        {running && (
          <div style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 20 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--green)', display: 'inline-block', animation: 'pulse 2s infinite' }} />
              {running.project_name}{running.description && ` — ${running.description}`}
            </span>
          </div>
        )}

        {!running ? (
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap' }}>
            <select value={form.project_id || ''} onChange={e => setForm({ ...form, project_id: e.target.value })} style={{ width: 200 }}>
              <option value="">Select project...</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <input
              placeholder="What are you working on?"
              value={form.description || ''}
              onChange={e => setForm({ ...form, description: e.target.value })}
              onKeyDown={e => e.key === 'Enter' && form.project_id && handleStart()}
              style={{ width: 240 }}
            />
            <button className="btn btn-primary" onClick={handleStart}>▶ Start</button>
          </div>
        ) : (
          <button className="btn btn-danger" onClick={handleStop} style={{ fontSize: 16, padding: '10px 32px' }}>
            ■ Stop
          </button>
        )}
      </div>

      {/* ── two-col-layout-wide: stacks on mobile via CSS ────────────────── */}
      <div className="two-col-layout-wide">

        {/* Left — chart + entries */}
        <div>
          {chartData.length > 0 && (
            <div className="card" style={{ marginBottom: 20 }}>
              <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>Hours by Day</h3>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="var(--text-muted)" />
                  <YAxis tick={{ fontSize: 11 }} stroke="var(--text-muted)" />
                  <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} />
                  {projects.map(p => (
                    <Bar key={p.id} dataKey={p.name} fill={p.colour || 'var(--accent)'} radius={[3, 3, 0, 0]} stackId="a" />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          <div className="card" style={{ padding: 0 }}>
            {Object.entries(byDate).sort(([a], [b]) => b.localeCompare(a)).map(([date, es]) => (
              <div key={date}>
                <div style={{
                  padding: '10px 16px', background: 'var(--bg-secondary)',
                  borderBottom: '1px solid var(--border)',
                  display: 'flex', justifyContent: 'space-between',
                }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                    {fmt.date(date)}
                  </span>
                  <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                    {fmt.duration(es.reduce((s, e) => s + (e.duration_seconds || 0), 0))}
                  </span>
                </div>
                {es.map(e => (
                  <div key={e.id} style={{ display: 'flex', gap: 12, padding: '10px 16px', borderBottom: '1px solid var(--border)', alignItems: 'center' }}>
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: e.project_colour || 'var(--accent)', flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ fontWeight: 500, fontSize: 13 }}>{e.project_name}</span>
                      {e.description && <span style={{ color: 'var(--text-muted)', fontSize: 13 }}> — {e.description}</span>}
                    </div>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                      {e.duration_seconds ? fmt.duration(e.duration_seconds) : (e.end_time ? '—' : '...')}
                    </span>
                  </div>
                ))}
              </div>
            ))}
            {entries.length === 0 && (
              <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>No entries this week</div>
            )}
          </div>
        </div>

        {/* Right — projects */}
        <div>
          <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>Projects</h3>
          {projects.map(p => (
            <div key={p.id} className="card" style={{ marginBottom: 10, padding: '12px 16px', borderLeft: `4px solid ${p.colour}` }}>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>{p.name}</div>
              <div style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                {fmt.duration(parseInt(p.total_seconds) || 0)} total
              </div>
            </div>
          ))}
          {projects.length === 0 && (
            <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>No projects yet</p>
          )}
        </div>
      </div>

      {/* ── Add Project modal ─────────────────────────────────────────────── */}
      {modal === 'project' && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">New Project</div>
            <div className="form-group">
              <label className="form-label">Name</label>
              <input value={form.name || ''} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Project name" />
            </div>
            <div className="form-group">
              <label className="form-label">Colour</label>
              <input type="color" value={form.colour || '#6366f1'} onChange={e => setForm({ ...form, colour: e.target.value })} style={{ height: 44 }} />
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => setModal(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={async () => {
                await post('/time/projects', form);
                setModal(null); setForm({}); load();
              }}>Create</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
