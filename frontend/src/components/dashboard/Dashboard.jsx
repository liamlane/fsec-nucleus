import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { get, post, fmt } from '../../utils/api.js';
import { AreaChart, Area, ResponsiveContainer, Tooltip, XAxis } from 'recharts';

export default function Dashboard() {
  const [data, setData]       = useState({ finance: null, habits: [], goals: [], journal: null, running: null });
  const [loading, setLoading] = useState(true);
  const [checkin, setCheckin] = useState({ mood: 0, energy: 0 });
  const [checkinDone, setCheckinDone] = useState(false);
  const navigate = useNavigate();
  const today = new Date().toISOString().split('T')[0];

  useEffect(() => {
    Promise.allSettled([
      get('/finance/analytics/summary'),
      get('/habits?limit=5'),
      get('/goals?status=active'),
      get(`/journal/${today}`),
      get('/time/running'),
    ]).then(([finance, habits, goals, journal, running]) => {
      // Check if today already has a check-in
      if (journal.value && journal.value.is_checkin === true) setCheckinDone(true);

      setData({
        finance: finance.value,
        habits:  habits.value  || [],
        goals:   goals.value   || [],
        journal: journal.value,
        running: running.value,
      });
      setLoading(false);
    });
  }, []);

  const saveCheckin = async () => {
    if (!checkin.mood) return;
    await post('/journal', {
      date: today,
      mood: checkin.mood,
      energy: checkin.energy || null,
      is_checkin: true,
    });
    setCheckinDone(true);
  };

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', color: 'var(--text-muted)' }}>
      Loading Nucleus...
    </div>
  );

  const { finance, habits, goals } = data;

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  };

  const MOODS = ['😔', '😐', '🙂', '😄', '🤩'];
  const ENERGY = ['🪫', '🔋', '⚡', '🚀'];

  return (
    <div className="page animate-fade">

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700 }}>{greeting()} 👋</h1>
        <p style={{ color: 'var(--text-secondary)', marginTop: 4 }}>
          {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
      </div>

      {/* ── Daily check-in ───────────────────────────────────────────────── */}
      {!checkinDone && (
        <div className="card" style={{ marginBottom: 20, borderColor: 'rgba(124,106,255,0.3)', background: 'rgba(124,106,255,0.05)' }}>
          <div style={{ fontWeight: 600, marginBottom: 12, fontSize: 15 }}>How are you feeling today?</div>
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Mood</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {MOODS.map((m, i) => {
                const val = (i + 1) * 2;
                return (
                  <button key={i} onClick={() => setCheckin(c => ({ ...c, mood: val }))} style={{
                    fontSize: 26, padding: '4px 6px', borderRadius: 10, cursor: 'pointer',
                    border: `2px solid ${checkin.mood === val ? 'var(--accent)' : 'transparent'}`,
                    background: checkin.mood === val ? 'var(--accent-dim)' : 'transparent',
                    transform: checkin.mood === val ? 'scale(1.15)' : 'scale(1)',
                    transition: 'var(--transition)',
                  }}>{m}</button>
                );
              })}
            </div>
          </div>
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Energy</div>
            <div style={{ display: 'flex', gap: 8 }}>
              {ENERGY.map((e, i) => {
                const val = i + 1;
                return (
                  <button key={i} onClick={() => setCheckin(c => ({ ...c, energy: val }))} style={{
                    fontSize: 22, padding: '4px 6px', borderRadius: 10, cursor: 'pointer',
                    border: `2px solid ${checkin.energy === val ? 'var(--amber)' : 'transparent'}`,
                    background: checkin.energy === val ? 'var(--amber-dim)' : 'transparent',
                    transition: 'var(--transition)',
                  }}>{e}</button>
                );
              })}
            </div>
          </div>
          <button
            className="btn btn-primary btn-sm"
            onClick={saveCheckin}
            disabled={!checkin.mood}
            style={{ opacity: checkin.mood ? 1 : 0.4 }}
          >
            Save check-in
          </button>
        </div>
      )}

      {checkinDone && data.journal && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px 16px', borderRadius: 10, marginBottom: 20,
          background: 'var(--green-dim)', border: '1px solid rgba(16,217,143,0.2)',
          fontSize: 13,
        }}>
          <span>✓</span>
          <span style={{ color: 'var(--green)', fontWeight: 500 }}>Check-in done for today</span>
        </div>
      )}

      {/* ── Running timer banner ─────────────────────────────────────────── */}
      {data.running && (
        <div style={{
          background: 'linear-gradient(135deg, rgba(124,106,255,0.15), rgba(77,166,255,0.1))',
          border: '1px solid rgba(124,106,255,0.3)',
          borderRadius: 12, padding: '12px 20px', marginBottom: 20,
          display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
        }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--green)', animation: 'pulse 2s infinite', flexShrink: 0 }} />
          <span style={{ fontWeight: 500 }}>Timer running: {data.running.project_name}</span>
          {data.running.description && (
            <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>{data.running.description}</span>
          )}
          <button onClick={() => navigate('/time')} className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto' }}>View</button>
        </div>
      )}

      {/* ── Finance summary ──────────────────────────────────────────────── */}
      {finance && (
        <div style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: 12 }}>This Month</h2>
          <div className="stats-grid">
            {[
              { label: 'Income',   value: fmt.currency(finance.income),   colour: 'var(--green)', dim: 'var(--green-dim)' },
              { label: 'Expenses', value: fmt.currency(finance.expenses), colour: 'var(--red)',   dim: 'var(--red-dim)' },
              { label: 'Net',      value: fmt.currency(finance.net),
                colour: finance.net >= 0 ? 'var(--green)' : 'var(--red)',
                dim:    finance.net >= 0 ? 'var(--green-dim)' : 'var(--red-dim)' },
            ].map(s => (
              <div
                key={s.label}
                onClick={() => navigate('/finance')}
                style={{ cursor: 'pointer', background: s.dim, border: '1px solid transparent', borderRadius: 'var(--radius)', padding: '16px 20px' }}
              >
                <div className="stat-label">{s.label}</div>
                <div className="stat-value" style={{ color: s.colour, fontSize: 22 }}>{s.value}</div>
              </div>
            ))}
          </div>

          {finance.daily && finance.daily.length > 0 && (
            <div className="card" style={{ padding: '16px 20px' }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Daily Cash Flow</div>
              <ResponsiveContainer width="100%" height={80}>
                <AreaChart data={finance.daily}>
                  <defs>
                    <linearGradient id="incG" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%"   stopColor="#10d98f" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#10d98f" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="expG" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%"   stopColor="#ff4d6d" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#ff4d6d" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="date" hide />
                  <Tooltip
                    formatter={(v, n) => [fmt.currency(v), n === 'income' ? 'Income' : 'Expenses']}
                    contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
                  />
                  <Area type="monotone" dataKey="income"  stroke="#10d98f" strokeWidth={2} fill="url(#incG)" />
                  <Area type="monotone" dataKey="expense" stroke="#ff4d6d" strokeWidth={2} fill="url(#expG)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      {/* ── Goals + Habits ───────────────────────────────────────────────── */}
      <div className="dashboard-split">
        {/* Active Goals */}
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>Active Goals</h3>
            <button onClick={() => navigate('/goals')} className="btn btn-ghost btn-sm">View all</button>
          </div>
          {goals.slice(0, 4).map(g => (
            <div key={g.id} style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 13, fontWeight: 500 }}>{g.title}</span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{g.progress}%</span>
              </div>
              <div className="progress-bar">
                <div className="progress-bar-fill" style={{ width: `${g.progress}%`, background: g.area_colour || 'var(--accent)' }} />
              </div>
            </div>
          ))}
          {goals.length === 0 && <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>No active goals</p>}
        </div>

        {/* Today's Habits */}
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>Today's Habits</h3>
            <button onClick={() => navigate('/habits')} className="btn btn-ghost btn-sm">View all</button>
          </div>
          {habits.slice(0, 5).map(h => (
            <div key={h.id} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: h.colour, flexShrink: 0 }} />
              <span style={{ flex: 1, fontSize: 13 }}>{h.name}</span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{h.total_completions}×</span>
            </div>
          ))}
          {habits.length === 0 && <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>No habits set up</p>}
        </div>
      </div>

      {/* ── Quick actions ────────────────────────────────────────────────── */}
      <div>
        <h2 style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: 12 }}>Quick Actions</h2>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {[
            { label: '+ Transaction', path: '/finance',  colour: 'var(--green)' },
            { label: '+ Goal',        path: '/goals',    colour: 'var(--accent)' },
            { label: '+ Note',        path: '/notes',    colour: 'var(--amber)' },
            { label: '+ Event',       path: '/calendar', colour: 'var(--blue)' },
            { label: 'Write Journal', path: '/journal',  colour: 'var(--pink)' },
          ].map(a => (
            <button key={a.label} onClick={() => navigate(a.path)} className="btn btn-ghost">
              {a.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
