import { useState, useEffect } from 'react';
import { get, post, fmt } from '../../utils/api.js';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

const MOODS = ['💀','😭','😔','😕','😐','🙂','😊','😄','🤩','🔥'];
const MOOD_LABELS = ['Terrible','Very Bad','Bad','Meh','Neutral','Ok','Good','Great','Amazing','On Fire'];
const ENERGY = ['🪫','🔋','⚡','🚀','💫'];

export default function Journal() {
  const today = new Date().toISOString().split('T')[0];
  const [entry, setEntry] = useState(null);
  const [form, setForm] = useState({ date: today, mood: 5, energy: 3, gratitude: ['', '', ''], tags: [], content: '' });
  const [history, setHistory] = useState([]);
  const [moodData, setMoodData] = useState([]);
  const [selectedDate, setSelectedDate] = useState(today);
  const [view, setView] = useState('write'); // write | history

  const load = async () => {
    const [e, h, m] = await Promise.allSettled([
      get(`/journal/${selectedDate}`),
      get('/journal?limit=30'),
      get('/journal/stats/mood'),
    ]);
    if (e.value) {
      setEntry(e.value);
      setForm({
        date: e.value.date,
        mood: e.value.mood || 5,
        energy: e.value.energy || 3,
        content: e.value.content || '',
        gratitude: e.value.gratitude?.length ? e.value.gratitude : ['', '', ''],
        tags: e.value.tags || [],
      });
    } else {
      setEntry(null);
      setForm(f => ({ ...f, date: selectedDate, content: '', mood: 5, energy: 3, gratitude: ['', '', ''] }));
    }
    if (h.value) setHistory(h.value);
    if (m.value) setMoodData(m.value.map(d => ({ date: d.date, mood: d.mood, energy: d.energy })).reverse());
  };

  useEffect(() => { load(); }, [selectedDate]);

  const handleSave = async () => {
    const data = { ...form, gratitude: form.gratitude.filter(Boolean) };
    await post('/journal', data);
    load();
  };

  return (
    <div className="page animate-fade">
      <div className="page-header">
        <div>
          <h1 className="page-title">Journal</h1>
          <p className="page-subtitle">Daily reflections & mood tracking</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {['write', 'history'].map(v => (
            <button key={v} onClick={() => setView(v)} className={`btn ${view === v ? 'btn-primary' : 'btn-ghost'}`} style={{ textTransform: 'capitalize' }}>{v}</button>
          ))}
        </div>
      </div>

      {view === 'write' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 20 }}>
          {/* Editor */}
          <div>
            {/* Date selector */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
              <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} style={{ width: 180 }} />
              <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                {new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
              </span>
              {entry && <span className="badge" style={{ background: 'var(--green-dim)', color: 'var(--green)' }}>Saved</span>}
            </div>

            {/* Mood */}
            <div className="card" style={{ marginBottom: 16 }}>
              <div style={{ marginBottom: 12 }}>
                <div className="form-label">Mood</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {MOODS.map((m, i) => (
                    <button key={i} onClick={() => setForm(f => ({ ...f, mood: i + 1 }))} style={{
                      fontSize: 22, padding: '4px', borderRadius: 8, border: `2px solid ${form.mood === i + 1 ? 'var(--accent)' : 'transparent'}`,
                      background: form.mood === i + 1 ? 'var(--accent-dim)' : 'transparent', cursor: 'pointer',
                      transform: form.mood === i + 1 ? 'scale(1.2)' : 'scale(1)', transition: 'var(--transition)',
                    }} title={MOOD_LABELS[i]}>{m}</button>
                  ))}
                </div>
                {form.mood && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>{MOOD_LABELS[form.mood - 1]}</div>}
              </div>

              <div>
                <div className="form-label">Energy</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {ENERGY.map((e, i) => (
                    <button key={i} onClick={() => setForm(f => ({ ...f, energy: i + 1 }))} style={{
                      fontSize: 22, padding: '4px', borderRadius: 8, border: `2px solid ${form.energy === i + 1 ? 'var(--amber)' : 'transparent'}`,
                      background: form.energy === i + 1 ? 'var(--amber-dim)' : 'transparent', cursor: 'pointer',
                    }}>{e}</button>
                  ))}
                </div>
              </div>
            </div>

            {/* Gratitude */}
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="form-label" style={{ marginBottom: 10 }}>Gratitude — 3 things today</div>
              {form.gratitude.map((g, i) => (
                <input key={i} placeholder={`Grateful for... (${i + 1})`} value={g} onChange={e => {
                  const arr = [...form.gratitude]; arr[i] = e.target.value;
                  setForm(f => ({ ...f, gratitude: arr }));
                }} style={{ marginBottom: 8 }} />
              ))}
            </div>

            {/* Journal entry */}
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="form-label" style={{ marginBottom: 10 }}>Journal Entry</div>
              <textarea
                value={form.content}
                onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
                placeholder="What happened today? How did you feel? What did you learn?"
                rows={10}
                style={{ fontSize: 15, lineHeight: 1.8, resize: 'vertical' }}
              />
            </div>

            <button className="btn btn-primary" onClick={handleSave} style={{ width: '100%', justifyContent: 'center', padding: 14, fontSize: 15 }}>
              💾 Save Entry
            </button>
          </div>

          {/* Sidebar: mood chart */}
          <div>
            <div className="card" style={{ marginBottom: 16 }}>
              <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>Mood Trend (90 days)</h3>
              <ResponsiveContainer width="100%" height={160}>
                <LineChart data={moodData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="date" hide />
                  <YAxis domain={[1, 10]} tick={{ fontSize: 10 }} stroke="var(--text-muted)" />
                  <Tooltip formatter={(v, n) => [v, n === 'mood' ? 'Mood' : 'Energy']}
                    contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} />
                  <Line type="monotone" dataKey="mood" stroke="var(--accent)" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="energy" stroke="var(--amber)" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Recent entries */}
            <div className="card">
              <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Recent Entries</h3>
              {history.slice(0, 10).map(h => (
                <div key={h.id} onClick={() => setSelectedDate(h.date)} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '8px 0', borderBottom: '1px solid var(--border)', cursor: 'pointer',
                }}>
                  <span style={{ fontSize: 13, color: h.date === selectedDate ? 'var(--accent)' : 'var(--text-primary)' }}>
                    {fmt.date(h.date)}
                  </span>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {h.mood && <span style={{ fontSize: 16 }}>{MOODS[h.mood - 1]}</span>}
                    {h.energy && <span style={{ fontSize: 14 }}>{ENERGY[h.energy - 1]}</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {view === 'history' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {history.map(h => (
            <div key={h.id} className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                <div>
                  <div style={{ fontWeight: 600 }}>{fmt.date(h.date)}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {new Date(h.date + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long' })}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  {h.mood && <span style={{ fontSize: 22 }} title={MOOD_LABELS[h.mood - 1]}>{MOODS[h.mood - 1]}</span>}
                  {h.energy && <span style={{ fontSize: 20 }} title={`Energy ${h.energy}`}>{ENERGY[h.energy - 1]}</span>}
                </div>
              </div>
              {h.content && <p style={{ fontSize: 14, lineHeight: 1.7, color: 'var(--text-secondary)' }}>{h.content.slice(0, 300)}{h.content.length > 300 ? '...' : ''}</p>}
              {h.gratitude?.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>GRATEFUL FOR</div>
                  {h.gratitude.map((g, i) => g && (
                    <div key={i} style={{ fontSize: 13, color: 'var(--green)', marginBottom: 2 }}>✓ {g}</div>
                  ))}
                </div>
              )}
              <button className="btn btn-ghost btn-sm" style={{ marginTop: 12 }} onClick={() => { setSelectedDate(h.date); setView('write'); }}>
                Edit
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
