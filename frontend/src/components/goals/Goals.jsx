import { useState, useEffect } from 'react';
import { get, post, patch, del, fmt } from '../../utils/api.js';

const PRIORITY_COLOURS = { low: '#6b7280', medium: '#f59e0b', high: '#f97316', critical: '#ef4444' };
const STATUS_COLOURS = { active: '#6366f1', completed: '#10d98f', paused: '#f59e0b', abandoned: '#6b7280' };

export default function Goals() {
  const [goals, setGoals] = useState([]);
  const [areas, setAreas] = useState([]);
  const [milestones, setMilestones] = useState({});
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({});
  const [filterArea, setFilterArea] = useState('');
  const [filterStatus, setFilterStatus] = useState('active');
  const [expanded, setExpanded] = useState(null);
  const [msForm, setMsForm] = useState({});
  // Stage 4: linked habits and time projects
  const [linkedHabits, setLinkedHabits] = useState({});
  const [linkedTime, setLinkedTime] = useState({});

  const load = async () => {
    const [g, a] = await Promise.allSettled([get('/goals'), get('/goals/life-areas')]);
    if (g.value) setGoals(g.value);
    if (a.value) setAreas(a.value);
  };

  useEffect(() => { load(); }, []);

  const loadMilestones = async (goalId) => {
    if (milestones[goalId]) return;
    const ms = await get(`/goals/${goalId}/milestones`);
    setMilestones(prev => ({ ...prev, [goalId]: ms }));
  };

  // Stage 4: load linked habits and time projects for a goal
  const loadLinked = async (goalId) => {
    if (linkedHabits[goalId] || linkedTime[goalId]) return;
    const [habits, projects] = await Promise.allSettled([
      get(`/goals/${goalId}/habits`).catch(() => []),
      get(`/goals/${goalId}/time-projects`).catch(() => [])
    ]);
    if (habits.value) setLinkedHabits(prev => ({ ...prev, [goalId]: habits.value }));
    if (projects.value) setLinkedTime(prev => ({ ...prev, [goalId]: projects.value }));
  };

  const toggleExpand = (id) => {
    if (expanded === id) { setExpanded(null); return; }
    setExpanded(id);
    loadMilestones(id);
    loadLinked(id); // Stage 4
  };

  const handleAdd = async () => {
    await post('/goals', form);
    setModal(null); setForm({}); load();
  };

  const handleProgress = async (id, progress) => {
    await patch(`/goals/${id}`, { progress: parseInt(progress) });
    setGoals(goals.map(g => g.id === id ? { ...g, progress: parseInt(progress) } : g));
  };

  const handleStatus = async (id, status) => {
    await patch(`/goals/${id}`, { status });
    load();
  };

  const handleDelete = async (id) => {
    if (window.confirm('Delete goal?')) { await del(`/goals/${id}`); load(); }
  };

  const addMilestone = async (goalId) => {
    await post(`/goals/${goalId}/milestones`, msForm);
    setMsForm({});
    const ms = await get(`/goals/${goalId}/milestones`);
    setMilestones(prev => ({ ...prev, [goalId]: ms }));
  };

  const toggleMilestone = async (ms) => {
    await patch(`/goals/milestones/${ms.id}`, { completed: !ms.completed });
    const goalMs = await get(`/goals/${ms.goal_id}/milestones`);
    setMilestones(prev => ({ ...prev, [ms.goal_id]: goalMs }));
  };

  const filtered = goals.filter(g => {
    if (filterArea && g.life_area_id !== filterArea) return false;
    if (filterStatus && g.status !== filterStatus) return false;
    return true;
  });

  return (
    <div className="page animate-fade">
      <div className="page-header">
        <div>
          <h1 className="page-title">Goals</h1>
          <p className="page-subtitle">Life goals, milestones & progress tracking</p>
        </div>
        <button className="btn btn-primary" onClick={() => { setModal('goal'); setForm({ status: 'active', priority: 'medium', progress: 0 }); }}>
          + Goal
        </button>
      </div>

      {/* Life areas */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        <button onClick={() => setFilterArea('')} className={`badge`} style={{ padding: '6px 12px', cursor: 'pointer', background: !filterArea ? 'var(--accent-dim)' : 'var(--bg-card)', color: !filterArea ? 'var(--accent)' : 'var(--text-muted)', border: `1px solid ${!filterArea ? 'rgba(124,106,255,0.3)' : 'var(--border)'}` }}>
          All Areas
        </button>
        {areas.map(a => (
          <button key={a.id} onClick={() => setFilterArea(filterArea === a.id ? '' : a.id)} className="badge"
            style={{ padding: '6px 12px', cursor: 'pointer', background: filterArea === a.id ? a.colour + '25' : 'var(--bg-card)', color: filterArea === a.id ? a.colour : 'var(--text-muted)', border: `1px solid ${filterArea === a.id ? a.colour + '50' : 'var(--border)'}` }}>
            {a.name}
          </button>
        ))}
      </div>

      {/* Status filter */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 24, background: 'var(--bg-secondary)', borderRadius: 10, padding: 4, width: 'fit-content' }}>
        {['active', 'completed', 'paused', 'abandoned'].map(s => (
          <button key={s} onClick={() => setFilterStatus(filterStatus === s ? '' : s)} style={{
            padding: '5px 14px', borderRadius: 7, fontSize: 13, fontWeight: 500, textTransform: 'capitalize',
            background: filterStatus === s ? 'var(--bg-card)' : 'transparent',
            color: filterStatus === s ? STATUS_COLOURS[s] : 'var(--text-muted)',
            border: filterStatus === s ? '1px solid var(--border)' : '1px solid transparent',
            transition: 'var(--transition)',
          }}>{s}</button>
        ))}
      </div>

      {/* Goals list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {filtered.map(g => (
          <div key={g.id} className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                {/* Priority indicator */}
                <div style={{ width: 4, alignSelf: 'stretch', background: PRIORITY_COLOURS[g.priority], borderRadius: 2, flexShrink: 0 }} />

                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <h3 style={{ fontWeight: 600, fontSize: 15 }}>{g.title}</h3>
                      <span className="badge" style={{ background: STATUS_COLOURS[g.status] + '20', color: STATUS_COLOURS[g.status], fontSize: 10 }}>
                        {g.status}
                      </span>
                      {g.area_name && (
                        <span className="badge" style={{ background: g.area_colour + '20', color: g.area_colour, fontSize: 10 }}>
                          {g.area_name}
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="btn-icon btn-sm" onClick={() => toggleExpand(g.id)} style={{ fontSize: 12 }}>
                        {expanded === g.id ? '▲' : '▼'}
                      </button>
                      <button className="btn-icon btn-sm" onClick={() => handleDelete(g.id)} style={{ fontSize: 14 }}>×</button>
                    </div>
                  </div>

                  {g.description && <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>{g.description}</p>}

                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Progress</span>
                        <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>{g.progress}%</span>
                      </div>
                      <input type="range" min="0" max="100" value={g.progress} onChange={e => handleProgress(g.id, e.target.value)}
                        style={{ width: '100%', height: 4, accentColor: g.area_colour || 'var(--accent)', cursor: 'pointer', background: 'transparent', border: 'none', padding: 0 }} />
                    </div>
                    {g.target_date && <span style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>📅 {fmt.date(g.target_date)}</span>}
                    {g.milestone_count > 0 && (
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        ✓ {g.milestones_done}/{g.milestone_count}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Expanded view: milestones + linked habits + linked time projects */}
            {expanded === g.id && (
              <div style={{ borderTop: '1px solid var(--border)', padding: '16px 20px', background: 'var(--bg-secondary)' }}>
                {/* Milestones section (existing) */}
                <div style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: 12 }}>
                  Milestones
                </div>
                {(milestones[g.id] || []).map(ms => (
                  <div key={ms.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                    <button onClick={() => toggleMilestone(ms)} style={{
                      width: 18, height: 18, borderRadius: 4, border: `2px solid ${ms.completed ? 'var(--green)' : 'var(--border)'}`,
                      background: ms.completed ? 'var(--green)' : 'transparent', fontSize: 11, color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    }}>{ms.completed ? '✓' : ''}</button>
                    <span style={{ flex: 1, fontSize: 13, textDecoration: ms.completed ? 'line-through' : 'none', color: ms.completed ? 'var(--text-muted)' : 'var(--text-primary)' }}>
                      {ms.title}
                    </span>
                    {ms.due_date && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{fmt.dateShort(ms.due_date)}</span>}
                  </div>
                ))}
                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                  <input placeholder="Add milestone..." value={msForm.title || ''} onChange={e => setMsForm({...msForm, title: e.target.value, goal_id: g.id})}
                    onKeyDown={e => e.key === 'Enter' && msForm.title && addMilestone(g.id)} style={{ fontSize: 13 }} />
                  <input type="date" value={msForm.due_date || ''} onChange={e => setMsForm({...msForm, due_date: e.target.value})} style={{ width: 160 }} />
                  <button className="btn btn-ghost btn-sm" onClick={() => msForm.title && addMilestone(g.id)}>Add</button>
                </div>

                {/* Stage 4: Linked Habits */}
                <div style={{ marginTop: 24 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: 12 }}>
                    Linked Habits
                  </div>
                  {linkedHabits[g.id] && linkedHabits[g.id].length > 0 ? (
                    linkedHabits[g.id].map(h => (
                      <div key={h.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                        <span style={{ fontSize: 13 }}>{h.name}</span>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Streak: {h.current_streak || 0} days</span>
                      </div>
                    ))
                  ) : (
                    <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>No habits linked to this goal</p>
                  )}
                </div>

                {/* Stage 4: Linked Time Projects */}
                <div style={{ marginTop: 20 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: 12 }}>
                    Linked Time Projects
                  </div>
                  {linkedTime[g.id] && linkedTime[g.id].length > 0 ? (
                    linkedTime[g.id].map(p => (
                      <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                        <span style={{ fontSize: 13 }}>{p.name}</span>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{fmt.duration(p.total_seconds || 0)} total</span>
                      </div>
                    ))
                  ) : (
                    <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>No time projects linked to this goal</p>
                  )}
                </div>

                {/* Status change buttons (existing) */}
                <div style={{ display: 'flex', gap: 6, marginTop: 20 }}>
                  {['active','completed','paused','abandoned'].filter(s => s !== g.status).map(s => (
                    <button key={s} className="btn btn-ghost btn-sm" onClick={() => handleStatus(g.id, s)} style={{ textTransform: 'capitalize', fontSize: 11 }}>
                      → {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
        {filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>◎</div>
            <p>No goals yet. Add one to get started.</p>
          </div>
        )}
      </div>

      {/* Add Goal Modal */}
      {modal === 'goal' && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">New Goal</div>
            <div className="form-group">
              <label className="form-label">Title</label>
              <input placeholder="e.g. Get driving licence" value={form.title || ''} onChange={e => setForm({...form, title: e.target.value})} />
            </div>
            <div className="form-group">
              <label className="form-label">Description</label>
              <textarea rows={3} value={form.description || ''} onChange={e => setForm({...form, description: e.target.value})} />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Life Area</label>
                <select value={form.life_area_id || ''} onChange={e => setForm({...form, life_area_id: e.target.value})}>
                  <option value="">None</option>
                  {areas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Priority</label>
                <select value={form.priority || 'medium'} onChange={e => setForm({...form, priority: e.target.value})}>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Target Date</label>
              <input type="date" value={form.target_date || ''} onChange={e => setForm({...form, target_date: e.target.value})} />
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => setModal(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleAdd}>Add Goal</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}