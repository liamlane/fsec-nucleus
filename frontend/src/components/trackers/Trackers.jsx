import { useState, useEffect } from 'react';
import { get, post, patch, del } from '../../utils/api.js';

export default function Trackers() {
  const [contacts, setContacts] = useState([]);
  const [modal, setModal]       = useState(null); // 'add' | 'edit'
  const [form, setForm]         = useState({});
  const [editing, setEditing]   = useState(null);

  const today = new Date().toISOString().split('T')[0];

  const load = async () => {
    const data = await get('/trackers/contacts');
    if (data) setContacts(data);
  };

  useEffect(() => { load(); }, []);

  const daysSince = (dateStr) => {
    if (!dateStr) return null;
    const ref = new Date(dateStr.split('T')[0]);
    const now = new Date();
    now.setHours(0, 0, 0, 0); ref.setHours(0, 0, 0, 0);
    return Math.max(0, Math.floor((now - ref) / 86400000));
  };

  const statusColour = (contact) => {
    const days = daysSince(contact.last_contacted);
    const freq = contact.contact_frequency_days || 30;
    if (days === null) return 'var(--text-muted)';
    if (days <= freq) return 'var(--green)';
    if (days <= freq * 1.5) return 'var(--yellow, #f59e0b)';
    return 'var(--red)';
  };

  const handleAdd = async () => {
    if (!form.name) return;
    await post('/trackers/contacts', {
      name: form.name,
      relationship: form.relationship || null,
      last_contacted: form.last_contacted || null,
      contact_frequency_days: form.contact_frequency_days ? parseInt(form.contact_frequency_days) : 30,
      notes: form.notes || null,
    });
    setModal(null); setForm({}); load();
  };

  const handleEdit = async () => {
    await patch(`/trackers/contacts/${editing.id}`, {
      name: form.name,
      relationship: form.relationship || null,
      last_contacted: form.last_contacted || null,
      contact_frequency_days: form.contact_frequency_days ? parseInt(form.contact_frequency_days) : 30,
      notes: form.notes || null,
    });
    setModal(null); setForm({}); setEditing(null); load();
  };

  const handleMarkContacted = async (contact) => {
    await patch(`/trackers/contacts/${contact.id}`, { last_contacted: today });
    load();
  };

  const handleDelete = async (id) => {
    if (window.confirm('Delete this contact?')) { await del(`/trackers/contacts/${id}`); load(); }
  };

  const overdue = contacts.filter(c => {
    const days = daysSince(c.last_contacted);
    return days === null || days > (c.contact_frequency_days || 30);
  });

  return (
    <div className="page animate-fade">
      <div className="page-header">
        <div>
          <h1 className="page-title">Trackers</h1>
          <p className="page-subtitle">
            {contacts.length} contact{contacts.length === 1 ? '' : 's'}
            {overdue.length > 0 && ` · ${overdue.length} overdue`}
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => { setModal('add'); setForm({ contact_frequency_days: 30 }); }}>
          + Contact
        </button>
      </div>

      {/* ── Contact Cards ─────────────────────────────────────────────────── */}
      {contacts.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>👥</div>
          <div style={{ fontSize: 15, marginBottom: 6 }}>No contacts yet</div>
          <div style={{ fontSize: 13 }}>Add people you want to stay in touch with</div>
        </div>
      ) : (
        <div className="card-grid">
          {contacts.map(c => {
            const days = daysSince(c.last_contacted);
            const freq = c.contact_frequency_days || 30;
            const colour = statusColour(c);
            return (
              <div key={c.id} className="card" style={{ position: 'relative' }}>
                {/* Status dot */}
                <div style={{
                  position: 'absolute', top: 14, right: 14,
                  width: 10, height: 10, borderRadius: '50%',
                  background: colour,
                }} />

                <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 2, paddingRight: 20 }}>
                  {c.name}
                </div>
                {c.relationship && (
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>
                    {c.relationship}
                  </div>
                )}

                <div style={{ display: 'flex', gap: 20, marginBottom: 10 }}>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Last contact
                    </div>
                    <div style={{ fontSize: 16, fontWeight: 600, fontFamily: 'var(--font-mono)', color: colour }}>
                      {days === null ? 'Never' : days === 0 ? 'Today' : `${days}d ago`}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Frequency
                    </div>
                    <div style={{ fontSize: 16, fontWeight: 600, fontFamily: 'var(--font-mono)' }}>
                      every {freq}d
                    </div>
                  </div>
                </div>

                {c.notes && (
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10, paddingBottom: 10, borderBottom: '1px solid var(--border)' }}>
                    {c.notes}
                  </div>
                )}

                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-primary btn-sm" style={{ flex: 1 }}
                    onClick={() => handleMarkContacted(c)}>
                    ✓ Contacted
                  </button>
                  <button className="btn btn-ghost btn-sm"
                    onClick={() => { setEditing(c); setForm({ ...c, last_contacted: c.last_contacted ? c.last_contacted.split('T')[0] : '' }); setModal('edit'); }}>
                    Edit
                  </button>
                  <button className="btn btn-ghost btn-sm"
                    onClick={() => handleDelete(c.id)}
                    style={{ color: 'var(--red)' }}>
                    ✕
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Add Modal ─────────────────────────────────────────────────────── */}
      {modal === 'add' && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">New Contact</div>
            <div className="form-group">
              <label className="form-label">Name</label>
              <input placeholder="e.g. Alice Smith" value={form.name || ''} onChange={e => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">Relationship</label>
              <input placeholder="e.g. Friend, Family, Colleague" value={form.relationship || ''} onChange={e => setForm({ ...form, relationship: e.target.value })} />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Last contacted</label>
                <input type="date" value={form.last_contacted || ''} onChange={e => setForm({ ...form, last_contacted: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Check-in every (days)</label>
                <input type="number" min="1" value={form.contact_frequency_days || 30} onChange={e => setForm({ ...form, contact_frequency_days: e.target.value })} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Notes (optional)</label>
              <input placeholder="Anything to remember..." value={form.notes || ''} onChange={e => setForm({ ...form, notes: e.target.value })} />
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => { setModal(null); setForm({}); }}>Cancel</button>
              <button className="btn btn-primary" onClick={handleAdd}>Add Contact</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit Modal ─────────────────────────────────────────────────────── */}
      {modal === 'edit' && editing && (
        <div className="modal-overlay" onClick={() => { setModal(null); setEditing(null); }}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">Edit Contact</div>
            <div className="form-group">
              <label className="form-label">Name</label>
              <input value={form.name || ''} onChange={e => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">Relationship</label>
              <input value={form.relationship || ''} onChange={e => setForm({ ...form, relationship: e.target.value })} />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Last contacted</label>
                <input type="date" value={form.last_contacted || ''} onChange={e => setForm({ ...form, last_contacted: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Check-in every (days)</label>
                <input type="number" min="1" value={form.contact_frequency_days || 30} onChange={e => setForm({ ...form, contact_frequency_days: e.target.value })} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Notes (optional)</label>
              <input value={form.notes || ''} onChange={e => setForm({ ...form, notes: e.target.value })} />
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => { setModal(null); setEditing(null); setForm({}); }}>Cancel</button>
              <button className="btn btn-primary" onClick={handleEdit}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
