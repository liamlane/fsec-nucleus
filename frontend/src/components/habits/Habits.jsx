import { useState, useEffect } from 'react';
import { get, post, del } from '../../utils/api.js';

const DAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

export default function Habits() {
  const [habits, setHabits] = useState([]);
  const [logs, setLogs] = useState([]);
  const [streaks, setStreaks] = useState({});
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({});
  const [view, setView] = useState('today'); // today | week | all

  const today = new Date().toISOString().split('T')[0];
  const past7 = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return d.toISOString().split('T')[0];
  });

  const load = async () => {
    const [h, l] = await Promise.allSettled([
      get('/habits'),
      get(`/habits/logs?from=${past7[0]}`),
    ]);
    if (h.value) {
      setHabits(h.value);
      // Load streaks
      const streakData = {};
      await Promise.all(h.value.map(async hab => {
        try {
          const s = await get(`/habits/${hab.id}/streak`);
          streakData[hab.id] = s.streak;
        } catch { streakData[hab.id] = 0; }
      }));
      setStreaks(streakData);
    }
    if (l.value) setLogs(l.value);
  };

  useEffect(() => { load(); }, []);

  const isLogged = (habitId, date) =>
    logs.some(l => l.habit_id === habitId && l.date.split('T')[0] === date && l.completed);

  const toggleLog = async (habitId, date) => {
    const done = isLogged(habitId, date);
    await post('/habits/log', { habit_id: habitId, date, completed: !done });
    const l = await get(`/habits/logs?from=${past7[0]}`);
    if (l) setLogs(l);
    // Refresh streak
    const s = await get(`/habits/${habitId}/streak`);
    setStreaks(prev => ({ ...prev, [habitId]: s.streak }));
  };

  const handleAdd = async () => {
    await post('/habits', { ...form, frequency_days: form.frequency_days || [1,2,3,4,5,6,7] });
    setModal(false); setForm({}); load();
  };

  const handleDelete = async (id) => {
    if (confirm('Archive habit?')) { await del(`/habits/${id}`); load(); }
  };

  const todayDow = new Date().getDay(); // 0=Sun
  const todayHabits = habits.filter(h => {
    if (!h.frequency_days) return true;
    const mapped = todayDow === 0 ? 7 : todayDow;
    return h.frequency_days.includes(mapped);
  });

  const completedToday = todayHabits.filter(h => isLogged(h.id, today)).length;

  return (
    <div className="page animate-fade">
      <div className="page-header">
        <div>
          <h1 className="page-title">Habits</h1>
          <p className="page-subtitle">{completedToday}/{todayHabits.length} done today</p>
        </div>
        <button className="btn btn-primary" onClick={() => { setModal(true); setForm({ frequency: 'daily', colour: '#f59e0b' }); }}>
          + Habit
        </button>
      </div>

      {/* Progress ring */}
      {todayHabits.length > 0 && (
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 24, marginBottom: 24, padding: '16px 24px' }}>
          <svg width="80" height="80" viewBox="0 0 80 80">
            <circle cx="40" cy="40" r="32" fill="none" stroke="var(--bg-tertiary)" strokeWidth="8" />
            <circle cx="40" cy="40" r="32" fill="none" stroke="var(--accent)" strokeWidth="8"
              strokeDasharray={`${(completedToday / todayHabits.length) * 201} 201`}
              strokeLinecap="round" transform="rotate(-90 40 40)"
              style={{ transition: 'stroke-dasharray 0.5s ease' }}
            />
            <text x="40" y="44" textAnchor="middle" fill="var(--text-primary)" fontSize="16" fontWeight="700" fontFamily="var(--font-mono)">
              {Math.round((completedToday / todayHabits.length) * 100)}%
            </text>
          </svg>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{completedToday} of {todayHabits.length} habits complete</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              {completedToday === todayHabits.length ? '🔥 Perfect day! Keep the streak going!' : `${todayHabits.length - completedToday} remaining for today`}
            </div>
          </div>
        </div>
      )}

      {/* View toggle */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, background: 'var(--bg-secondary)', borderRadius: 10, padding: 4, width: 'fit-content' }}>
        {['today', 'week'].map(v => (
          <button key={v} onClick={() => setView(v)} style={{
            padding: '5px 16px', borderRadius: 7, fontSize: 13, textTransform: 'capitalize',
            background: view === v ? 'var(--bg-card)' : 'transparent',
            color: view === v ? 'var(--text-primary)' : 'var(--text-muted)',
            border: view === v ? '1px solid var(--border)' : '1px solid transparent',
          }}>{v}</button>
        ))}
      </div>

      {view === 'today' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {todayHabits.map(h => {
            const done = isLogged(h.id, today);
            const streak = streaks[h.id] || 0;
            return (
              <div key={h.id} className="card" style={{
                display: 'flex', alignItems: 'center', gap: 16, padding: '14px 20px',
                borderLeft: `4px solid ${done ? h.colour : 'var(--border)'}`,
                opacity: done ? 1 : 0.85,
              }}>
                <button onClick={() => toggleLog(h.id, today)} style={{
                  width: 28, height: 28, borderRadius: 8, border: `2px solid ${done ? h.colour : 'var(--border)'}`,
                  background: done ? h.colour : 'transparent', color: 'white', fontSize: 14, flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'var(--transition)',
                }}>{done ? '✓' : ''}</button>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 500, textDecoration: done ? 'line-through' : 'none', color: done ? 'var(--text-muted)' : 'var(--text-primary)' }}>{h.name}</div>
                  {h.description && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{h.description}</div>}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {streak > 0 && (
                    <span style={{ fontSize: 12, color: 'var(--amber)', fontFamily: 'var(--font-mono)', background: 'var(--amber-dim)', padding: '2px 8px', borderRadius: 99 }}>
                      🔥 {streak}
                    </span>
                  )}
                  <button className="btn-icon btn-sm" onClick={() => handleDelete(h.id)} style={{ fontSize: 13 }}>×</button>
                </div>
              </div>
            );
          })}
          {todayHabits.length === 0 && (
            <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>⊕</div>
              <p>No habits scheduled for today</p>
            </div>
          )}
        </div>
      )}

      {view === 'week' && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table>
            <thead>
              <tr>
                <th style={{ width: 200 }}>Habit</th>
                {past7.map(d => (
                  <th key={d} style={{ textAlign: 'center', fontSize: 11 }}>
                    <div>{DAYS[new Date(d + 'T12:00:00').getDay()]}</div>
                    <div style={{ color: d === today ? 'var(--accent)' : 'var(--text-muted)' }}>{d.slice(-2)}</div>
                  </th>
                ))}
                <th>Streak</th>
              </tr>
            </thead>
            <tbody>
              {habits.map(h => (
                <tr key={h.id}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: h.colour, flexShrink: 0 }} />
                      <span style={{ fontSize: 13, fontWeight: 500 }}>{h.name}</span>
                    </div>
                  </td>
                  {past7.map(d => {
                    const done = isLogged(h.id, d);
                    return (
                      <td key={d} style={{ textAlign: 'center' }}>
                        <button onClick={() => toggleLog(h.id, d)} style={{
                          width: 24, height: 24, borderRadius: 6, border: `2px solid ${done ? h.colour : 'var(--border)'}`,
                          background: done ? h.colour : 'transparent', margin: '0 auto', cursor: 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: 'white',
                        }}>{done ? '✓' : ''}</button>
                      </td>
                    );
                  })}
                  <td>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: (streaks[h.id] || 0) > 0 ? 'var(--amber)' : 'var(--text-muted)' }}>
                      {(streaks[h.id] || 0) > 0 ? `🔥 ${streaks[h.id]}` : '—'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modal && (
        <div className="modal-overlay" onClick={() => setModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">New Habit</div>
            <div className="form-group">
              <label className="form-label">Name</label>
              <input placeholder="e.g. Morning run, No smoking..." value={form.name || ''} onChange={e => setForm({...form, name: e.target.value})} />
            </div>
            <div className="form-group">
              <label className="form-label">Description</label>
              <input placeholder="Optional description" value={form.description || ''} onChange={e => setForm({...form, description: e.target.value})} />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Frequency</label>
                <select value={form.frequency || 'daily'} onChange={e => setForm({...form, frequency: e.target.value})}>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Colour</label>
                <input type="color" value={form.colour || '#f59e0b'} onChange={e => setForm({...form, colour: e.target.value})} style={{ height: 40 }} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => setModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleAdd}>Add Habit</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
