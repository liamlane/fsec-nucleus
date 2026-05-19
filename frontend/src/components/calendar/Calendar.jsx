import { useState, useEffect } from 'react';
import { get, post, del, fmt } from '../../utils/api.js';

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DOWS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

export default function Calendar() {
  const today = new Date();
  const [cur, setCur] = useState({ year: today.getFullYear(), month: today.getMonth() });
  const [events, setEvents] = useState([]);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({});
  const [selected, setSelected] = useState(null);

  const load = async () => {
    const from = new Date(cur.year, cur.month, 1).toISOString();
    const to = new Date(cur.year, cur.month + 1, 0, 23, 59).toISOString();
    const ev = await get(`/events?from=${from}&to=${to}`);
    if (ev) setEvents(ev);
  };

  useEffect(() => { load(); }, [cur]);

  const daysInMonth = new Date(cur.year, cur.month + 1, 0).getDate();
  const firstDow = new Date(cur.year, cur.month, 1).getDay();
  const cells = Array.from({ length: Math.ceil((firstDow + daysInMonth) / 7) * 7 }, (_, i) => {
    const day = i - firstDow + 1;
    return day >= 1 && day <= daysInMonth ? day : null;
  });

  const eventsOnDay = (day) => {
    if (!day) return [];
    const dateStr = `${cur.year}-${String(cur.month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return events.filter(e => e.start_time.split('T')[0] === dateStr);
  };

  const isToday = (day) => day === today.getDate() && cur.month === today.getMonth() && cur.year === today.getFullYear();

  const handleAdd = async () => {
    await post('/events', form);
    setModal(null); setForm({}); load();
  };

  const prevMonth = () => setCur(c => c.month === 0 ? { year: c.year - 1, month: 11 } : { ...c, month: c.month - 1 });
  const nextMonth = () => setCur(c => c.month === 11 ? { year: c.year + 1, month: 0 } : { ...c, month: c.month + 1 });

  return (
    <div className="page animate-fade">
      <div className="page-header">
        <div>
          <h1 className="page-title">Calendar</h1>
          <p className="page-subtitle">{MONTHS[cur.month]} {cur.year}</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-ghost" onClick={() => setCur({ year: today.getFullYear(), month: today.getMonth() })}>Today</button>
          <button className="btn btn-primary" onClick={() => {
            const d = `${cur.year}-${String(cur.month + 1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
            setForm({ start_time: `${d}T09:00`, all_day: false });
            setModal('event');
          }}>+ Event</button>
        </div>
      </div>

      {/* Month nav */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
        <button className="btn-icon" onClick={prevMonth} style={{ fontSize: 18 }}>‹</button>
        <h2 style={{ fontSize: 18, fontWeight: 700, minWidth: 200, textAlign: 'center' }}>{MONTHS[cur.month]} {cur.year}</h2>
        <button className="btn-icon" onClick={nextMonth} style={{ fontSize: 18 }}>›</button>
      </div>

      {/* Calendar grid */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {/* Day headers */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: '1px solid var(--border)' }}>
          {DOWS.map(d => (
            <div key={d} style={{ padding: '8px', textAlign: 'center', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>{d}</div>
          ))}
        </div>

        {/* Days */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
          {cells.map((day, i) => {
            const dayEvents = eventsOnDay(day);
            return (
              <div key={i} onClick={() => day && setSelected(day)} style={{
                minHeight: 90, padding: '8px', borderRight: (i + 1) % 7 !== 0 ? '1px solid var(--border)' : 'none',
                borderBottom: i < cells.length - 7 ? '1px solid var(--border)' : 'none',
                background: selected === day ? 'var(--accent-dim)' : 'transparent',
                cursor: day ? 'pointer' : 'default',
                transition: 'var(--transition)',
              }}
              onMouseEnter={e => { if (day) e.currentTarget.style.background = 'var(--bg-hover)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = selected === day ? 'var(--accent-dim)' : 'transparent'; }}
              >
                {day && (
                  <>
                    <div style={{
                      width: 26, height: 26, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 4,
                      background: isToday(day) ? 'var(--accent)' : 'transparent',
                      color: isToday(day) ? 'white' : 'var(--text-primary)',
                      fontWeight: isToday(day) ? 700 : 400,
                      fontSize: 13,
                    }}>{day}</div>
                    {dayEvents.slice(0, 3).map(ev => (
                      <div key={ev.id} style={{
                        fontSize: 11, padding: '2px 5px', borderRadius: 3, marginBottom: 2,
                        background: ev.colour + '30', color: ev.colour, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>{ev.title}</div>
                    ))}
                    {dayEvents.length > 3 && <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>+{dayEvents.length - 3} more</div>}
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Selected day events */}
      {selected && eventsOnDay(selected).length > 0 && (
        <div className="card" style={{ marginTop: 20 }}>
          <h3 style={{ marginBottom: 16, fontSize: 14, fontWeight: 600 }}>
            {selected} {MONTHS[cur.month]}
          </h3>
          {eventsOnDay(selected).map(ev => (
            <div key={ev.id} style={{ display: 'flex', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
              <div style={{ width: 4, background: ev.colour, borderRadius: 2, alignSelf: 'stretch' }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600 }}>{ev.title}</div>
                {ev.description && <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 2 }}>{ev.description}</div>}
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                  {ev.all_day ? 'All day' : new Date(ev.start_time).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                  {ev.location && ` · ${ev.location}`}
                </div>
              </div>
              <button className="btn-icon btn-sm" onClick={async () => { await del(`/events/${ev.id}`); load(); }}>×</button>
            </div>
          ))}
        </div>
      )}

      {modal === 'event' && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">New Event</div>
            <div className="form-group">
              <label className="form-label">Title</label>
              <input value={form.title || ''} onChange={e => setForm({...form, title: e.target.value})} placeholder="Event title" />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Start</label>
                <input type="datetime-local" value={form.start_time || ''} onChange={e => setForm({...form, start_time: e.target.value})} />
              </div>
              <div className="form-group">
                <label className="form-label">End</label>
                <input type="datetime-local" value={form.end_time || ''} onChange={e => setForm({...form, end_time: e.target.value})} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Location</label>
              <input value={form.location || ''} onChange={e => setForm({...form, location: e.target.value})} placeholder="Optional location" />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Category</label>
                <select value={form.category || 'personal'} onChange={e => setForm({...form, category: e.target.value})}>
                  <option value="personal">Personal</option>
                  <option value="work">Work</option>
                  <option value="health">Health</option>
                  <option value="family">Family</option>
                  <option value="social">Social</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Colour</label>
                <input type="color" value={form.colour || '#6366f1'} onChange={e => setForm({...form, colour: e.target.value})} style={{ height: 40 }} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => setModal(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleAdd}>Add Event</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
