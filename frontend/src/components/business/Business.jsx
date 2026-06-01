import { useState, useEffect } from 'react';
import { get, post, patch, del, fmt } from '../../utils/api.js';

const TABS = ['Dashboard', 'Clients', 'Projects', 'Quotes', 'Invoices', 'Expenses'];

const CLIENT_STATUS = {
  lead:     { label: 'Lead',     colour: '#6b7280' },
  prospect: { label: 'Prospect', colour: '#4da6ff' },
  active:   { label: 'Active',   colour: '#10d98f' },
  dormant:  { label: 'Dormant',  colour: '#f59e0b' },
  lost:     { label: 'Lost',     colour: '#ff4d6d' },
};

const PROJECT_STATUS = {
  quoted:    { label: 'Quoted',    colour: '#6b7280' },
  active:    { label: 'Active',    colour: '#10d98f' },
  on_hold:   { label: 'On hold',   colour: '#f59e0b' },
  completed: { label: 'Completed', colour: '#4da6ff' },
  cancelled: { label: 'Cancelled', colour: '#ff4d6d' },
};

const INVOICE_STATUS = {
  draft:     { label: 'Draft',     colour: '#6b7280' },
  sent:      { label: 'Sent',      colour: '#4da6ff' },
  paid:      { label: 'Paid',      colour: '#10d98f' },
  overdue:   { label: 'Overdue',   colour: '#ff4d6d' },
  cancelled: { label: 'Cancelled', colour: '#6b7280' },
};

const QUOTE_STATUS = {
  draft:    { label: 'Draft',    colour: '#6b7280' },
  sent:     { label: 'Sent',     colour: '#4da6ff' },
  accepted: { label: 'Accepted', colour: '#10d98f' },
  declined: { label: 'Declined', colour: '#ff4d6d' },
  expired:  { label: 'Expired',  colour: '#f59e0b' },
};

const EXPENSE_CATEGORIES = [
  'Travel', 'Software', 'Equipment', 'Professional fees',
  'Marketing', 'Utilities', 'Office', 'Subsistence', 'Other',
];

