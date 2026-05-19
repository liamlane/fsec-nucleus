import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { get, fmt } from '../../utils/api.js';
import { AreaChart, Area, ResponsiveContainer, Tooltip, XAxis } from 'recharts';

export default function Dashboard() {
  const [data, setData] = useState({ finance: null, habits: [], goals: [], journal: null, running: null });
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const today = new Date().toISOString().split('T')[0];

  useEffect(() => {
    Promise.allSettled([
      get('/finance/analytics/summary'),
      get('/habits?limit=5'),
      get('/goals?status=active'),
      get(`/journal/${today}`),
      get('/time/running'),
      get('/habits/logs?from=' + new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0]),
    ]).then(([finance, habits, goals, journal, running]) => {
      setData({
        finance: finance.value,
        habits: habits.value || [],
        goals: goals.value || [],
        journal: journal.value,
        running: running.value,
      });
      setLoading(false);
    });
  }, []);

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

  return (
    <div className="page animate-fade">
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700 }}>{greeting()} 👋</h1>
        <p style={{ color: 'var(--text-secondary)', marginTop: 4 }}>
          {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
      </div>

      {/* Running timer banner */}
      {data.running && (
        <div style={{
          background: 'linear-gradient(135deg, rgba(124,106,255,0.15), rgba(77,166,255,0.1))',
          border: '1px solid rgba(124,106,255,0.3)',
          borderRadius: 12,
          padding: '12px 20px',
          marginBottom: 24,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--green)', animation: 'pulse 2s infinite' }} />
          <span style={{ fontWeight: 500 }}>Timer running: {data.running.project_name}</span>
          <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>{data.running.description}</span>
          <button onClick={() => navigate('/time')} className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto' }}>View</button>
        </div>
      )}

      {/* Finance summary */}
      {finance && (
        <div style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 13, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: 12 }}>This Month</h2>
          <div className="stats-grid">
            {[
              { label: 'Income', value: fmt.currency(finance.income), colour: 'var(--green)', dim: 'var(--green-dim)' },
              { label: 'Expenses', value: fmt.currency(finance.expenses), colour: 'var(--red)', dim: 'var(--red-dim)' },
              { label: 'Net', value: fmt.currency(finance.net), colour: finance.net >= 0 ? 'var(--green)' : 'var(--red)', dim: finance.net >= 0 ? 'var(--green-dim)' : 'var(--red-dim)' },
            ].map(s => (
              <div key={s.label} className="stat-card" style={{ borderColor: 'transparent', background: s.dim }} onClick={() => navigate('/finance')} role="button" style={{ cursor: 'pointer', background: s.dim, border: `1px solid transparent`, borderRadius: 'var(--radius)', padding: '16px 20px' }}>
                <div className="stat-label">{s.label}</div>
                <div className="stat-value" style={{ color: s.colour, fontSize: 22 }}>{s.value}</div>
              </div>
            ))}
          </div>

          {finance.daily && finance.daily.length > 0 && (
            <div className="card" style={{ padding: '16px 20px', marginTop: 0 }}>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>DAILY CASH FLOW</div>
              <ResponsiveContainer width="100%" height={80}>
                <AreaChart data={finance.daily}>
                  <defs>
                    <linearGradient id="incG" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#10d98f" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#10d98f" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="expG" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#ff4d6d" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#ff4d6d" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="date" hide />
                  <Tooltip formatter={(v, n) => [fmt.currency(v), n === 'income' ? 'Income' : 'Expenses']} contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} />
                  <Area type="monotone" dataKey="income" stroke="#10d98f" strokeWidth={2} fill="url(#incG)" />
                  <Area type="monotone" dataKey="expense" stroke="#ff4d6d" strokeWidth={2} fill="url(#expG)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      {/* Goals + Habits */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 24 }}>
        {/* Active Goals */}
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ fontSize: 13, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>Active Goals</h3>
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

        {/* Habits today */}
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ fontSize: 13, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>Today's Habits</h3>
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

      {/* Quick actions */}
      <div>
        <h2 style={{ fontSize: 13, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: 12 }}>Quick Actions</h2>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {[
            { label: '+ Transaction', path: '/finance', colour: 'var(--green)' },
            { label: '+ Goal', path: '/goals', colour: 'var(--accent)' },
            { label: '+ Note', path: '/notes', colour: 'var(--amber)' },
            { label: '+ Event', path: '/calendar', colour: 'var(--blue)' },
            { label: 'Write Journal', path: '/journal', colour: 'var(--pink)' },
          ].map(a => (
            <button
              key={a.label}
              onClick={() => navigate(a.path)}
              className="btn btn-ghost"
              style={{ borderColor: 'var(--border)' }}
            >
              {a.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
