import { useState, useEffect } from 'react';
import { get, post, patch, del, fmt, confirmDestructive } from '../../utils/api';

const TABS = ['Dashboard', 'Open', 'All', 'Closed'];

const STATUS = {
  new:                  { label: 'New',              colour: 'var(--blue)' },
  triaged:              { label: 'Triaged',          colour: 'var(--blue)' },
  in_progress:          { label: 'In Progress',      colour: 'var(--accent)' },
  waiting_client:       { label: 'Waiting (Client)',  colour: 'var(--amber)' },
  waiting_third_party:  { label: 'Waiting (3rd Party)', colour: 'var(--amber)' },
  resolved:             { label: 'Resolved',         colour: 'var(--green)' },
  closed:               { label: 'Closed',           colour: 'var(--text-muted)' },
  cancelled:            { label: 'Cancelled',        colour: 'var(--text-muted)' },
};

const PRIORITY = {
  critical: { label: 'Critical', colour: 'var(--red)',        bg: 'rgba(255,77,109,0.15)' },
  high:     { label: 'High',     colour: 'var(--amber)',      bg: 'rgba(255,181,71,0.15)' },
  medium:   { label: 'Medium',   colour: 'var(--blue)',       bg: 'rgba(77,166,255,0.15)' },
  low:      { label: 'Low',      colour: 'var(--text-muted)', bg: 'var(--bg-secondary)' },
};

const CATEGORIES = ['network','server','desktop','cloud','security','email','backup','hardware','software','access','telephony','printing','other'];
const TYPES = { incident: 'Incident', service_request: 'Service Request', change: 'Change', problem: 'Problem' };
const UPDATE_TYPES = { note: 'Note', time_entry: 'Time Entry', escalation: 'Escalation', resolution: 'Resolution' };

function fmtMins(m) {
  if (!m) return '0m';
  const h = Math.floor(m / 60); const r = m % 60;
  return h ? `${h}h ${r}m` : `${r}m`;
}