export default function Business() {
  const [tab, setTab]           = useState('Dashboard');
  const [dashboard, setDashboard] = useState(null);
  const [clients, setClients]   = useState([]);
  const [projects, setProjects] = useState([]);
  const [quotes, setQuotes]     = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [modal, setModal]       = useState(null);
  const [form, setForm]         = useState({});
  const [editing, setEditing]   = useState(null);

  const today = new Date().toISOString().split('T')[0];

  const loadDashboard = async () => { const d = await get('/business/dashboard'); if (d) setDashboard(d); };
  const loadClients   = async () => { const d = await get('/business/clients');   if (d) setClients(d); };
  const loadProjects  = async () => { const d = await get('/business/projects');  if (d) setProjects(d); };
  const loadQuotes    = async () => { const d = await get('/business/quotes');    if (d) setQuotes(d); };
  const loadInvoices  = async () => { const d = await get('/business/invoices');  if (d) setInvoices(d); };
  const loadExpenses  = async () => { const d = await get('/business/expenses');  if (d) setExpenses(d); };

  useEffect(() => { loadDashboard(); loadClients(); loadProjects(); }, []);
  useEffect(() => {
    if (tab === 'Dashboard') loadDashboard();
    if (tab === 'Quotes')    loadQuotes();
    if (tab === 'Invoices')  loadInvoices();
    if (tab === 'Expenses')  loadExpenses();
  }, [tab]);

  const saveItem = async (kind) => {
    const endpoint = `/business/${kind}`;
    if (editing) {
      await patch(`${endpoint}/${editing.id}`, form);
    } else {
      if (kind === 'invoices' && !form.invoice_number) {
        const { suggested } = await get('/business/invoices/next-number');
        form.invoice_number = suggested;
      }
      if (kind === 'quotes' && !form.quote_number) {
        const { suggested } = await get('/business/quotes/next-number');
        form.quote_number = suggested;
      }
      await post(endpoint, form);
    }
    setModal(null); setForm({}); setEditing(null);
    if (kind === 'clients')  loadClients();
    if (kind === 'projects') loadProjects();
    if (kind === 'quotes')   loadQuotes();
    if (kind === 'invoices') loadInvoices();
    if (kind === 'expenses') loadExpenses();
    loadDashboard();
  };

  const deleteItem = async (kind, id) => {
    if (!confirm('Delete this item?')) return;
    await del(`/business/${kind}/${id}`);
    if (kind === 'clients')  loadClients();
    if (kind === 'projects') loadProjects();
    if (kind === 'quotes')   loadQuotes();
    if (kind === 'invoices') loadInvoices();
    if (kind === 'expenses') loadExpenses();
    loadDashboard();
  };

  const markInvoicePaid = async (id) => {
    await post(`/business/invoices/${id}/mark-paid`, { paid_date: today });
    loadInvoices(); loadDashboard();
  };

  const convertQuote = async (id) => {
    const days = prompt('Invoice due in how many days?', '30');
    if (days === null) return;
    try {
      const result = await post(`/business/quotes/${id}/convert-to-invoice`, { due_days: parseInt(days, 10) || 30 });
      alert(`Invoice ${result.invoice.invoice_number} created.`);
      loadQuotes(); loadInvoices(); loadDashboard();
    } catch (e) {
      alert('Could not convert: ' + e.message);
    }
  };

  const openEdit = (kind, item) => {
    setEditing({ kind, ...item });
    setForm({ ...item });
    setModal(kind);
  };

  return (
    <div className="page animate-fade">
      <div className="page-header">
        <div>
          <h1 className="page-title">Business</h1>
          <p className="page-subtitle">Clients · projects · quotes · invoices</p>
        </div>
        {tab === 'Clients'  && <button className="btn btn-primary" onClick={() => { setForm({ status: 'lead', colour: '#6366f1' }); setEditing(null); setModal('clients'); }}>+ Client</button>}
        {tab === 'Projects' && <button className="btn btn-primary" onClick={() => { setForm({ status: 'active', billing_type: 'fixed' }); setEditing(null); setModal('projects'); }}>+ Project</button>}
        {tab === 'Quotes'   && <button className="btn btn-primary" onClick={() => { setForm({ status: 'draft', issue_date: today, vat_amount: 0, valid_until: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0] }); setEditing(null); setModal('quotes'); }}>+ Quote</button>}
        {tab === 'Invoices' && <button className="btn btn-primary" onClick={() => { setForm({ status: 'draft', issue_date: today, vat_amount: 0 }); setEditing(null); setModal('invoices'); }}>+ Invoice</button>}
        {tab === 'Expenses' && <button className="btn btn-primary" onClick={() => { setForm({ date: today, claimable: true, vat_amount: 0 }); setEditing(null); setModal('expenses'); }}>+ Expense</button>}
      </div>

      <div className="finance-tabs">
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '7px 16px', borderRadius: 7, fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap',
            background: tab === t ? 'var(--bg-card)' : 'transparent',
            color: tab === t ? 'var(--text-primary)' : 'var(--text-muted)',
            border: tab === t ? '1px solid var(--border)' : '1px solid transparent',
          }}>{t}</button>
        ))}
      </div>

      {/* DASHBOARD */}
      {tab === 'Dashboard' && dashboard && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginBottom: 24 }}>
            <div className="card" style={{ borderLeft: '4px solid var(--amber)' }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Outstanding invoiced</div>
              <div style={{ fontSize: 26, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--amber)' }}>{fmt.currency(dashboard.outstanding_invoiced)}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{dashboard.overdue_invoices} overdue</div>
            </div>
            <div className="card" style={{ borderLeft: '4px solid var(--green)' }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' }}>MTD income</div>
              <div style={{ fontSize: 26, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--green)' }}>{fmt.currency(dashboard.mtd_income)}</div>
            </div>
            <div className="card" style={{ borderLeft: '4px solid var(--red)' }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' }}>MTD expenses</div>
              <div style={{ fontSize: 26, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--red)' }}>{fmt.currency(dashboard.mtd_expenses)}</div>
            </div>
            <div className="card" style={{ borderLeft: `4px solid ${dashboard.mtd_net >= 0 ? 'var(--green)' : 'var(--red)'}` }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' }}>MTD net</div>
              <div style={{ fontSize: 26, fontWeight: 700, fontFamily: 'var(--font-mono)', color: dashboard.mtd_net >= 0 ? 'var(--green)' : 'var(--red)' }}>{fmt.currency(dashboard.mtd_net)}</div>
            </div>
            <div className="card" style={{ borderLeft: '4px solid var(--accent)' }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Open quotes</div>
              <div style={{ fontSize: 26, fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{fmt.currency(dashboard.open_quotes_value)}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{dashboard.open_quotes_count} pending</div>
            </div>
            <div className="card">
              <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Active projects</div>
              <div style={{ fontSize: 26, fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{dashboard.active_projects}</div>
            </div>
            <div className="card">
              <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Pipeline</div>
              <div style={{ fontSize: 13, marginTop: 4 }}>
                {Object.entries(CLIENT_STATUS).map(([k, v]) => (
                  <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                    <span style={{ color: v.colour }}>{v.label}</span>
                    <span style={{ fontFamily: 'var(--font-mono)' }}>{dashboard.client_counts[k] || 0}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}

      {/* CLIENTS */}
      {tab === 'Clients' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
          {clients.map(c => {
            const status = CLIENT_STATUS[c.status] || CLIENT_STATUS.lead;
            return (
              <div key={c.id} className="card" style={{ borderLeft: `4px solid ${c.colour || status.colour}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{c.company || c.name}</div>
                    {c.company && c.name && c.name !== c.company && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{c.name}</div>}
                  </div>
                  <span className="badge" style={{ background: status.colour + '25', color: status.colour }}>{status.label}</span>
                </div>
                {c.email && <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{c.email}</div>}
                {c.phone && <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{c.phone}</div>}
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12, fontSize: 12 }}>
                  <span style={{ color: 'var(--text-muted)' }}>{c.project_count} project{c.project_count == 1 ? '' : 's'}</span>
                  {parseFloat(c.outstanding) > 0 && <span style={{ color: 'var(--amber)', fontFamily: 'var(--font-mono)' }}>{fmt.currency(c.outstanding)} outstanding</span>}
                </div>
                {c.hourly_rate && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>£{c.hourly_rate}/hr</div>}
                <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => openEdit('clients', c)}>Edit</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => deleteItem('clients', c.id)}>Delete</button>
                </div>
              </div>
            );
          })}
          {clients.length === 0 && <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>No clients yet. Add your first lead.</div>}
        </div>
      )}

      {/* PROJECTS */}
      {tab === 'Projects' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {projects.map(p => {
            const status = PROJECT_STATUS[p.status] || PROJECT_STATUS.active;
            return (
              <div key={p.id} className="card" style={{ borderLeft: `4px solid ${status.colour}`, padding: '14px 18px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{p.name}</div>
                    {p.client_name && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{p.client_name}</div>}
                  </div>
                  <span className="badge" style={{ background: status.colour + '25', color: status.colour }}>{status.label}</span>
                </div>
                {p.description && <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8 }}>{p.description}</div>}
                <div style={{ display: 'flex', gap: 16, fontSize: 12, flexWrap: 'wrap' }}>
                  <span><span style={{ color: 'var(--text-muted)' }}>Billing:</span> <span style={{ textTransform: 'capitalize' }}>{p.billing_type}</span></span>
                  {p.value && <span><span style={{ color: 'var(--text-muted)' }}>Value:</span> <span style={{ fontFamily: 'var(--font-mono)' }}>{fmt.currency(p.value)}</span></span>}
                  {parseFloat(p.invoiced_paid) > 0 && <span style={{ color: 'var(--green)' }}>Paid: {fmt.currency(p.invoiced_paid)}</span>}
                  {p.start_date && <span><span style={{ color: 'var(--text-muted)' }}>Start:</span> {fmt.dateShort(p.start_date)}</span>}
                </div>
                <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => openEdit('projects', p)}>Edit</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => deleteItem('projects', p.id)}>Delete</button>
                </div>
              </div>
            );
          })}
          {projects.length === 0 && <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>No projects yet</div>}
        </div>
      )}

      {/* QUOTES */}
      {tab === 'Quotes' && (
        <div className="card" style={{ padding: 0 }}>
          <table>
            <thead><tr><th>Number</th><th>Date</th><th>Client</th><th>Project</th><th>Amount</th><th>Valid Until</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {quotes.map(q => {
                const status = QUOTE_STATUS[q.status] || QUOTE_STATUS.draft;
                const total  = parseFloat(q.amount) + parseFloat(q.vat_amount || 0);
                const canConvert = (q.status === 'sent' || q.status === 'accepted' || q.status === 'draft') && !q.converted_to_invoice_id;
                return (
                  <tr key={q.id}>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{q.quote_number}</td>
                    <td style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{fmt.dateShort(q.issue_date)}</td>
                    <td style={{ fontSize: 12 }}>{q.client_name || '—'}</td>
                    <td style={{ fontSize: 12 }} className="hide-mobile">{q.project_name || '—'}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600 }}>{fmt.currency(total)}</td>
                    <td style={{ fontSize: 12, color: q.status === 'expired' ? 'var(--red)' : 'var(--text-muted)' }}>{q.valid_until ? fmt.dateShort(q.valid_until) : '—'}</td>
                    <td>
                      <span className="badge" style={{ background: status.colour + '25', color: status.colour }}>{status.label}</span>
                      {q.converted_to_invoice_id && <span style={{ fontSize: 10, color: 'var(--text-muted)', display: 'block', marginTop: 2 }}>↪ invoiced</span>}
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {canConvert && <button className="btn btn-ghost btn-sm" style={{ marginRight: 4 }} onClick={() => convertQuote(q.id)}>→ Invoice</button>}
                      <button className="btn-icon btn-sm" onClick={() => openEdit('quotes', q)}>✎</button>
                      <button className="btn-icon btn-sm" onClick={() => deleteItem('quotes', q.id)}>×</button>
                    </td>
                  </tr>
                );
              })}
              {quotes.length === 0 && <tr><td colSpan="8" style={{ textAlign: 'center', padding: 30, color: 'var(--text-muted)' }}>No quotes yet</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {/* INVOICES */}
      {tab === 'Invoices' && (
        <div className="card" style={{ padding: 0 }}>
          <table>
            <thead><tr><th>Number</th><th>Date</th><th>Client</th><th>Project</th><th>Amount</th><th>Due</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {invoices.map(i => {
                const status = INVOICE_STATUS[i.status] || INVOICE_STATUS.draft;
                const total  = parseFloat(i.amount) + parseFloat(i.vat_amount || 0);
                return (
                  <tr key={i.id}>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{i.invoice_number}</td>
                    <td style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{fmt.dateShort(i.issue_date)}</td>
                    <td style={{ fontSize: 12 }}>{i.client_name || '—'}</td>
                    <td style={{ fontSize: 12 }} className="hide-mobile">{i.project_name || '—'}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600 }}>{fmt.currency(total)}</td>
                    <td style={{ fontSize: 12, color: i.status === 'overdue' ? 'var(--red)' : 'var(--text-muted)' }}>{i.due_date ? fmt.dateShort(i.due_date) : '—'}</td>
                    <td><span className="badge" style={{ background: status.colour + '25', color: status.colour }}>{status.label}</span></td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {i.status !== 'paid' && i.status !== 'cancelled' && <button className="btn btn-ghost btn-sm" style={{ marginRight: 4 }} onClick={() => markInvoicePaid(i.id)}>Mark paid</button>}
                      <button className="btn-icon btn-sm" onClick={() => openEdit('invoices', i)}>✎</button>
                      <button className="btn-icon btn-sm" onClick={() => deleteItem('invoices', i.id)}>×</button>
                    </td>
                  </tr>
                );
              })}
              {invoices.length === 0 && <tr><td colSpan="8" style={{ textAlign: 'center', padding: 30, color: 'var(--text-muted)' }}>No invoices yet</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {/* EXPENSES */}
      {tab === 'Expenses' && (
        <div className="card" style={{ padding: 0 }}>
          <table>
            <thead><tr><th>Date</th><th>Description</th><th>Category</th><th>Client</th><th>Amount</th><th>VAT</th><th>Claim</th><th></th></tr></thead>
            <tbody>
              {expenses.map(e => (
                <tr key={e.id}>
                  <td style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{fmt.dateShort(e.date)}</td>
                  <td style={{ fontSize: 13 }}>{e.description}</td>
                  <td style={{ fontSize: 12 }}><span className="badge" style={{ background: 'var(--bg-tertiary)' }}>{e.category || 'Other'}</span></td>
                  <td style={{ fontSize: 12 }} className="hide-mobile">{e.client_name || '—'}</td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}>{fmt.currency(e.amount)}</td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)' }} className="hide-mobile">{e.vat_amount > 0 ? fmt.currency(e.vat_amount) : '—'}</td>
                  <td>{e.claimable ? '✓' : '—'}</td>
                  <td><button className="btn-icon btn-sm" onClick={() => deleteItem('expenses', e.id)}>×</button></td>
                </tr>
              ))}
              {expenses.length === 0 && <tr><td colSpan="8" style={{ textAlign: 'center', padding: 30, color: 'var(--text-muted)' }}>No expenses logged</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {/* CLIENT MODAL */}
      {modal === 'clients' && (
        <div className="modal-overlay" onClick={() => { setModal(null); setEditing(null); }}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">{editing ? 'Edit client' : 'New client'}</div>
            <div className="form-row">
              <div className="form-group"><label className="form-label">Name *</label><input value={form.name || ''} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
              <div className="form-group"><label className="form-label">Company</label><input value={form.company || ''} onChange={e => setForm({ ...form, company: e.target.value })} /></div>
            </div>
            <div className="form-row">
              <div className="form-group"><label className="form-label">Email</label><input type="email" value={form.email || ''} onChange={e => setForm({ ...form, email: e.target.value })} /></div>
              <div className="form-group"><label className="form-label">Phone</label><input value={form.phone || ''} onChange={e => setForm({ ...form, phone: e.target.value })} /></div>
            </div>
            <div className="form-row">
              <div className="form-group"><label className="form-label">Status</label>
                <select value={form.status || 'lead'} onChange={e => setForm({ ...form, status: e.target.value })}>
                  {Object.entries(CLIENT_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select></div>
              <div className="form-group"><label className="form-label">Hourly rate (£)</label><input type="number" step="0.01" value={form.hourly_rate || ''} onChange={e => setForm({ ...form, hourly_rate: e.target.value })} /></div>
            </div>
            <div className="form-group"><label className="form-label">Website</label><input value={form.website || ''} onChange={e => setForm({ ...form, website: e.target.value })} /></div>
            <div className="form-group"><label className="form-label">Address</label><textarea rows={2} value={form.address || ''} onChange={e => setForm({ ...form, address: e.target.value })} /></div>
            <div className="form-group"><label className="form-label">Notes</label><textarea rows={2} value={form.notes || ''} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => { setModal(null); setEditing(null); }}>Cancel</button>
              <button className="btn btn-primary" onClick={() => saveItem('clients')}>{editing ? 'Save' : 'Add'}</button>
            </div>
          </div>
        </div>
      )}

      {/* PROJECT MODAL */}
      {modal === 'projects' && (
        <div className="modal-overlay" onClick={() => { setModal(null); setEditing(null); }}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">{editing ? 'Edit project' : 'New project'}</div>
            <div className="form-group"><label className="form-label">Name *</label><input value={form.name || ''} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
            <div className="form-row">
              <div className="form-group"><label className="form-label">Client</label>
                <select value={form.client_id || ''} onChange={e => setForm({ ...form, client_id: e.target.value || null })}>
                  <option value="">— None —</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.company || c.name}</option>)}
                </select></div>
              <div className="form-group"><label className="form-label">Status</label>
                <select value={form.status || 'active'} onChange={e => setForm({ ...form, status: e.target.value })}>
                  {Object.entries(PROJECT_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select></div>
            </div>
            <div className="form-row">
              <div className="form-group"><label className="form-label">Billing type</label>
                <select value={form.billing_type || 'fixed'} onChange={e => setForm({ ...form, billing_type: e.target.value })}>
                  <option value="fixed">Fixed price</option><option value="hourly">Hourly</option><option value="retainer">Retainer</option>
                </select></div>
              <div className="form-group"><label className="form-label">Value (£)</label><input type="number" step="0.01" value={form.value || ''} onChange={e => setForm({ ...form, value: e.target.value })} /></div>
            </div>
            <div className="form-row">
              <div className="form-group"><label className="form-label">Start date</label><input type="date" value={form.start_date || ''} onChange={e => setForm({ ...form, start_date: e.target.value })} /></div>
              <div className="form-group"><label className="form-label">End date</label><input type="date" value={form.end_date || ''} onChange={e => setForm({ ...form, end_date: e.target.value })} /></div>
            </div>
            <div className="form-group"><label className="form-label">Description</label><textarea rows={3} value={form.description || ''} onChange={e => setForm({ ...form, description: e.target.value })} /></div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => { setModal(null); setEditing(null); }}>Cancel</button>
              <button className="btn btn-primary" onClick={() => saveItem('projects')}>{editing ? 'Save' : 'Add'}</button>
            </div>
          </div>
        </div>
      )}

      {/* QUOTE MODAL */}
      {modal === 'quotes' && (
        <div className="modal-overlay" onClick={() => { setModal(null); setEditing(null); }}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">{editing ? 'Edit quote' : 'New quote'}</div>
            <div className="form-row">
              <div className="form-group"><label className="form-label">Quote number</label><input placeholder="Leave blank for auto" value={form.quote_number || ''} onChange={e => setForm({ ...form, quote_number: e.target.value })} /></div>
              <div className="form-group"><label className="form-label">Status</label>
                <select value={form.status || 'draft'} onChange={e => setForm({ ...form, status: e.target.value })}>
                  {Object.entries(QUOTE_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select></div>
            </div>
            <div className="form-row">
              <div className="form-group"><label className="form-label">Client</label>
                <select value={form.client_id || ''} onChange={e => setForm({ ...form, client_id: e.target.value || null })}>
                  <option value="">— None —</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.company || c.name}</option>)}
                </select></div>
              <div className="form-group"><label className="form-label">Project</label>
                <select value={form.project_id || ''} onChange={e => setForm({ ...form, project_id: e.target.value || null })}>
                  <option value="">— None —</option>
                  {projects.filter(p => !form.client_id || p.client_id === form.client_id).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select></div>
            </div>
            <div className="form-row">
              <div className="form-group"><label className="form-label">Issue date</label><input type="date" value={form.issue_date || today} onChange={e => setForm({ ...form, issue_date: e.target.value })} /></div>
              <div className="form-group"><label className="form-label">Valid until</label><input type="date" value={form.valid_until || ''} onChange={e => setForm({ ...form, valid_until: e.target.value })} /></div>
            </div>
            <div className="form-row">
              <div className="form-group"><label className="form-label">Amount net (£) *</label><input type="number" step="0.01" value={form.amount || ''} onChange={e => setForm({ ...form, amount: e.target.value })} /></div>
              <div className="form-group"><label className="form-label">VAT (£)</label><input type="number" step="0.01" value={form.vat_amount || 0} onChange={e => setForm({ ...form, vat_amount: e.target.value })} /></div>
            </div>
            <div className="form-group"><label className="form-label">Notes</label><textarea rows={2} value={form.notes || ''} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => { setModal(null); setEditing(null); }}>Cancel</button>
              <button className="btn btn-primary" onClick={() => saveItem('quotes')}>{editing ? 'Save' : 'Create'}</button>
            </div>
          </div>
        </div>
      )}

      {/* INVOICE MODAL */}
      {modal === 'invoices' && (
        <div className="modal-overlay" onClick={() => { setModal(null); setEditing(null); }}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">{editing ? 'Edit invoice' : 'New invoice'}</div>
            <div className="form-row">
              <div className="form-group"><label className="form-label">Invoice number</label><input placeholder="Leave blank for auto" value={form.invoice_number || ''} onChange={e => setForm({ ...form, invoice_number: e.target.value })} /></div>
              <div className="form-group"><label className="form-label">Status</label>
                <select value={form.status || 'draft'} onChange={e => setForm({ ...form, status: e.target.value })}>
                  {Object.entries(INVOICE_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select></div>
            </div>
            <div className="form-row">
              <div className="form-group"><label className="form-label">Client</label>
                <select value={form.client_id || ''} onChange={e => setForm({ ...form, client_id: e.target.value || null })}>
                  <option value="">— None —</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.company || c.name}</option>)}
                </select></div>
              <div className="form-group"><label className="form-label">Project</label>
                <select value={form.project_id || ''} onChange={e => setForm({ ...form, project_id: e.target.value || null })}>
                  <option value="">— None —</option>
                  {projects.filter(p => !form.client_id || p.client_id === form.client_id).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select></div>
            </div>
            <div className="form-row">
              <div className="form-group"><label className="form-label">Issue date</label><input type="date" value={form.issue_date || today} onChange={e => setForm({ ...form, issue_date: e.target.value })} /></div>
              <div className="form-group"><label className="form-label">Due date</label><input type="date" value={form.due_date || ''} onChange={e => setForm({ ...form, due_date: e.target.value })} /></div>
            </div>
            <div className="form-row">
              <div className="form-group"><label className="form-label">Amount net (£) *</label><input type="number" step="0.01" value={form.amount || ''} onChange={e => setForm({ ...form, amount: e.target.value })} /></div>
              <div className="form-group"><label className="form-label">VAT (£)</label><input type="number" step="0.01" value={form.vat_amount || 0} onChange={e => setForm({ ...form, vat_amount: e.target.value })} /></div>
            </div>
            <div className="form-group"><label className="form-label">Notes</label><textarea rows={2} value={form.notes || ''} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => { setModal(null); setEditing(null); }}>Cancel</button>
              <button className="btn btn-primary" onClick={() => saveItem('invoices')}>{editing ? 'Save' : 'Create'}</button>
            </div>
          </div>
        </div>
      )}

      {/* EXPENSE MODAL */}
      {modal === 'expenses' && (
        <div className="modal-overlay" onClick={() => { setModal(null); setEditing(null); }}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">{editing ? 'Edit expense' : 'New expense'}</div>
            <div className="form-row">
              <div className="form-group"><label className="form-label">Date</label><input type="date" value={form.date || today} onChange={e => setForm({ ...form, date: e.target.value })} /></div>
              <div className="form-group"><label className="form-label">Category</label>
                <select value={form.category || ''} onChange={e => setForm({ ...form, category: e.target.value })}>
                  <option value="">Select...</option>
                  {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select></div>
            </div>
            <div className="form-group"><label className="form-label">Description *</label><input value={form.description || ''} onChange={e => setForm({ ...form, description: e.target.value })} /></div>
            <div className="form-row">
              <div className="form-group"><label className="form-label">Amount (£) *</label><input type="number" step="0.01" value={form.amount || ''} onChange={e => setForm({ ...form, amount: e.target.value })} /></div>
              <div className="form-group"><label className="form-label">VAT (£)</label><input type="number" step="0.01" value={form.vat_amount || 0} onChange={e => setForm({ ...form, vat_amount: e.target.value })} /></div>
            </div>
            <div className="form-row">
              <div className="form-group"><label className="form-label">Client (optional)</label>
                <select value={form.client_id || ''} onChange={e => setForm({ ...form, client_id: e.target.value || null })}>
                  <option value="">— None —</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.company || c.name}</option>)}
                </select></div>
              <div className="form-group"><label className="form-label">Project (optional)</label>
                <select value={form.project_id || ''} onChange={e => setForm({ ...form, project_id: e.target.value || null })}>
                  <option value="">— None —</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select></div>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, fontSize: 13, cursor: 'pointer' }}>
              <input type="checkbox" checked={form.claimable !== false} onChange={e => setForm({ ...form, claimable: e.target.checked })} style={{ width: 'auto' }} />
              Tax-claimable
            </label>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => { setModal(null); setEditing(null); }}>Cancel</button>
              <button className="btn btn-primary" onClick={() => saveItem('expenses')}>{editing ? 'Save' : 'Add'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
