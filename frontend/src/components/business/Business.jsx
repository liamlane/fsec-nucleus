import { useState, useEffect, useMemo } from 'react';
import { get, post, patch, del, fmt } from '../../utils/api.js';

const TABS = ['Dashboard', 'Clients', 'Projects', 'Quotes', 'Invoices', 'Expenses', 'Profile'];

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

const EXPENSE_CATEGORIES = ['Travel','Software','Equipment','Professional fees','Marketing','Utilities','Office','Subsistence','Other'];

const INTERACTION_TYPES = {
  call:    { label: 'Call',    icon: '📞' },
  email:   { label: 'Email',   icon: '✉️' },
  meeting: { label: 'Meeting', icon: '🤝' },
  message: { label: 'Message', icon: '💬' },
  note:    { label: 'Note',    icon: '📝' },
  other:   { label: 'Other',   icon: '◇' },
};

// Authorisation token for inline PDF fetches (since iframe/window.open can't send headers)
const apiBase   = '/api';
const getToken  = () => localStorage.getItem('nucleus_token') || '';

export default function Business() {
  const [tab, setTab]               = useState('Dashboard');
  const [dashboard, setDashboard]   = useState(null);
  const [clients, setClients]       = useState([]);
  const [clientTypeFilter, setClientTypeFilter] = useState('');
  const [projects, setProjects]     = useState([]);
  const [quotes, setQuotes]         = useState([]);
  const [invoices, setInvoices]     = useState([]);
  const [expenses, setExpenses]     = useState([]);
  const [profile, setProfile]       = useState(null);
  const [modal, setModal]           = useState(null);
  const [form, setForm]             = useState({});
  const [editing, setEditing]       = useState(null);
  // Interactions panel state
  const [interactionsClient, setInteractionsClient] = useState(null);
  const [interactions, setInteractions]             = useState([]);
  // Email send modal state
  const [sendModal, setSendModal] = useState(null);   // { kind:'invoice'|'quote'|'reminder', doc, to, subject, body, level }
  const [sending,   setSending]   = useState(false);
  const [sendError, setSendError] = useState(null);
  // SMTP + templates + log state (rendered under Profile tab)
  const [smtp, setSmtp]                 = useState(null);
  const [smtpDirty, setSmtpDirty]       = useState(false);
  const [smtpTestStatus, setSmtpTestStatus] = useState(null);
  const [templates, setTemplates]       = useState({});
  const [templatesDirty, setTemplatesDirty] = useState(false);
  const [emailLog, setEmailLog]         = useState([]);

  const today = new Date().toISOString().split('T')[0];

  const loadDashboard = async () => { const d = await get('/business/dashboard'); if (d) setDashboard(d); };
  const loadClients   = async () => {
    const url = clientTypeFilter ? `/business/clients?client_type=${clientTypeFilter}` : '/business/clients';
    const d = await get(url); if (d) setClients(d);
  };
  const loadProjects  = async () => { const d = await get('/business/projects'); if (d) setProjects(d); };
  const loadQuotes    = async () => { const d = await get('/business/quotes');   if (d) setQuotes(d); };
  const loadInvoices  = async () => { const d = await get('/business/invoices'); if (d) setInvoices(d); };
  const loadExpenses  = async () => { const d = await get('/business/expenses'); if (d) setExpenses(d); };
  const loadProfile   = async () => { const d = await get('/business/profile');  if (d) setProfile(d); };
  const loadSmtp      = async () => { const d = await get('/business/profile/smtp'); if (d) setSmtp(d); setSmtpDirty(false); };
  const loadTemplates = async () => { const d = await get('/business/profile/email-templates'); if (d) setTemplates(d); setTemplatesDirty(false); };
  const loadEmailLog  = async () => { const d = await get('/business/email-log?limit=50'); if (d) setEmailLog(d); };

  useEffect(() => { loadDashboard(); loadClients(); loadProjects(); }, []);
  useEffect(() => { loadClients(); }, [clientTypeFilter]);
  useEffect(() => {
    if (tab === 'Dashboard') loadDashboard();
    if (tab === 'Quotes')    loadQuotes();
    if (tab === 'Invoices')  loadInvoices();
    if (tab === 'Expenses')  loadExpenses();
    if (tab === 'Profile')   { loadProfile(); loadSmtp(); loadTemplates(); loadEmailLog(); }
  }, [tab]);

  // ── Line item helpers ──────────────────────────────────────────────────
  const addLineItem = () => {
    const items = [...(form.line_items || []), { description: '', quantity: 1, rate: 0, amount: 0 }];
    setForm({ ...form, line_items: items });
  };
  const updateLineItem = (idx, field, value) => {
    const items = [...(form.line_items || [])];
    items[idx] = { ...items[idx], [field]: value };
    if (field === 'quantity' || field === 'rate') {
      const q = parseFloat(items[idx].quantity || 0);
      const r = parseFloat(items[idx].rate || 0);
      items[idx].amount = (q * r).toFixed(2);
    }
    const subtotal = items.reduce((s, li) => s + parseFloat(li.amount || 0), 0);
    setForm({ ...form, line_items: items, amount: subtotal.toFixed(2) });
  };
  const removeLineItem = (idx) => {
    const items = form.line_items.filter((_, i) => i !== idx);
    const subtotal = items.reduce((s, li) => s + parseFloat(li.amount || 0), 0);
    setForm({ ...form, line_items: items, amount: subtotal.toFixed(2) });
  };
  const applyVAT = (rate = 0.20) => {
    const amt = parseFloat(form.amount || 0);
    setForm({ ...form, vat_amount: (amt * rate).toFixed(2) });
  };

  // ── Save / delete handlers ─────────────────────────────────────────────
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
    setForm({ ...item, line_items: item.line_items || [] });
    setModal(kind);
  };

  // PDF download — auth header required, so we fetch the blob ourselves
  const openPDF = async (kind, id, number) => {
    try {
      const resp = await fetch(`${apiBase}/business/${kind}/${id}/pdf`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!resp.ok) throw new Error('Could not generate PDF');
      const blob = await resp.blob();
      const url  = URL.createObjectURL(blob);
      window.open(url, '_blank');
      // Revoke after a delay so the new tab has time to grab it
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (e) {
      alert('PDF generation failed: ' + e.message);
    }
  };

  // ── Email send modal ───────────────────────────────────────────────────
  //
  // Server-side templates contain {placeholders}. For a snappy modal we
  // do a simple client-side fill so the user sees a preview they can
  // edit before sending. Backend re-fills authoritatively (so if you
  // edit the body, your edit wins; if you leave it as-is, backend
  // re-renders fresh values).

  const clientFor = (doc) => clients.find(c => c.id === doc.client_id);

  const daysOverdue = (dueDate) => {
    if (!dueDate) return 0;
    const ms = Date.now() - new Date(dueDate).getTime();
    return Math.max(0, Math.floor(ms / (24 * 60 * 60 * 1000)));
  };

  const fillTemplate = (str, vars) => {
    if (!str) return '';
    return str.replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? String(vars[k]) : m));
  };

  const openSendModal = async (kind, doc) => {
    // Load latest templates and SMTP status if we don't have them
    if (!Object.keys(templates).length) await loadTemplates();
    if (!smtp) await loadSmtp();

    const client = clientFor(doc);
    const days   = daysOverdue(doc.due_date);

    // Pick template
    let level = 1;
    let templateKey = 'invoice_send';
    if (kind === 'quote')    templateKey = 'quote_send';
    if (kind === 'reminder') {
      if (days >= 30)      { level = 3; templateKey = 'reminder_3'; }
      else if (days >= 14) { level = 2; templateKey = 'reminder_2'; }
      else                 { level = 1; templateKey = 'reminder_1'; }
    }

    // Fresh in-memory templates (in case the user hasn't saved DB updates)
    const tpl = templates[templateKey] || { subject: '', body: '' };
    const total = parseFloat(doc.amount || 0) + parseFloat(doc.vat_amount || 0);
    const vars = {
      client_name:    client?.contact_name || client?.name || client?.company || 'there',
      from_name:      profile?.name || 'Fast Lane Technology',
      amount:         fmt.currency(total),
      invoice_number: doc.invoice_number,
      quote_number:   doc.quote_number,
      due_date:       doc.due_date    ? fmt.date(doc.due_date)    : '',
      valid_until:    doc.valid_until ? fmt.date(doc.valid_until) : '',
      days_overdue:   days,
    };

    setSendModal({
      kind,
      doc,
      level,
      to:      client?.email || '',
      subject: fillTemplate(tpl.subject, vars),
      body:    fillTemplate(tpl.body,    vars),
    });
    setSendError(null);
  };

  const performSend = async () => {
    if (!sendModal) return;
    if (!sendModal.to) { setSendError('Recipient email required'); return; }
    setSending(true);
    setSendError(null);
    try {
      const { kind, doc, level } = sendModal;
      const payload = { to: sendModal.to, subject: sendModal.subject, body: sendModal.body };
      let url;
      if (kind === 'invoice')      url = `/business/invoices/${doc.id}/send`;
      else if (kind === 'quote')   url = `/business/quotes/${doc.id}/send`;
      else if (kind === 'reminder'){ url = `/business/invoices/${doc.id}/send-reminder`; payload.level = level; }
      const r = await post(url, payload);
      setSendModal(null);
      // Refresh the affected list so status/reminder badges update
      if (kind === 'quote')  loadQuotes();
      else                   loadInvoices();
      loadEmailLog();
      alert(`Sent to ${r.to || sendModal.to}.`);
    } catch (e) {
      setSendError(e.message || 'Send failed');
    } finally {
      setSending(false);
    }
  };

  // ── SMTP & templates handlers ─────────────────────────────────────────
  const updateSmtpField = (k, v) => { setSmtp(s => ({ ...s, [k]: v })); setSmtpDirty(true); };
  const saveSmtp = async () => {
    const payload = { ...smtp };
    delete payload.has_password;
    // If the user didn't type a new password, don't send 'pass' at all
    // (the backend keeps the existing one when 'pass' is undefined/empty).
    if (payload.pass === '' || payload.pass === undefined) delete payload.pass;
    const r = await patch('/business/profile/smtp', payload);
    if (r) { setSmtp(r); setSmtpDirty(false); }
  };
  const testSmtp = async () => {
    const to = window.prompt('Send test email to:', profile?.email || '');
    if (!to) return;
    setSmtpTestStatus({ kind: 'pending', message: 'Sending...' });
    try {
      const r = await post('/business/profile/smtp-test', { to });
      setSmtpTestStatus({ kind: 'ok', message: r.message || `Test sent to ${to}` });
    } catch (e) {
      setSmtpTestStatus({ kind: 'err', message: e.message || 'Send failed' });
    }
    loadEmailLog();
  };

  const updateTemplate = (key, field, val) => {
    setTemplates(t => ({ ...t, [key]: { ...(t[key] || {}), [field]: val } }));
    setTemplatesDirty(true);
  };
  const saveTemplates = async () => {
    const r = await patch('/business/profile/email-templates', templates);
    if (r) { setTemplates(r); setTemplatesDirty(false); }
  };

  const openInteractions = async (client) => {
    setInteractionsClient(client);
    const data = await get(`/business/clients/${client.id}/interactions`);
    if (data) setInteractions(data);
    setModal('interactions');
  };

  const addInteraction = async () => {
    await post(`/business/clients/${interactionsClient.id}/interactions`, form);
    setForm({});
    const data = await get(`/business/clients/${interactionsClient.id}/interactions`);
    if (data) setInteractions(data);
    loadClients(); // refresh last_interaction
  };

  const deleteInteraction = async (id) => {
    if (!confirm('Delete this interaction?')) return;
    await del(`/business/interactions/${id}`);
    const data = await get(`/business/clients/${interactionsClient.id}/interactions`);
    if (data) setInteractions(data);
    loadClients();
  };

  // ── Profile handlers ───────────────────────────────────────────────────
  const updateProfileField = (field, value) => {
    setProfile({ ...profile, [field]: value });
  };
  const saveProfile = async () => {
    await patch('/business/profile', profile);
    alert('Business profile saved. PDFs will use these details going forward.');
  };

  // ── Computed totals for modals ─────────────────────────────────────────
  const modalTotal = useMemo(() => {
    return parseFloat(form.amount || 0) + parseFloat(form.vat_amount || 0);
  }, [form.amount, form.vat_amount]);

  return (
    <div className="page animate-fade">
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <img src="/logo.png" alt="FLT" style={{ width: 38, height: 38, borderRadius: 6, border: '1px solid var(--border)' }} />
          <div>
            <h1 className="page-title">Business</h1>
            <p className="page-subtitle">{profile?.name || 'Fast Lane Technology'}</p>
          </div>
        </div>
        {tab === 'Clients'  && <button className="btn btn-primary" onClick={() => { setForm({ status: 'lead', client_type: 'commercial', colour: '#6366f1' }); setEditing(null); setModal('clients'); }}>+ Client</button>}
        {tab === 'Projects' && <button className="btn btn-primary" onClick={() => { setForm({ status: 'active', billing_type: 'fixed' }); setEditing(null); setModal('projects'); }}>+ Project</button>}
        {tab === 'Quotes'   && <button className="btn btn-primary" onClick={() => { setForm({ status: 'draft', issue_date: today, vat_amount: 0, valid_until: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0], line_items: [] }); setEditing(null); setModal('quotes'); }}>+ Quote</button>}
        {tab === 'Invoices' && <button className="btn btn-primary" onClick={() => { setForm({ status: 'draft', issue_date: today, vat_amount: 0, line_items: [] }); setEditing(null); setModal('invoices'); }}>+ Invoice</button>}
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
            <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Client mix</div>
            <div style={{ fontSize: 13, marginTop: 4 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                <span>Commercial</span>
                <span style={{ fontFamily: 'var(--font-mono)' }}>{dashboard.type_counts?.commercial || 0}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                <span>Residential</span>
                <span style={{ fontFamily: 'var(--font-mono)' }}>{dashboard.type_counts?.residential || 0}</span>
              </div>
            </div>
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
      )}

      {/* CLIENTS */}
      {tab === 'Clients' && (
        <>
          <div style={{ display: 'flex', gap: 4, marginBottom: 16, background: 'var(--bg-secondary)', borderRadius: 10, padding: 4, width: 'fit-content' }}>
            {[{v:'',l:'All'},{v:'commercial',l:'Commercial'},{v:'residential',l:'Residential'}].map(o => (
              <button key={o.v || 'all'} onClick={() => setClientTypeFilter(o.v)} style={{
                padding: '5px 14px', borderRadius: 7, fontSize: 12,
                background: clientTypeFilter === o.v ? 'var(--bg-card)' : 'transparent',
                color: clientTypeFilter === o.v ? 'var(--text-primary)' : 'var(--text-muted)',
                border: 'none', cursor: 'pointer',
              }}>{o.l}</button>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))', gap: 16 }}>
            {clients.map(c => {
              const status = CLIENT_STATUS[c.status] || CLIENT_STATUS.lead;
              const daysSince = c.last_interaction
                ? Math.floor((Date.now() - new Date(c.last_interaction)) / 86400000)
                : null;
              return (
                <div key={c.id} className="card" style={{ borderLeft: `4px solid ${c.colour || status.colour}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <div>
                      <div style={{ fontWeight: 600 }}>{c.company || c.name}</div>
                      {c.company && c.name && c.name !== c.company && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{c.name}</div>}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
                      <span className="badge" style={{ background: status.colour + '25', color: status.colour }}>{status.label}</span>
                      <span className="badge" style={{ background: 'var(--bg-tertiary)', color: 'var(--text-muted)', fontSize: 9, textTransform: 'capitalize' }}>{c.client_type || 'commercial'}</span>
                    </div>
                  </div>
                  {c.email && <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{c.email}</div>}
                  {c.phone && <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{c.phone}</div>}
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12, fontSize: 12 }}>
                    <span style={{ color: 'var(--text-muted)' }}>{c.project_count} project{c.project_count == 1 ? '' : 's'}</span>
                    {parseFloat(c.outstanding) > 0 && <span style={{ color: 'var(--amber)', fontFamily: 'var(--font-mono)' }}>{fmt.currency(c.outstanding)} owed</span>}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
                    {daysSince != null
                      ? `Last contact: ${daysSince === 0 ? 'today' : `${daysSince}d ago`} · ${c.interaction_count} logged`
                      : `No contact logged${c.interaction_count > 0 ? ` (${c.interaction_count} entries)` : ''}`}
                  </div>
                  {c.hourly_rate && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>£{c.hourly_rate}/hr</div>}
                  <div style={{ display: 'flex', gap: 6, marginTop: 12, flexWrap: 'wrap' }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => openInteractions(c)}>💬 Interactions</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => openEdit('clients', c)}>Edit</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => deleteItem('clients', c.id)}>Delete</button>
                  </div>
                </div>
              );
            })}
            {clients.length === 0 && <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>No clients{clientTypeFilter ? ` of type "${clientTypeFilter}"` : ''} yet.</div>}
          </div>
        </>
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
                      <button className="btn-icon btn-sm" title="View PDF" onClick={() => openPDF('quotes', q.id, q.quote_number)}>📄</button>
                      <button className="btn-icon btn-sm" title="Send by email" onClick={() => openSendModal('quote', q)}>📧</button>
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
                      <button className="btn-icon btn-sm" title="View PDF" onClick={() => openPDF('invoices', i.id, i.invoice_number)}>📄</button>
                      <button className="btn-icon btn-sm" title="Send by email" onClick={() => openSendModal('invoice', i)}>📧</button>
                      {i.status === 'overdue' && <button className="btn-icon btn-sm" title="Send payment reminder" onClick={() => openSendModal('reminder', i)}>⏰</button>}
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

      {/* PROFILE */}
      {tab === 'Profile' && profile && (
        <div style={{ maxWidth: 720 }}>
          <div className="card" style={{ marginBottom: 16, padding: 16, background: 'rgba(124,106,255,0.08)', border: '1px solid rgba(124,106,255,0.25)' }}>
            <div style={{ fontSize: 13 }}>
              These details are used to populate your invoice and quote PDFs. Make sure your bank details and VAT number are correct before sending anything to a client.
            </div>
          </div>

          <h3 style={{ fontSize: 13, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '20px 0 10px' }}>Company</h3>
          <div className="card">
            <div className="form-row">
              <div className="form-group"><label className="form-label">Company name</label>
                <input value={profile.name || ''} onChange={e => updateProfileField('name', e.target.value)} /></div>
              <div className="form-group"><label className="form-label">Tagline (shows in PDF header)</label>
                <input value={profile.tagline || ''} onChange={e => updateProfileField('tagline', e.target.value)} placeholder="e.g. Network & infrastructure consultancy" /></div>
            </div>
            <div className="form-row">
              <div className="form-group"><label className="form-label">Email</label>
                <input type="email" value={profile.email || ''} onChange={e => updateProfileField('email', e.target.value)} /></div>
              <div className="form-group"><label className="form-label">Phone</label>
                <input value={profile.phone || ''} onChange={e => updateProfileField('phone', e.target.value)} /></div>
            </div>
            <div className="form-group"><label className="form-label">Website</label>
              <input value={profile.website || ''} onChange={e => updateProfileField('website', e.target.value)} /></div>
            <div className="form-group"><label className="form-label">Address</label>
              <textarea rows={3} value={profile.address || ''} onChange={e => updateProfileField('address', e.target.value)} placeholder="Line 1&#10;Line 2&#10;City, Postcode" /></div>
            <div className="form-row">
              <div className="form-group"><label className="form-label">VAT number</label>
                <input value={profile.vat_number || ''} onChange={e => updateProfileField('vat_number', e.target.value)} placeholder="GB123456789" /></div>
              <div className="form-group"><label className="form-label">Company number</label>
                <input value={profile.company_number || ''} onChange={e => updateProfileField('company_number', e.target.value)} /></div>
            </div>
          </div>

          <h3 style={{ fontSize: 13, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '20px 0 10px' }}>Bank details</h3>
          <div className="card">
            <div className="form-row">
              <div className="form-group"><label className="form-label">Bank name</label>
                <input value={profile.bank_name || ''} onChange={e => updateProfileField('bank_name', e.target.value)} /></div>
              <div className="form-group"><label className="form-label">Account holder name</label>
                <input value={profile.bank_account_name || ''} onChange={e => updateProfileField('bank_account_name', e.target.value)} /></div>
            </div>
            <div className="form-row">
              <div className="form-group"><label className="form-label">Sort code</label>
                <input value={profile.bank_sort_code || ''} onChange={e => updateProfileField('bank_sort_code', e.target.value)} placeholder="XX-XX-XX" /></div>
              <div className="form-group"><label className="form-label">Account number</label>
                <input value={profile.bank_account_number || ''} onChange={e => updateProfileField('bank_account_number', e.target.value)} /></div>
            </div>
            <div className="form-group"><label className="form-label">IBAN (optional)</label>
              <input value={profile.bank_iban || ''} onChange={e => updateProfileField('bank_iban', e.target.value)} /></div>
          </div>

          <h3 style={{ fontSize: 13, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '20px 0 10px' }}>Payment terms</h3>
          <div className="card">
            <div className="form-group">
              <label className="form-label">Default terms text (shown on every invoice)</label>
              <textarea rows={3} value={profile.payment_terms || ''} onChange={e => updateProfileField('payment_terms', e.target.value)} />
            </div>
          </div>

          <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end' }}>
            <button className="btn btn-primary" onClick={saveProfile}>Save profile</button>
          </div>

          {/* ── SMTP CONFIGURATION ───────────────────────────────────── */}
          <h3 style={{ fontSize: 13, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '32px 0 10px' }}>
            SMTP — outgoing email
          </h3>
          <div className="card" style={{ marginBottom: 12, padding: 12, background: 'rgba(124,106,255,0.06)', border: '1px solid rgba(124,106,255,0.18)', fontSize: 12 }}>
            Used to send invoices, quotes, and overdue-payment reminders to clients. {smtp?.has_password ? <span style={{ color: 'var(--green)' }}>✓ SMTP password is saved.</span> : <span style={{ color: 'var(--amber)' }}>⚠ No password saved yet.</span>}
          </div>
          {smtp && (
            <div className="card">
              <div className="form-row">
                <div className="form-group"><label className="form-label">Host</label>
                  <input value={smtp.host || ''} onChange={e => updateSmtpField('host', e.target.value)} placeholder="mail.example.com" /></div>
                <div className="form-group" style={{ maxWidth: 100 }}><label className="form-label">Port</label>
                  <input type="number" value={smtp.port || 587} onChange={e => updateSmtpField('port', parseInt(e.target.value, 10) || 587)} /></div>
                <div className="form-group" style={{ maxWidth: 180 }}><label className="form-label">Encryption</label>
                  <select value={smtp.secure ? 'ssl' : 'starttls'} onChange={e => updateSmtpField('secure', e.target.value === 'ssl')}>
                    <option value="starttls">STARTTLS (port 587)</option>
                    <option value="ssl">SSL/TLS (port 465)</option>
                  </select></div>
              </div>
              <div className="form-row">
                <div className="form-group"><label className="form-label">Username</label>
                  <input value={smtp.user || ''} onChange={e => updateSmtpField('user', e.target.value)} placeholder="accounts@example.com" /></div>
                <div className="form-group"><label className="form-label">Password {smtp.has_password && <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>(leave blank to keep saved)</span>}</label>
                  <input type="password" value={smtp.pass || ''} onChange={e => updateSmtpField('pass', e.target.value)} placeholder={smtp.has_password ? '••••••••' : ''} /></div>
              </div>
              <div className="form-row">
                <div className="form-group"><label className="form-label">From address</label>
                  <input value={smtp.from_email || ''} onChange={e => updateSmtpField('from_email', e.target.value)} placeholder="accounts@example.com" /></div>
                <div className="form-group"><label className="form-label">From name</label>
                  <input value={smtp.from_name || ''} onChange={e => updateSmtpField('from_name', e.target.value)} /></div>
              </div>
              <div className="form-row">
                <div className="form-group"><label className="form-label">Reply-to (optional)</label>
                  <input value={smtp.reply_to || ''} onChange={e => updateSmtpField('reply_to', e.target.value)} placeholder="leave blank to use the From address" /></div>
                <div className="form-group" style={{ alignSelf: 'flex-end' }}>
                  <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input type="checkbox" checked={!!smtp.allow_self_signed} onChange={e => updateSmtpField('allow_self_signed', e.target.checked)} />
                    <span>Allow self-signed certificate</span>
                  </label>
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginTop: 12 }}>
                <button className="btn btn-ghost" onClick={testSmtp} disabled={!smtp.host}>Send test email</button>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  {smtpDirty && <span style={{ fontSize: 12, color: 'var(--amber)' }}>Unsaved changes</span>}
                  <button className="btn btn-primary" onClick={saveSmtp} disabled={!smtpDirty}>Save SMTP</button>
                </div>
              </div>
              {smtpTestStatus && (
                <div style={{ marginTop: 10, padding: 10, borderRadius: 6, fontSize: 13,
                  background: smtpTestStatus.kind === 'ok' ? 'rgba(16,217,143,0.12)' : smtpTestStatus.kind === 'err' ? 'rgba(255,77,109,0.12)' : 'rgba(255,255,255,0.05)',
                  color: smtpTestStatus.kind === 'ok' ? 'var(--green)' : smtpTestStatus.kind === 'err' ? 'var(--red)' : 'var(--text-muted)' }}>
                  {smtpTestStatus.message}
                </div>
              )}
            </div>
          )}

          {/* ── EMAIL TEMPLATES ──────────────────────────────────────── */}
          <h3 style={{ fontSize: 13, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '32px 0 10px' }}>
            Email templates
          </h3>
          <div className="card" style={{ marginBottom: 12, padding: 12, background: 'rgba(124,106,255,0.06)', border: '1px solid rgba(124,106,255,0.18)', fontSize: 12 }}>
            Placeholders: {' '}
            <code>{'{client_name}'}</code>, <code>{'{from_name}'}</code>, <code>{'{amount}'}</code>, <code>{'{invoice_number}'}</code>, <code>{'{quote_number}'}</code>, <code>{'{due_date}'}</code>, <code>{'{valid_until}'}</code>, <code>{'{days_overdue}'}</code>. {' '}
            Placeholders are filled when the email is sent — you can also edit the subject and body for that specific send right before clicking Send.
          </div>
          {[
            { key: 'invoice_send', label: 'Invoice — send' },
            { key: 'quote_send',   label: 'Quote — send' },
            { key: 'reminder_1',   label: 'Reminder 1 — 7 days overdue (friendly)' },
            { key: 'reminder_2',   label: 'Reminder 2 — 14 days overdue (firmer)' },
            { key: 'reminder_3',   label: 'Reminder 3 — 30 days overdue (formal)' },
          ].map(({ key, label }) => {
            const t = templates[key] || {};
            return (
              <details key={key} className="card" style={{ marginBottom: 10 }}>
                <summary style={{ cursor: 'pointer', padding: '8px 0', fontWeight: 500 }}>{label}</summary>
                <div className="form-group" style={{ marginTop: 10 }}>
                  <label className="form-label">Subject</label>
                  <input value={t.subject || ''} onChange={e => updateTemplate(key, 'subject', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Body</label>
                  <textarea rows={8} value={t.body || ''} onChange={e => updateTemplate(key, 'body', e.target.value)} style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }} />
                </div>
              </details>
            );
          })}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
            {templatesDirty && <span style={{ fontSize: 12, color: 'var(--amber)', alignSelf: 'center' }}>Unsaved changes</span>}
            <button className="btn btn-primary" onClick={saveTemplates} disabled={!templatesDirty}>Save templates</button>
          </div>

          {/* ── EMAIL LOG ────────────────────────────────────────────── */}
          <h3 style={{ fontSize: 13, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '32px 0 10px' }}>
            Recent email activity
          </h3>
          <div className="card" style={{ padding: 0 }}>
            <table>
              <thead><tr><th>Sent</th><th>To</th><th>Subject</th><th>Type</th><th>Status</th></tr></thead>
              <tbody>
                {emailLog.length === 0 && <tr><td colSpan="5" style={{ textAlign: 'center', padding: 20, color: 'var(--text-muted)' }}>No emails sent yet</td></tr>}
                {emailLog.map(e => (
                  <tr key={e.id}>
                    <td style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{new Date(e.sent_at).toLocaleString('en-GB')}</td>
                    <td style={{ fontSize: 12 }}>{e.to_address}</td>
                    <td style={{ fontSize: 12 }}>{e.subject}</td>
                    <td style={{ fontSize: 11, color: 'var(--text-muted)' }}>{e.related_type || '—'}</td>
                    <td>
                      {e.status === 'sent'
                        ? <span className="badge" style={{ background: 'rgba(16,217,143,0.2)', color: 'var(--green)' }}>sent</span>
                        : <span className="badge" style={{ background: 'rgba(255,77,109,0.2)', color: 'var(--red)' }} title={e.error || ''}>failed</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ─────────────────────────── MODALS ─────────────────────────── */}

      {/* CLIENT MODAL */}
      {modal === 'clients' && (
        <div className="modal-overlay" onClick={() => { setModal(null); setEditing(null); }}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">{editing ? 'Edit client' : 'New client'}</div>
            <div className="form-group">
              <label className="form-label">Type *</label>
              <div style={{ display: 'flex', gap: 4, background: 'var(--bg-secondary)', borderRadius: 8, padding: 3 }}>
                {[{v:'commercial',l:'Commercial'},{v:'residential',l:'Residential'}].map(o => (
                  <button key={o.v} onClick={() => setForm({ ...form, client_type: o.v })} style={{
                    flex: 1, padding: '8px 16px', borderRadius: 6, fontSize: 13, fontWeight: 500,
                    background: (form.client_type || 'commercial') === o.v ? 'var(--bg-card)' : 'transparent',
                    color: (form.client_type || 'commercial') === o.v ? 'var(--text-primary)' : 'var(--text-muted)',
                    border: 'none', cursor: 'pointer',
                  }}>{o.l}</button>
                ))}
              </div>
            </div>
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

      {/* QUOTE & INVOICE MODAL — shared structure with line items */}
      {(modal === 'quotes' || modal === 'invoices') && (
        <div className="modal-overlay" onClick={() => { setModal(null); setEditing(null); }}>
          <div className="modal" style={{ maxWidth: 720 }} onClick={e => e.stopPropagation()}>
            <div className="modal-title">{editing ? `Edit ${modal.slice(0, -1)}` : `New ${modal.slice(0, -1)}`}</div>
            <div className="form-row">
              <div className="form-group"><label className="form-label">{modal === 'quotes' ? 'Quote' : 'Invoice'} number</label>
                <input placeholder="Leave blank for auto"
                  value={(modal === 'quotes' ? form.quote_number : form.invoice_number) || ''}
                  onChange={e => setForm({ ...form, [modal === 'quotes' ? 'quote_number' : 'invoice_number']: e.target.value })} /></div>
              <div className="form-group"><label className="form-label">Status</label>
                <select value={form.status || 'draft'} onChange={e => setForm({ ...form, status: e.target.value })}>
                  {Object.entries(modal === 'quotes' ? QUOTE_STATUS : INVOICE_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
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
              <div className="form-group"><label className="form-label">Issue date</label>
                <input type="date" value={form.issue_date || today} onChange={e => setForm({ ...form, issue_date: e.target.value })} /></div>
              <div className="form-group"><label className="form-label">{modal === 'quotes' ? 'Valid until' : 'Due date'}</label>
                <input type="date"
                  value={(modal === 'quotes' ? form.valid_until : form.due_date) || ''}
                  onChange={e => setForm({ ...form, [modal === 'quotes' ? 'valid_until' : 'due_date']: e.target.value })} /></div>
            </div>

            {/* Line items editor */}
            <div style={{ marginTop: 12 }}>
              <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Line items</span>
                <button className="btn btn-ghost btn-sm" onClick={addLineItem}>+ Add line</button>
              </label>
              {(form.line_items || []).length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 70px 90px 90px 30px', gap: 6, fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                    <span>Description</span>
                    <span style={{ textAlign: 'right' }}>Qty</span>
                    <span style={{ textAlign: 'right' }}>Rate £</span>
                    <span style={{ textAlign: 'right' }}>Amount £</span>
                    <span></span>
                  </div>
                  {(form.line_items || []).map((li, idx) => (
                    <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 70px 90px 90px 30px', gap: 6 }}>
                      <input value={li.description || ''} onChange={e => updateLineItem(idx, 'description', e.target.value)} placeholder="e.g. Network audit" />
                      <input type="number" step="0.01" value={li.quantity || ''} onChange={e => updateLineItem(idx, 'quantity', e.target.value)} style={{ textAlign: 'right' }} />
                      <input type="number" step="0.01" value={li.rate || ''} onChange={e => updateLineItem(idx, 'rate', e.target.value)} style={{ textAlign: 'right' }} />
                      <input type="number" step="0.01" value={li.amount || ''} readOnly style={{ textAlign: 'right', background: 'var(--bg-tertiary)' }} />
                      <button className="btn-icon btn-sm" onClick={() => removeLineItem(idx)}>×</button>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: 10, textAlign: 'center', background: 'var(--bg-tertiary)', borderRadius: 6, marginBottom: 12 }}>
                  No line items — using lump-sum amount below. Click "Add line" to itemise.
                </div>
              )}
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Amount net (£) *</span>
                  {(form.line_items || []).length > 0 && <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>auto from line items</span>}
                </label>
                <input type="number" step="0.01" value={form.amount || ''}
                  onChange={e => setForm({ ...form, amount: e.target.value })}
                  readOnly={(form.line_items || []).length > 0}
                  style={(form.line_items || []).length > 0 ? { background: 'var(--bg-tertiary)' } : {}} />
              </div>
              <div className="form-group">
                <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>VAT (£)</span>
                  <button onClick={() => applyVAT(0.20)} style={{ fontSize: 10, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>Apply 20%</button>
                </label>
                <input type="number" step="0.01" value={form.vat_amount || 0} onChange={e => setForm({ ...form, vat_amount: e.target.value })} />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '8px 0', fontSize: 14 }}>
              <strong>Total: <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent)' }}>{fmt.currency(modalTotal)}</span></strong>
            </div>
            <div className="form-group"><label className="form-label">Notes</label><textarea rows={2} value={form.notes || ''} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => { setModal(null); setEditing(null); }}>Cancel</button>
              <button className="btn btn-primary" onClick={() => saveItem(modal)}>{editing ? 'Save' : 'Create'}</button>
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
              <div className="form-group">
                <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>VAT (£)</span>
                  <button onClick={() => applyVAT(0.20)} style={{ fontSize: 10, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>Apply 20%</button>
                </label>
                <input type="number" step="0.01" value={form.vat_amount || 0} onChange={e => setForm({ ...form, vat_amount: e.target.value })} />
              </div>
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

      {/* INTERACTIONS MODAL */}
      {modal === 'interactions' && interactionsClient && (
        <div className="modal-overlay" onClick={() => { setModal(null); setInteractionsClient(null); setInteractions([]); setForm({}); }}>
          <div className="modal" style={{ maxWidth: 640 }} onClick={e => e.stopPropagation()}>
            <div className="modal-title">{interactionsClient.company || interactionsClient.name} — interactions</div>

            {/* Quick add */}
            <div style={{ display: 'grid', gridTemplateColumns: '120px 140px 1fr', gap: 8, marginBottom: 8 }}>
              <select value={form.type || 'call'} onChange={e => setForm({ ...form, type: e.target.value })}>
                {Object.entries(INTERACTION_TYPES).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
              </select>
              <input type="datetime-local"
                value={form.date ? new Date(form.date).toISOString().slice(0, 16) : new Date().toISOString().slice(0, 16)}
                onChange={e => setForm({ ...form, date: e.target.value })} />
              <input placeholder="Quick summary..." value={form.summary || ''} onChange={e => setForm({ ...form, summary: e.target.value })} />
            </div>
            <textarea rows={2} placeholder="Notes (optional)" value={form.notes || ''} onChange={e => setForm({ ...form, notes: e.target.value })} style={{ width: '100%', marginBottom: 8 }} />
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
              <button className="btn btn-primary btn-sm" onClick={addInteraction} disabled={!form.type || !form.summary}>+ Log interaction</button>
            </div>

            {/* History */}
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, maxHeight: 360, overflowY: 'auto' }}>
              {interactions.length === 0 && <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-muted)', fontSize: 12 }}>No interactions logged yet</div>}
              {interactions.map(i => {
                const meta = INTERACTION_TYPES[i.type] || INTERACTION_TYPES.other;
                return (
                  <div key={i.id} style={{ display: 'flex', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ fontSize: 18, lineHeight: 1 }}>{meta.icon}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                        <strong style={{ fontSize: 13 }}>{i.summary}</strong>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                          {new Date(i.date).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      {i.notes && <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4, whiteSpace: 'pre-wrap' }}>{i.notes}</div>}
                    </div>
                    <button className="btn-icon btn-sm" onClick={() => deleteInteraction(i.id)}>×</button>
                  </div>
                );
              })}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
              <button className="btn btn-ghost" onClick={() => { setModal(null); setInteractionsClient(null); setInteractions([]); setForm({}); }}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* SEND MODAL */}
      {sendModal && (
        <div className="modal-overlay" onClick={() => !sending && setSendModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 640 }}>
            <div className="modal-title">
              {sendModal.kind === 'invoice'  && `Send invoice ${sendModal.doc.invoice_number}`}
              {sendModal.kind === 'quote'    && `Send quote ${sendModal.doc.quote_number}`}
              {sendModal.kind === 'reminder' && `Send reminder ${sendModal.level} — invoice ${sendModal.doc.invoice_number}`}
            </div>

            <div className="card" style={{ marginBottom: 12, padding: 10, background: 'rgba(124,106,255,0.06)', border: '1px solid rgba(124,106,255,0.18)', fontSize: 12 }}>
              {smtp?.has_password
                ? <>The {sendModal.kind === 'quote' ? 'quote' : 'invoice'} PDF will be attached automatically. You can edit subject and body below before sending.</>
                : <span style={{ color: 'var(--amber)' }}>⚠ SMTP not configured. Set it up in the Profile tab first.</span>}
            </div>

            {sendModal.kind === 'reminder' && (
              <div className="form-group">
                <label className="form-label">Reminder level</label>
                <div style={{ display: 'flex', gap: 4, background: 'var(--bg-secondary)', borderRadius: 8, padding: 3 }}>
                  {[1,2,3].map(l => (
                    <button key={l} onClick={() => {
                      const tpl = templates[`reminder_${l}`] || { subject: '', body: '' };
                      const client = clientFor(sendModal.doc);
                      const days   = daysOverdue(sendModal.doc.due_date);
                      const total  = parseFloat(sendModal.doc.amount || 0) + parseFloat(sendModal.doc.vat_amount || 0);
                      const vars = {
                        client_name:    client?.contact_name || client?.name || client?.company || 'there',
                        from_name:      profile?.name || 'Fast Lane Technology',
                        amount:         fmt.currency(total),
                        invoice_number: sendModal.doc.invoice_number,
                        due_date:       sendModal.doc.due_date ? fmt.date(sendModal.doc.due_date) : '',
                        days_overdue:   days,
                      };
                      setSendModal({
                        ...sendModal, level: l,
                        subject: fillTemplate(tpl.subject, vars),
                        body:    fillTemplate(tpl.body,    vars),
                      });
                    }} style={{
                      flex: 1, padding: '8px 16px', borderRadius: 6, fontSize: 13, fontWeight: 500,
                      background: sendModal.level === l ? 'var(--bg-card)' : 'transparent',
                      color: sendModal.level === l ? 'var(--text-primary)' : 'var(--text-muted)',
                      border: 'none', cursor: 'pointer',
                    }}>Level {l}{l === 1 ? ' — friendly' : l === 2 ? ' — firmer' : ' — formal'}</button>
                  ))}
                </div>
              </div>
            )}

            <div className="form-group">
              <label className="form-label">To</label>
              <input type="email" value={sendModal.to} onChange={e => setSendModal({ ...sendModal, to: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">Subject</label>
              <input value={sendModal.subject} onChange={e => setSendModal({ ...sendModal, subject: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">Body</label>
              <textarea rows={10} value={sendModal.body} onChange={e => setSendModal({ ...sendModal, body: e.target.value })} style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }} />
            </div>

            {sendError && (
              <div style={{ padding: 10, borderRadius: 6, fontSize: 13, color: 'var(--red)', background: 'rgba(255,77,109,0.12)', marginBottom: 12 }}>
                {sendError}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                {sendModal.kind === 'invoice'  && 'Invoice will be marked sent.'}
                {sendModal.kind === 'quote'    && 'Quote will be marked sent.'}
                {sendModal.kind === 'reminder' && 'Will record this reminder so it isn\'t auto-resent.'}
              </span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-ghost" onClick={() => setSendModal(null)} disabled={sending}>Cancel</button>
                <button className="btn btn-primary" onClick={performSend} disabled={sending || !smtp?.has_password}>
                  {sending ? 'Sending…' : 'Send'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