export default function Tickets() {
  const [tab, setTab] = useState('Dashboard');
  const [dashboard, setDashboard] = useState(null);
  const [tickets, setTickets] = useState([]);
  const [clients, setClients] = useState([]);
  const [projects, setProjects] = useState([]);
  const [selected, setSelected] = useState(null);
  const [addModal, setAddModal] = useState(false);
  const [editModal, setEditModal] = useState(null);
  // Filters
  const [fPriority, setFPriority] = useState('');
  const [fCategory, setFCategory] = useState('');
  const [fClient, setFClient] = useState('');
  const [fSearch, setFSearch] = useState('');

  const loadDashboard = async () => { const d = await get('/tickets/dashboard'); if (d) setDashboard(d); };
  const loadClients = async () => { const d = await get('/business/clients'); if (d) setClients(d); };
  const loadProjects = async () => { const d = await get('/business/projects'); if (d) setProjects(d); };

  const loadTickets = async () => {
    const p = new URLSearchParams();
    if (tab === 'Closed') { p.set('status', 'closed'); }
    else if (tab === 'Open') { /* default excludes closed/cancelled */ }
    else if (tab === 'All') { p.set('status', ''); } // backend: no status filter shows all? Actually we need a way to show all. Let me handle this differently
    if (fPriority) p.set('priority', fPriority);
    if (fCategory) p.set('category', fCategory);
    if (fClient)   p.set('client_id', fClient);
    if (fSearch)   p.set('q', fSearch);
    // For "All" tab, we want to include closed/cancelled too
    let url = `/tickets?${p}`;
    if (tab === 'All') url = `/tickets?status=new&${p}`;
    // Actually simpler: fetch without status filter for All, with specific statuses for Closed
    const d = await get(`/tickets?${p}`);
    if (d) setTickets(d);
  };

  useEffect(() => { loadClients(); loadProjects(); }, []);
  useEffect(() => {
    if (tab === 'Dashboard') loadDashboard();
    else loadTickets();
  }, [tab, fPriority, fCategory, fClient, fSearch]);

  // For "All" tab we re-fetch including closed
  const loadAll = async () => {
    const p = new URLSearchParams();
    // Fetch open
    const open = await get(`/tickets?${p}`);
    // Fetch closed
    p.set('status', 'closed');
    const closed = await get(`/tickets?${p}`);
    // Fetch cancelled
    p.set('status', 'cancelled');
    const cancelled = await get(`/tickets?${p}`);
    setTickets([...(open || []), ...(closed || []), ...(cancelled || [])]);
  };

  useEffect(() => {
    if (tab === 'All') loadAll();
  }, [tab]);

  const clientMap = {};
  clients.forEach(c => { clientMap[c.id] = c; });

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1>Tickets</h1>
          <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>IT job tracking, time logging, and billing for FLT.</div>
        </div>
        <button className="btn btn-primary" onClick={() => setAddModal(true)}>+ New ticket</button>
      </div>

      <div className="tabs" style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid var(--border)', overflowX: 'auto' }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '10px 16px', background: 'transparent', border: 'none',
            borderBottom: tab === t ? '2px solid var(--accent)' : '2px solid transparent',
            color: tab === t ? 'var(--text-primary)' : 'var(--text-muted)',
            fontSize: 14, fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap',
          }}>{t}</button>
        ))}
      </div>

      {tab === 'Dashboard' && <TicketDashboard dashboard={dashboard} onSelect={setSelected} />}

      {tab !== 'Dashboard' && (
        <>
          <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
            <input placeholder="Search tickets..." value={fSearch} onChange={e => setFSearch(e.target.value)} style={{ maxWidth: 240 }} />
            <select value={fPriority} onChange={e => setFPriority(e.target.value)} style={{ maxWidth: 140 }}>
              <option value="">All priorities</option>
              {Object.entries(PRIORITY).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <select value={fCategory} onChange={e => setFCategory(e.target.value)} style={{ maxWidth: 160 }}>
              <option value="">All categories</option>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <select value={fClient} onChange={e => setFClient(e.target.value)} style={{ maxWidth: 200 }}>
              <option value="">All clients</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <TicketList tickets={tickets} onSelect={setSelected} />
        </>
      )}

      {selected && <TicketDetail ticketId={selected} clients={clients} projects={projects}
        onClose={() => setSelected(null)}
        onEdit={t => { setEditModal(t); setSelected(null); }}
        onChanged={() => { loadTickets(); loadDashboard(); }} />}

      {addModal && <TicketFormModal mode="new" clients={clients} projects={projects}
        onClose={() => setAddModal(false)}
        onSaved={() => { setAddModal(false); loadTickets(); loadDashboard(); }} />}

      {editModal && <TicketFormModal mode="edit" existing={editModal} clients={clients} projects={projects}
        onClose={() => setEditModal(null)}
        onSaved={() => { setEditModal(null); loadTickets(); loadDashboard(); }} />}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════════════════════════════
function TicketDashboard({ dashboard, onSelect }) {
  if (!dashboard) return <div className="card">Loading...</div>;
  const t = dashboard.totals || {};
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 20 }}>
        <KpiCard label="Open tickets" value={t.open || 0} colour="var(--accent)" />
        <KpiCard label="Created (7d)" value={t.created_7d || 0} colour="var(--blue)" />
        <KpiCard label="Resolved (7d)" value={t.resolved_7d || 0} colour="var(--green)" />
        <KpiCard label="Open time logged" value={fmtMins(t.open_time_mins)} colour="var(--text-primary)" />
      </div>

      {/* Priority breakdown */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {['critical','high','medium','low'].map(p => {
          const count = dashboard.open_by_priority[p] || 0;
          const cfg = PRIORITY[p];
          return (
            <div key={p} className="card" style={{ flex: 1, textAlign: 'center', padding: 12 }}>
              <div style={{ fontSize: 24, fontWeight: 700, color: cfg.colour, fontFamily: 'var(--font-mono)' }}>{count}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{cfg.label}</div>
            </div>
          );
        })}
      </div>

      {/* SLA breaches */}
      {dashboard.sla_breaches.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <SectionHeader title="SLA breaches" />
          <div className="card" style={{ padding: 12, background: 'rgba(255,77,109,0.06)', border: '1px solid rgba(255,77,109,0.2)', marginBottom: 8, fontSize: 12 }}>
            These tickets have missed their SLA response or resolution target.
          </div>
          {dashboard.sla_breaches.map(t => (
            <div key={t.id} onClick={() => onSelect(t.id)} className="card" style={{ cursor: 'pointer', marginBottom: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)', marginRight: 8 }}>{t.ticket_number}</span>
                <strong>{t.title}</strong>
                {t.client_name && <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--text-muted)' }}>{t.client_name}</span>}
              </div>
              <PriorityBadge level={t.priority} />
            </div>
          ))}
        </div>
      )}

      {/* Recent activity */}
      {dashboard.recent_updates.length > 0 && (
        <div>
          <SectionHeader title="Recent activity" />
          <div className="card" style={{ padding: 0 }}>
            <table><thead><tr><th>Ticket</th><th>Activity</th><th>Time</th><th>When</th></tr></thead>
            <tbody>{dashboard.recent_updates.map(u => (
              <tr key={u.ticket_id + u.created_at} onClick={() => onSelect(u.ticket_id)} style={{ cursor: 'pointer' }}>
                <td style={{ fontSize: 12 }}>
                  <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>{u.ticket_number}</span>
                  <div style={{ fontSize: 12 }}>{u.title}</div>
                </td>
                <td style={{ fontSize: 12, maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.content}</td>
                <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{u.time_minutes ? fmtMins(u.time_minutes) : ''}</td>
                <td style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{fmt.dateTime(u.created_at)}</td>
              </tr>
            ))}</tbody></table>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// LIST
// ═══════════════════════════════════════════════════════════════
function TicketList({ tickets, onSelect }) {
  if (!tickets.length) return <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>No tickets match these filters.</div>;
  return (
    <div className="card" style={{ padding: 0 }}>
      <table><thead><tr>
        <th>Priority</th><th>Ticket</th><th>Client</th><th>Category</th><th>Time</th><th>Status</th><th></th>
      </tr></thead>
      <tbody>{tickets.map(t => (
        <tr key={t.id} onClick={() => onSelect(t.id)} style={{ cursor: 'pointer' }}>
          <td><PriorityBadge level={t.priority} /></td>
          <td>
            <div style={{ fontWeight: 500 }}>{t.title}</div>
            <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>{t.ticket_number}</div>
          </td>
          <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t.client_name || '—'}</td>
          <td style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'capitalize' }}>{t.category || '—'}</td>
          <td style={{ fontSize: 12, fontFamily: 'var(--font-mono)' }}>{fmtMins(t.total_time_minutes)}</td>
          <td><StatusBadge status={t.status} /></td>
          <td>
            {(t.sla_response_breached || t.sla_resolution_breached) && <span style={{ color: 'var(--red)', fontSize: 14 }} title="SLA breached">⚠</span>}
          </td>
        </tr>
      ))}</tbody></table>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// DETAIL
// ═══════════════════════════════════════════════════════════════
function TicketDetail({ ticketId, clients, projects, onClose, onEdit, onChanged }) {
  const [ticket, setTicket] = useState(null);
  const [updates, setUpdates] = useState([]);
  const [showAddUpdate, setShowAddUpdate] = useState(null); // 'note' | 'time'
  const [statusChange, setStatusChange] = useState('');

  const reload = async () => {
    const [t, u] = await Promise.all([get(`/tickets/${ticketId}`), get(`/tickets/${ticketId}/updates`)]);
    if (t) setTicket(t);
    if (u) setUpdates(u);
  };
  useEffect(() => { reload(); }, [ticketId]);
  if (!ticket) return null;

  const changeStatus = async (newStatus) => {
    await patch(`/tickets/${ticketId}`, { status: newStatus });
    reload(); onChanged();
  };

  const generateInvoice = async () => {
    if (!confirmDestructive(`Generate a draft invoice from this ticket's logged time?`)) return;
    try {
      const result = await post(`/tickets/${ticketId}/generate-invoice`, {});
      alert(`Invoice ${result.invoice.invoice_number} created as draft.`);
      reload(); onChanged();
    } catch (e) { alert(e.message); }
  };

  const deleteTicket = async () => {
    if (!confirmDestructive('Delete this ticket and all its activity history?')) return;
    await del(`/tickets/${ticketId}`);
    onClose(); onChanged();
  };

  const removeUpdate = async (id) => {
    if (!confirmDestructive('Delete this entry?')) return;
    await del(`/tickets/${ticketId}/updates/${id}`);
    reload();
  };

  const statusOptions = Object.keys(STATUS).filter(s => s !== ticket.status);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 900, maxHeight: '90vh', overflow: 'auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <PriorityBadge level={ticket.priority} />
              <StatusBadge status={ticket.status} />
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)' }}>{ticket.ticket_number}</span>
              {ticket.billable && <span className="badge" style={{ background: 'rgba(16,217,143,0.15)', color: 'var(--green)', fontSize: 10 }}>Billable</span>}
              {ticket.billed_to_invoice_id && <span className="badge" style={{ background: 'var(--bg-secondary)', color: 'var(--text-muted)', fontSize: 10 }}>Invoiced</span>}
            </div>
            <h2 style={{ margin: 0 }}>{ticket.title}</h2>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
              {ticket.client_name && <><strong>{ticket.client_name}</strong> · </>}
              {ticket.project_name && <>{ticket.project_name} · </>}
              {TYPES[ticket.ticket_type] || ticket.ticket_type}
              {ticket.category && <> · {ticket.category}</>}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-ghost btn-sm" onClick={() => onEdit(ticket)}>Edit</button>
            <button className="btn-icon btn-sm" onClick={onClose}>×</button>
          </div>
        </div>

        {/* KPIs */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8, marginBottom: 16 }}>
          <KpiCard label="Time logged" value={fmtMins(ticket.total_time_minutes)} colour="var(--text-primary)" small />
          {ticket.total_billable_amount != null && <KpiCard label="Billable" value={fmt.currency(ticket.total_billable_amount)} colour="var(--green)" small />}
          {ticket.hourly_rate && <KpiCard label="Rate" value={`${fmt.currency(ticket.hourly_rate)}/hr`} small />}
          <KpiCard label="Created" value={fmt.dateShort(ticket.created_at)} small />
        </div>

        {/* SLA warning */}
        {(ticket.sla_response_breached || ticket.sla_resolution_breached) && (
          <div className="card" style={{ padding: 12, background: 'rgba(255,77,109,0.08)', border: '1px solid rgba(255,77,109,0.2)', marginBottom: 16, fontSize: 12, color: 'var(--red)' }}>
            ⚠ SLA breached:
            {ticket.sla_response_breached && <> Response was due {fmt.dateTime(ticket.response_due_at)}.</>}
            {ticket.sla_resolution_breached && <> Resolution was due {fmt.dateTime(ticket.resolution_due_at)}.</>}
          </div>
        )}

        {/* Description */}
        {ticket.description && (
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>Description</div>
            <div style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>{ticket.description}</div>
          </div>
        )}

        {/* Reporter */}
        {(ticket.reported_by || ticket.reported_email || ticket.reported_phone) && (
          <div className="card" style={{ marginBottom: 16, fontSize: 13 }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>Reported by</div>
            {ticket.reported_by && <div>{ticket.reported_by}</div>}
            {ticket.reported_email && <div style={{ color: 'var(--text-muted)' }}>{ticket.reported_email}</div>}
            {ticket.reported_phone && <div style={{ color: 'var(--text-muted)' }}>{ticket.reported_phone}</div>}
          </div>
        )}

        {/* Quick actions bar */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          <button className="btn btn-primary btn-sm" onClick={() => setShowAddUpdate('note')}>+ Add note</button>
          <button className="btn btn-primary btn-sm" onClick={() => setShowAddUpdate('time')}>+ Log time</button>
          <select value="" onChange={e => { if (e.target.value) changeStatus(e.target.value); }} style={{ maxWidth: 200, fontSize: 13 }}>
            <option value="">Change status...</option>
            {statusOptions.map(s => <option key={s} value={s}>{STATUS[s].label}</option>)}
          </select>
          {ticket.billable && !ticket.billed_to_invoice_id && ticket.total_time_minutes > 0 && (
            <button className="btn btn-ghost btn-sm" onClick={generateInvoice}>Generate invoice</button>
          )}
        </div>

        {/* Activity log */}
        <SectionHeader title={`Activity (${updates.length})`} />
        <div style={{ marginBottom: 16 }}>
          {updates.length === 0 && <div className="card" style={{ textAlign: 'center', padding: 20, color: 'var(--text-muted)' }}>No activity yet.</div>}
          {updates.map(u => (
            <div key={u.id} className="card" style={{ marginBottom: 6, padding: '10px 14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <UpdateTypeBadge type={u.type} />
                    {u.time_minutes > 0 && <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--accent)' }}>{fmtMins(u.time_minutes)}</span>}
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{fmt.dateTime(u.created_at)}</span>
                    {!u.is_internal && <span className="badge" style={{ fontSize: 9, background: 'rgba(77,166,255,0.15)', color: 'var(--blue)' }}>Client-visible</span>}
                  </div>
                  <div style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>{u.content}</div>
                </div>
                <button className="btn-icon btn-sm" onClick={() => removeUpdate(u.id)}>×</button>
              </div>
            </div>
          ))}
        </div>

        {/* Ticket notes */}
        {ticket.notes && (
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>Ticket notes</div>
            <div style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>{ticket.notes}</div>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 16, borderTop: '1px solid var(--border)' }}>
          <button className="btn btn-ghost btn-sm" style={{ color: 'var(--red)' }} onClick={deleteTicket}>Delete ticket</button>
        </div>

        {showAddUpdate && <AddUpdateModal ticketId={ticketId} defaultType={showAddUpdate}
          onClose={() => setShowAddUpdate(null)} onSaved={() => { setShowAddUpdate(null); reload(); onChanged(); }} />}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// ADD/EDIT TICKET FORM
// ═══════════════════════════════════════════════════════════════
function TicketFormModal({ mode, existing, clients, projects, onClose, onSaved }) {
  const [form, setForm] = useState(existing || {
    title: '', description: '', client_id: '', project_id: '',
    priority: 'medium', category: '', ticket_type: 'incident', status: 'new',
    reported_by: '', reported_email: '', reported_phone: '',
    billable: true, hourly_rate: '',
    response_due_at: '', resolution_due_at: '', notes: '',
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  // When client changes, pre-fill hourly rate from client default
  useEffect(() => {
    if (mode === 'new' && form.client_id) {
      const c = clients.find(cl => cl.id === form.client_id);
      if (c?.hourly_rate && !form.hourly_rate) set('hourly_rate', c.hourly_rate);
    }
  }, [form.client_id]);

  // Filter projects by selected client
  const filteredProjects = form.client_id
    ? projects.filter(p => p.client_id === form.client_id)
    : projects;

  const save = async () => {
    if (!form.title) { alert('Title required.'); return; }
    const payload = { ...form };
    for (const k of Object.keys(payload)) { if (payload[k] === '') payload[k] = null; }
    if (mode === 'new') await post('/tickets', payload);
    else                await patch(`/tickets/${existing.id}`, payload);
    onSaved();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 720, maxHeight: '90vh', overflow: 'auto' }}>
        <div className="modal-title">{mode === 'new' ? 'New ticket' : `Edit ${form.title}`}</div>

        <div className="form-group">
          <label className="form-label">Title *</label>
          <input value={form.title || ''} onChange={e => set('title', e.target.value)} autoFocus />
        </div>
        <div className="form-group">
          <label className="form-label">Description</label>
          <textarea rows={4} value={form.description || ''} onChange={e => set('description', e.target.value)} placeholder="What happened? What does the client need?" />
        </div>

        <div className="form-row">
          <div className="form-group"><label className="form-label">Client</label>
            <select value={form.client_id || ''} onChange={e => set('client_id', e.target.value)}>
              <option value="">— No client —</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select></div>
          <div className="form-group"><label className="form-label">Project</label>
            <select value={form.project_id || ''} onChange={e => set('project_id', e.target.value)}>
              <option value="">— No project —</option>
              {filteredProjects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select></div>
        </div>

        <div className="form-row">
          <div className="form-group"><label className="form-label">Priority</label>
            <select value={form.priority} onChange={e => set('priority', e.target.value)}>
              {Object.entries(PRIORITY).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select></div>
          <div className="form-group"><label className="form-label">Category</label>
            <select value={form.category || ''} onChange={e => set('category', e.target.value)}>
              <option value="">—</option>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select></div>
          <div className="form-group"><label className="form-label">Type</label>
            <select value={form.ticket_type} onChange={e => set('ticket_type', e.target.value)}>
              {Object.entries(TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select></div>
        </div>

        <SectionHeader title="Reported by" />
        <div className="form-row">
          <div className="form-group"><label className="form-label">Name</label>
            <input value={form.reported_by || ''} onChange={e => set('reported_by', e.target.value)} /></div>
          <div className="form-group"><label className="form-label">Email</label>
            <input type="email" value={form.reported_email || ''} onChange={e => set('reported_email', e.target.value)} /></div>
          <div className="form-group"><label className="form-label">Phone</label>
            <input value={form.reported_phone || ''} onChange={e => set('reported_phone', e.target.value)} /></div>
        </div>

        <SectionHeader title="Billing" />
        <div className="form-row">
          <div className="form-group" style={{ maxWidth: 160 }}>
            <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" checked={!!form.billable} onChange={e => set('billable', e.target.checked)} />
              <span>Billable</span>
            </label>
          </div>
          <div className="form-group"><label className="form-label">Hourly rate</label>
            <input type="number" step="0.01" value={form.hourly_rate || ''} onChange={e => set('hourly_rate', e.target.value)} placeholder="e.g. 75.00" /></div>
        </div>

        <SectionHeader title="SLA targets (optional)" />
        <div className="form-row">
          <div className="form-group"><label className="form-label">Response due</label>
            <input type="datetime-local" value={form.response_due_at?.slice(0,16) || ''} onChange={e => set('response_due_at', e.target.value ? new Date(e.target.value).toISOString() : null)} /></div>
          <div className="form-group"><label className="form-label">Resolution due</label>
            <input type="datetime-local" value={form.resolution_due_at?.slice(0,16) || ''} onChange={e => set('resolution_due_at', e.target.value ? new Date(e.target.value).toISOString() : null)} /></div>
        </div>

        {mode === 'edit' && (
          <div className="form-group"><label className="form-label">Status</label>
            <select value={form.status} onChange={e => set('status', e.target.value)}>
              {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select></div>
        )}

        <div className="form-group"><label className="form-label">Ticket notes</label>
          <textarea rows={3} value={form.notes || ''} onChange={e => set('notes', e.target.value)} placeholder="Internal notes about this ticket" /></div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={save}>Save</button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// ADD UPDATE (note or time entry)
// ═══════════════════════════════════════════════════════════════
function AddUpdateModal({ ticketId, defaultType, onClose, onSaved }) {
  const isTime = defaultType === 'time';
  const [form, setForm] = useState({
    type: isTime ? 'time_entry' : 'note',
    content: '',
    time_minutes: '',
    is_internal: true,
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const save = async () => {
    if (!form.content) { alert('Content required.'); return; }
    if (form.type === 'time_entry' && !form.time_minutes) { alert('Time (minutes) required for time entries.'); return; }
    const payload = { ...form };
    if (payload.time_minutes) payload.time_minutes = parseInt(payload.time_minutes, 10);
    await post(`/tickets/${ticketId}/updates`, payload);
    onSaved();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-title">{isTime ? 'Log time' : 'Add note'}</div>
        <div className="form-row">
          <div className="form-group"><label className="form-label">Type</label>
            <select value={form.type} onChange={e => set('type', e.target.value)}>
              {Object.entries(UPDATE_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select></div>
          {(form.type === 'time_entry' || isTime) && (
            <div className="form-group"><label className="form-label">Minutes *</label>
              <input type="number" value={form.time_minutes} onChange={e => set('time_minutes', e.target.value)} placeholder="e.g. 30" autoFocus={isTime} /></div>
          )}
        </div>
        <div className="form-group">
          <label className="form-label">{form.type === 'time_entry' ? 'What was done *' : 'Note *'}</label>
          <textarea rows={4} value={form.content} onChange={e => set('content', e.target.value)} autoFocus={!isTime}
            placeholder={form.type === 'time_entry' ? 'Describe the work completed' : 'Add a note to this ticket'} />
        </div>
        <div className="form-group">
          <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="checkbox" checked={!!form.is_internal} onChange={e => set('is_internal', e.target.checked)} />
            <span>Internal only (not visible to client in future portal)</span>
          </label>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={save}>Save</button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// PRIMITIVES
// ═══════════════════════════════════════════════════════════════
function KpiCard({ label, value, colour, small }) {
  return (<div className="card" style={{ padding: small ? 10 : 16 }}>
    <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
    <div style={{ fontSize: small ? 18 : 24, fontWeight: 600, color: colour || 'var(--text-primary)', fontFamily: 'var(--font-mono)', marginTop: 4 }}>{value}</div>
  </div>);
}
function PriorityBadge({ level }) {
  const c = PRIORITY[level] || PRIORITY.medium;
  return <span className="badge" style={{ background: c.bg, color: c.colour, fontSize: 10, fontWeight: 600 }}>{c.label}</span>;
}
function StatusBadge({ status }) {
  const c = STATUS[status] || { label: status, colour: 'var(--text-muted)' };
  return <span className="badge" style={{ background: 'var(--bg-secondary)', color: c.colour, fontSize: 10, fontWeight: 600 }}>{c.label}</span>;
}
function UpdateTypeBadge({ type }) {
  const colours = { note: 'var(--blue)', time_entry: 'var(--accent)', status_change: 'var(--amber)', resolution: 'var(--green)', escalation: 'var(--red)', email: 'var(--text-muted)' };
  return <span className="badge" style={{ background: 'var(--bg-secondary)', color: colours[type] || 'var(--text-muted)', fontSize: 10 }}>{UPDATE_TYPES[type] || type}</span>;
}
function SectionHeader({ title }) {
  return <h3 style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '16px 0 8px' }}>{title}</h3>;
}
