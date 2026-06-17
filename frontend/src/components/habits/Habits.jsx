import { useState, useEffect } from 'react';
import { get, post, patch, del } from '../../utils/api.js';

const DAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const TOP_TABS = ['Habits', 'Wellness'];
const MILESTONES = [7, 30, 90, 365];

export default function Habits() {
  const [topTab, setTopTab]         = useState('Habits');

  // Habits state
  const [habits, setHabits]         = useState([]);
  const [logs, setLogs]             = useState([]);
  const [streaks, setStreaks]       = useState({});
  const [goals, setGoals]           = useState([]);   // for goal_id dropdown
  const [modal, setModal]           = useState(null); // 'habit' | 'substance' | 'log'
  const [form, setForm]             = useState({});
  const [view, setView]             = useState('today');

  // Wellness state
  const [substances, setSubstances] = useState([]);
  const [subLogs, setSubLogs]       = useState([]);
  const [logTarget, setLogTarget]   = useState(null);

  const today = new Date().toISOString().split('T')[0];
  const past7 = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return d.toISOString().split('T')[0];
  });

  const loadHabits = async () => {
    const [h, l, g] = await Promise.allSettled([
      get('/habits'),
      get(`/habits/logs?from=${past7[0]}`),
      get('/goals'),  // Stage 4: for goal_id dropdown
    ]);
    if (h.value) {
      setHabits(h.value);
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
    if (g.value) setGoals(g.value);
  };

  const loadWellness = async () => {
    const [s, l] = await Promise.allSettled([
      get('/wellness/substances'),
      get('/wellness/logs?limit=50'),
    ]);
    if (s.value) setSubstances(s.value);
    if (l.value) setSubLogs(l.value);
  };

  useEffect(() => {
    loadHabits();
    loadWellness();
  }, []);

  // ── Habits helpers ──────────────────────────────────────────────────────
  const isLogged = (habitId, date) =>
    logs.some(l => l.habit_id === habitId && l.date.split('T')[0] === date && l.completed);

  const toggleLog = async (habitId, date) => {
    const done = isLogged(habitId, date);
    await post('/habits/log', { habit_id: habitId, date, completed: !done });
    const l = await get(`/habits/logs?from=${past7[0]}`);
    if (l) setLogs(l);
    const s = await get(`/habits/${habitId}/streak`);
    setStreaks(prev => ({ ...prev, [habitId]: s.streak }));
  };

  const handleAddHabit = async () => {
    await post('/habits', {
      ...form,
      frequency_days: form.frequency_days || [1,2,3,4,5,6,7],
      goal_id: form.goal_id || null,
    });
    setModal(null); setForm({}); loadHabits();
  };

  const handleDeleteHabit = async (id) => {
    if (window.confirm('Archive habit?')) { await del(`/habits/${id}`); loadHabits(); }
  };

  // ── Wellness helpers ────────────────────────────────────────────────────
  const daysSince = (refDate) => {
    if (!refDate) return null;
    const ref = new Date(typeof refDate === 'string' ? refDate.split('T')[0] : refDate);
    const now = new Date();
    now.setHours(0,0,0,0); ref.setHours(0,0,0,0);
    return Math.max(0, Math.floor((now - ref) / 86400000));
  };

  const nextMilestone = (days) => MILESTONES.find(m => m > days) || null;

  const handleAddSubstance = async () => {
    await post('/wellness/substances', form);
    setModal(null); setForm({}); loadWellness();
  };

  const handleLogUse = async () => {
    await post('/wellness/log', {
      substance_id: logTarget.id,
      date:     form.date || today,
      quantity: form.quantity || null,
      notes:    form.notes || null,
    });
    setModal(null); setForm({}); setLogTarget(null); loadWellness();
  };

  const handleToggleMode = async (sub) => {
    await patch(`/wellness/substances/${sub.id}`, {
      abstinence_mode: !sub.abstinence_mode,
      abstinence_since: !sub.abstinence_mode && !sub.last_used ? today : sub.abstinence_since,
    });
    loadWellness();
  };

  const handleResetAbstinence = async (sub) => {
    if (window.confirm('Reset abstinence counter to today?')) {
      await patch(`/wellness/substances/${sub.id}`, { abstinence_since: today });
      loadWellness();
    }
  };

  const handleDeleteSubstance = async (id) => {
    if (window.confirm('Archive substance? Logs will be kept.')) {
      await del(`/wellness/substances/${id}`);
      loadWellness();
    }
  };

  const todayDow = new Date().getDay();
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
          <h1 className="page-title">{topTab === 'Habits' ? 'Habits' : 'Wellness'}</h1>
          <p className="page-subtitle">
            {topTab === 'Habits'
              ? `${completedToday}/${todayHabits.length} done today`
              : `${substances.length} substance${substances.length === 1 ? '' : 's'} tracked`}
          </p>
        </div>
        {topTab === 'Habits' ? (
          <button className="btn btn-primary" onClick={() => { setModal('habit'); setForm({ frequency: 'daily', colour: '#f59e0b' }); }}>
            + Habit
          </button>
        ) : (
          <button className="btn btn-primary" onClick={() => { setModal('substance'); setForm({ colour: '#6366f1', abstinence_mode: false }); }}>
            + Substance
          </button>
        )}
      </div>

      {/* ── Top-level tabs ─────────────────────────────────────────────── */}
      <div className="finance-tabs">
        {TOP_TABS.map(t => (
          <button key={t} onClick={() => setTopTab(t)} style={{
            padding: '7px 16px', borderRadius: 7, fontSize: 13, fontWeight: 500,
            whiteSpace: 'nowrap',
            background: topTab === t ? 'var(--bg-card)' : 'transparent',
            color: topTab === t ? 'var(--text-primary)' : 'var(--text-muted)',
            border: topTab === t ? '1px solid var(--border)' : '1px solid transparent',
            transition: 'var(--transition)',
          }}>{t}</button>
        ))}
      </div>

      {/* ════════════════════════════════════════════════════════════════ */}
      {/* HABITS TAB                                                       */}
      {/* ════════════════════════════════════════════════════════════════ */}
      {topTab === 'Habits' && (
        <>
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
                      <button className="btn-icon btn-sm" onClick={() => handleDeleteHabit(h.id)} style={{ fontSize: 13 }}>×</button>
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
        </>
      )}

      {/* ════════════════════════════════════════════════════════════════ */}
      {/* WELLNESS TAB                                                     */}
      {/* ════════════════════════════════════════════════════════════════ */}
      {topTab === 'Wellness' && (
        <>
          {substances.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>⊕</div>
              <p>No substances tracked yet</p>
              <p style={{ fontSize: 12, marginTop: 8 }}>Track use, count days of abstinence, or both — toggle per substance.</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
              {substances.map(s => {
                const days       = daysSince(s.reference_date);
                const milestone  = nextMilestone(days);
                const pct        = milestone ? Math.min(100, (days / milestone) * 100) : 100;
                const passedMilestones = MILESTONES.filter(m => days != null && days >= m);

                return (
                  <div key={s.id} className="card" style={{ borderLeft: `4px solid ${s.colour || '#6366f1'}` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 15 }}>{s.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                          {s.total_logs || 0} log{s.total_logs == 1 ? '' : 's'}
                          {s.unit && ` · unit: ${s.unit}`}
                        </div>
                      </div>
                      <button className="btn-icon btn-sm" onClick={() => handleDeleteSubstance(s.id)}>×</button>
                    </div>

                    {/* Mode toggle */}
                    <div style={{ display: 'flex', gap: 4, marginBottom: 16, background: 'var(--bg-secondary)', borderRadius: 8, padding: 3, fontSize: 11 }}>
                      <button onClick={() => s.abstinence_mode && handleToggleMode(s)} style={{
                        flex: 1, padding: '5px 8px', borderRadius: 6, fontWeight: 500,
                        background: !s.abstinence_mode ? 'var(--bg-card)' : 'transparent',
                        color: !s.abstinence_mode ? 'var(--text-primary)' : 'var(--text-muted)',
                        border: 'none', cursor: 'pointer',
                      }}>Tracking use</button>
                      <button onClick={() => !s.abstinence_mode && handleToggleMode(s)} style={{
                        flex: 1, padding: '5px 8px', borderRadius: 6, fontWeight: 500,
                        background: s.abstinence_mode ? 'var(--bg-card)' : 'transparent',
                        color: s.abstinence_mode ? 'var(--text-primary)' : 'var(--text-muted)',
                        border: 'none', cursor: 'pointer',
                      }}>Abstinence</button>
                    </div>

                    {s.abstinence_mode ? (
                      <>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 14 }}>
                          <svg width="90" height="90" viewBox="0 0 90 90" style={{ flexShrink: 0 }}>
                            <circle cx="45" cy="45" r="36" fill="none" stroke="var(--bg-tertiary)" strokeWidth="7" />
                            <circle
                              cx="45" cy="45" r="36" fill="none"
                              stroke={s.colour || 'var(--green)'} strokeWidth="7"
                              strokeDasharray={`${(pct / 100) * 226} 226`}
                              strokeLinecap="round" transform="rotate(-90 45 45)"
                              style={{ transition: 'stroke-dasharray 0.5s ease' }}
                            />
                            <text x="45" y="50" textAnchor="middle" fill="var(--text-primary)" fontSize="20" fontWeight="700" fontFamily="var(--font-mono)">
                              {days ?? '—'}
                            </text>
                          </svg>
                          <div>
                            <div style={{ fontSize: 22, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--green)' }}>
                              {days != null ? `${days} day${days === 1 ? '' : 's'}` : 'Not started'}
                            </div>
                            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                              {milestone
                                ? `Next: ${milestone} days (${milestone - days} to go)`
                                : `All milestones cleared 🏆`}
                            </div>
                          </div>
                        </div>

                        {passedMilestones.length > 0 && (
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
                            {passedMilestones.map(m => (
                              <span key={m} className="badge" style={{ background: 'rgba(16,217,143,0.15)', color: 'var(--green)' }}>
                                ✓ {m}d
                              </span>
                            ))}
                          </div>
                        )}

                        <div style={{ display: 'flex', gap: 8 }}>
                          <button className="btn btn-danger btn-sm" onClick={() => { setLogTarget(s); setModal('log'); setForm({ date: today }); }}>
                            Log use (reset)
                          </button>
                          <button className="btn btn-ghost btn-sm" onClick={() => handleResetAbstinence(s)}>
                            Reset to today
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        <div style={{ marginBottom: 12 }}>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            Last logged
                          </div>
                          <div style={{ fontSize: 18, fontWeight: 600, fontFamily: 'var(--font-mono)' }}>
                            {s.last_used
                              ? `${days} day${days === 1 ? '' : 's'} ago`
                              : 'Never'}
                          </div>
                        </div>

                        {(() => {
                          const recent = subLogs.filter(l => l.substance_id === s.id).slice(0, 3);
                          if (recent.length === 0) return null;
                          return (
                            <div style={{ marginBottom: 12, fontSize: 11, color: 'var(--text-muted)' }}>
                              {recent.map(l => (
                                <div key={l.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
                                  <span>{new Date(l.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
                                  <span style={{ fontFamily: 'var(--font-mono)' }}>
                                    {l.quantity || '—'}{s.unit && l.quantity ? ` ${s.unit}` : ''}
                                  </span>
                                </div>
                              ))}
                            </div>
                          );
                        })()}

                        <button className="btn btn-primary btn-sm" style={{ width: '100%' }}
                          onClick={() => { setLogTarget(s); setModal('log'); setForm({ date: today }); }}>
                          + Log use
                        </button>
                      </>
                    )}

                    {s.notes && (
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                        {s.notes}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ── Habit Modal (with Stage 4 goal_id dropdown) ──────────────────── */}
      {modal === 'habit' && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
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

            {/* Stage 4: link to a goal */}
            <div className="form-group">
              <label className="form-label">Link to goal (optional)</label>
              <select value={form.goal_id || ''} onChange={e => setForm({...form, goal_id: e.target.value || null})}>
                <option value="">— None —</option>
                {goals.filter(g => g.status === 'active').map(g => (
                  <option key={g.id} value={g.id}>{g.title}</option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => setModal(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleAddHabit}>Add Habit</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Substance Modal ──────────────────────────────────────────────── */}
      {modal === 'substance' && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">New Substance</div>
            <div className="form-group">
              <label className="form-label">Name</label>
              <input placeholder="e.g. Coffee, Alcohol, Cigarettes" value={form.name || ''} onChange={e => setForm({...form, name: e.target.value})} />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Unit (optional)</label>
                <input placeholder="e.g. units, mg, pints" value={form.unit || ''} onChange={e => setForm({...form, unit: e.target.value})} />
              </div>
              <div className="form-group">
                <label className="form-label">Colour</label>
                <input type="color" value={form.colour || '#6366f1'} onChange={e => setForm({...form, colour: e.target.value})} style={{ height: 40 }} />
              </div>
            </div>
            <div style={{ padding: 12, background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-sm)', marginBottom: 16 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', userSelect: 'none' }}>
                <input
                  type="checkbox"
                  checked={!!form.abstinence_mode}
                  onChange={e => setForm({ ...form, abstinence_mode: e.target.checked })}
                  style={{ width: 'auto' }}
                />
                Start in abstinence mode
              </label>
              {form.abstinence_mode && (
                <div className="form-group" style={{ marginTop: 12, marginBottom: 0 }}>
                  <label className="form-label">Abstinence since (defaults to today)</label>
                  <input type="date" value={form.abstinence_since || today} onChange={e => setForm({...form, abstinence_since: e.target.value})} />
                </div>
              )}
            </div>
            <div className="form-group">
              <label className="form-label">Notes (optional)</label>
              <input placeholder="Any context..." value={form.notes || ''} onChange={e => setForm({...form, notes: e.target.value})} />
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => setModal(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleAddSubstance}>Add Substance</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Log Use Modal ────────────────────────────────────────────────── */}
      {modal === 'log' && logTarget && (
        <div className="modal-overlay" onClick={() => { setModal(null); setLogTarget(null); }}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">Log {logTarget.name}</div>
            {logTarget.abstinence_mode && (
              <div style={{ padding: 10, background: 'rgba(255,77,109,0.1)', border: '1px solid rgba(255,77,109,0.25)', borderRadius: 'var(--radius-sm)', marginBottom: 16, fontSize: 12, color: 'var(--red)' }}>
                ⚠ This will reset your abstinence counter.
              </div>
            )}
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Date</label>
                <input type="date" value={form.date || today} onChange={e => setForm({...form, date: e.target.value})} />
              </div>
              <div className="form-group">
                <label className="form-label">Quantity {logTarget.unit ? `(${logTarget.unit})` : ''}</label>
                <input type="number" step="0.01" min="0" placeholder="0" value={form.quantity || ''} onChange={e => setForm({...form, quantity: e.target.value})} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Notes (optional)</label>
              <input placeholder="Context, trigger, location..." value={form.notes || ''} onChange={e => setForm({...form, notes: e.target.value})} />
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => { setModal(null); setLogTarget(null); }}>Cancel</button>
              <button className="btn btn-primary" onClick={handleLogUse}>Log</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
