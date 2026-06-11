import { useState, useEffect } from 'react';
import { get, post, patch, del, fmt, confirmDestructive } from '../../utils/api';

const TABS = ['Dashboard', 'All debts', 'Active plans', 'CCJs & Defaults', 'Owed to me', 'Archive'];

const DEBT_TYPES = {
  mortgage:          { label: 'Mortgage',                 priority: 'critical' },
  secured_loan:      { label: 'Secured loan',             priority: 'critical' },
  rent:              { label: 'Rent arrears',             priority: 'critical' },
  council_tax:       { label: 'Council tax',              priority: 'critical' },
  court_fine:        { label: 'Court fine',               priority: 'critical' },
  child_maintenance: { label: 'Child maintenance',        priority: 'critical' },
  tax:               { label: 'Tax (HMRC)',               priority: 'high' },
  utility:           { label: 'Utility (gas/elec/water)', priority: 'high' },
  tv_licence:        { label: 'TV licence',               priority: 'high' },
  student_loan:      { label: 'Student loan',             priority: 'high' },
  credit_agreement:  { label: 'Credit agreement / card',  priority: 'standard' },
  bnpl:              { label: 'Buy Now Pay Later',        priority: 'standard' },
  default:           { label: 'Defaulted account',        priority: 'standard' },
  ccj:               { label: 'CCJ',                      priority: 'standard' },
  statutory_demand:  { label: 'Statutory demand',         priority: 'standard' },
  enforcement:       { label: 'Enforcement / bailiff',    priority: 'critical' },
  personal:          { label: 'Personal (friend/family)', priority: 'low' },
  business:          { label: 'Business',                 priority: 'standard' },
  other:             { label: 'Other',                    priority: 'standard' },
};

const CREDITOR_TYPES = {
  mortgage_lender: 'Mortgage lender', landlord: 'Landlord', council: 'Council',
  utility_provider: 'Utility provider', hmrc: 'HMRC', court: 'Court', bailiff: 'Bailiff',
  bank: 'Bank', credit_card: 'Credit card issuer', finance_company: 'Finance company',
  dca: 'Debt collection agency', mobile_network: 'Mobile network', isp: 'ISP / broadband',
  individual: 'Individual', business: 'Business', government: 'Government', other: 'Other',
};

const STATUS_LABELS = {
  active:         { label: 'Active',         colour: 'var(--blue)' },
  arrears:        { label: 'In arrears',     colour: 'var(--amber)' },
  in_dispute:     { label: 'In dispute',     colour: 'var(--amber)' },
  payment_plan:   { label: 'Payment plan',   colour: 'var(--green)' },
  defaulted:      { label: 'Defaulted',      colour: 'var(--red)' },
  ccj_pending:    { label: 'CCJ pending',    colour: 'var(--red)' },
  ccj_active:     { label: 'CCJ active',     colour: 'var(--red)' },
  ccj_satisfied:  { label: 'CCJ satisfied',  colour: 'var(--text-muted)' },
  enforcement:    { label: 'Enforcement',    colour: 'var(--red)' },
  statute_barred: { label: 'Statute-barred', colour: 'var(--text-muted)' },
  written_off:    { label: 'Written off',    colour: 'var(--text-muted)' },
  settled:        { label: 'Settled',        colour: 'var(--green)' },
};

const PRIORITY_LABELS = {
  critical: { label: '\u26a0 Critical', colour: 'var(--red)',        bg: 'rgba(255,77,109,0.15)' },
  high:     { label: '\u2191 High',     colour: 'var(--amber)',      bg: 'rgba(255,181,71,0.15)' },
  standard: { label: 'Standard',        colour: 'var(--blue)',       bg: 'rgba(77,166,255,0.15)' },
  low:      { label: '\u2193 Low',      colour: 'var(--text-muted)', bg: 'var(--bg-secondary)' },
};

const FREQUENCY_LABELS = {
  weekly: 'Weekly', fortnightly: 'Fortnightly', four_weekly: 'Every 4 weeks',
  monthly: 'Monthly', quarterly: 'Quarterly', one_off: 'One-off lump sum',
};

const PAYMENT_METHODS = ['bank_transfer','standing_order','direct_debit','card','cash','cheque','postal_order','online','other'];

const INTERACTION_TYPES = {
  call_inbound: 'Incoming call', call_outbound: 'Outgoing call',
  letter_sent: 'Letter sent', letter_received: 'Letter received',
  email_sent: 'Email sent', email_received: 'Email received',
  sms_sent: 'SMS sent', sms_received: 'SMS received',
  payment: 'Payment', status_change: 'Status change', note: 'Note', other: 'Other',
};

export default function Debts() {
  const [tab, setTab]             = useState('Dashboard');
  const [dashboard, setDashboard] = useState(null);
  const [debts, setDebts]         = useState([]);
  const [selected, setSelected]   = useState(null);
  const [addModal, setAddModal]   = useState(false);
  const [editModal, setEditModal] = useState(null);
  const [filterDirection, setFilterDirection] = useState('owed_by_me');
  const [filterPriority, setFilterPriority]   = useState('');
  const [filterStatus, setFilterStatus]       = useState('');

  const loadDashboard = async () => { const d = await get('/debts/dashboard'); if (d) setDashboard(d); };
  const loadDebts = async () => {
    const p = new URLSearchParams();
    if (tab === 'Archive')    p.set('archived', 'true');
    if (tab === 'Owed to me') p.set('direction', 'owed_to_me');
    if (tab === 'All debts')  p.set('direction', filterDirection);
    if (filterPriority && tab === 'All debts') p.set('priority', filterPriority);
    if (filterStatus   && tab === 'All debts') p.set('status',   filterStatus);
    const d = await get(`/debts?${p}`); if (d) setDebts(d);
  };

  useEffect(() => { if (tab === 'Dashboard') loadDashboard(); else loadDebts(); }, [tab, filterDirection, filterPriority, filterStatus]);

  const filtered = (() => {
    if (tab === 'CCJs & Defaults') return debts.filter(d => ['defaulted','ccj_pending','ccj_active','ccj_satisfied','enforcement'].includes(d.status));
    if (tab === 'Active plans')    return debts.filter(d => d.active_plan);
    return debts;
  })();

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1>Debts</h1>
          <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Track money owed, payment plans, and adverse credit.</div>
        </div>
        <button className="btn btn-primary" onClick={() => setAddModal(true)}>+ Add debt</button>
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

      {tab === 'Dashboard' && <DashboardView dashboard={dashboard} onSelect={setSelected} />}
      {tab !== 'Dashboard' && (
        <>
          {tab === 'All debts' && (
            <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
              <select value={filterDirection} onChange={e => setFilterDirection(e.target.value)} style={{ maxWidth: 180 }}>
                <option value="owed_by_me">Owed by me</option>
                <option value="owed_to_me">Owed to me</option>
              </select>
              <select value={filterPriority} onChange={e => setFilterPriority(e.target.value)} style={{ maxWidth: 160 }}>
                <option value="">All priorities</option>
                {Object.keys(PRIORITY_LABELS).map(k => <option key={k} value={k}>{PRIORITY_LABELS[k].label}</option>)}
              </select>
              <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ maxWidth: 180 }}>
                <option value="">All statuses</option>
                {Object.entries(STATUS_LABELS).map(([v, s]) => <option key={v} value={v}>{s.label}</option>)}
              </select>
            </div>
          )}
          <DebtList debts={filtered} onSelect={setSelected} />
        </>
      )}

      {selected && <DebtDetail debtId={selected} onClose={() => setSelected(null)}
        onEdit={d => { setEditModal(d); setSelected(null); }}
        onDeleted={() => { setSelected(null); loadDebts(); loadDashboard(); }} />}
      {addModal && <DebtFormModal mode="new" onClose={() => setAddModal(false)}
        onSaved={() => { setAddModal(false); loadDebts(); loadDashboard(); }} />}
      {editModal && <DebtFormModal mode="edit" existing={editModal} onClose={() => setEditModal(null)}
        onSaved={() => { setEditModal(null); loadDebts(); loadDashboard(); }} />}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════════════════════════════
function DashboardView({ dashboard, onSelect }) {
  if (!dashboard) return <div className="card">Loading...</div>;
  const owedByMe = parseFloat(dashboard.totals.find(t => t.direction === 'owed_by_me')?.total_balance || 0);
  const owedToMe = parseFloat(dashboard.totals.find(t => t.direction === 'owed_to_me')?.total_balance || 0);
  const owedByMeCount = parseInt(dashboard.totals.find(t => t.direction === 'owed_by_me')?.count || 0, 10);
  const owedToMeCount = parseInt(dashboard.totals.find(t => t.direction === 'owed_to_me')?.count || 0, 10);

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12, marginBottom: 20 }}>
        <KpiCard label="I owe" value={fmt.currency(owedByMe)} sub={`${owedByMeCount} debt${owedByMeCount === 1 ? '' : 's'}`} colour="var(--red)" />
        <KpiCard label="Owed to me" value={fmt.currency(owedToMe)} sub={`${owedToMeCount} debt${owedToMeCount === 1 ? '' : 's'}`} colour="var(--green)" />
        <KpiCard label="Net position" value={fmt.currency(owedToMe - owedByMe)} colour={(owedToMe - owedByMe) >= 0 ? 'var(--green)' : 'var(--red)'} />
      </div>

      {dashboard.priority_debts.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <SectionHeader title="Priority debts" />
          <div className="card" style={{ padding: 12, background: 'rgba(255,77,109,0.06)', border: '1px solid rgba(255,77,109,0.2)', marginBottom: 10, fontSize: 12 }}>
            UK priority framework: non-payment of these debts can lead to bailiffs, eviction, energy disconnection, or imprisonment. Always pay these first.
          </div>
          {dashboard.priority_debts.map(d => (
            <div key={d.id} onClick={() => onSelect(d.id)} className="card" style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <PriorityBadge level={d.priority_level} />
                <strong>{d.creditor_name}</strong>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{DEBT_TYPES[d.debt_type]?.label}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <StatusBadge status={d.status} />
                <span style={{ fontSize: 16, fontWeight: 600, fontFamily: 'var(--font-mono)' }}>{fmt.currency(d.current_balance)}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {dashboard.upcoming_payments.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <SectionHeader title="Upcoming payments (next 14 days)" />
          <div className="card" style={{ padding: 0 }}>
            <table><thead><tr><th>Due</th><th>Creditor</th><th style={{ textAlign: 'right' }}>Amount</th><th>Frequency</th></tr></thead>
            <tbody>{dashboard.upcoming_payments.map(p => {
              const days = Math.floor((new Date(p.next_due_date) - new Date()) / 864e5);
              return (<tr key={p.id} onClick={() => onSelect(p.id)} style={{ cursor: 'pointer' }}>
                <td style={{ fontSize: 13 }}>{fmt.dateShort(p.next_due_date)} <span style={{ fontSize: 11, color: days < 0 ? 'var(--red)' : 'var(--text-muted)' }}>({days < 0 ? `${Math.abs(days)}d overdue` : days === 0 ? 'today' : `in ${days}d`})</span></td>
                <td style={{ fontSize: 13 }}>{p.creditor_name}</td>
                <td style={{ fontSize: 13, fontWeight: 500, textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{fmt.currency(p.amount)}</td>
                <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{FREQUENCY_LABELS[p.frequency] || p.frequency}</td>
              </tr>);
            })}</tbody></table>
          </div>
        </div>
      )}

      {dashboard.recent_payments.length > 0 && (
        <div>
          <SectionHeader title="Recent payments" />
          <div className="card" style={{ padding: 0 }}>
            <table><thead><tr><th>Date</th><th>Creditor</th><th style={{ textAlign: 'right' }}>Amount</th><th>Method</th></tr></thead>
            <tbody>{dashboard.recent_payments.map(p => (
              <tr key={p.id}><td style={{ fontSize: 13 }}>{fmt.dateShort(p.date)}</td><td style={{ fontSize: 13 }}>{p.creditor_name}</td>
              <td style={{ fontSize: 13, fontWeight: 500, textAlign: 'right', color: 'var(--green)', fontFamily: 'var(--font-mono)' }}>{fmt.currency(p.amount)}</td>
              <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{p.method?.replace(/_/g, ' ') || '\u2014'}</td></tr>
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
function DebtList({ debts, onSelect }) {
  if (!debts.length) return <div className="card" style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 40 }}>No debts here.</div>;
  return (
    <div className="card" style={{ padding: 0 }}>
      <table><thead><tr><th>Priority</th><th>Creditor</th><th>Type</th><th>Ref</th><th style={{ textAlign: 'right' }}>Balance</th><th>Status</th><th></th></tr></thead>
      <tbody>{debts.map(d => (
        <tr key={d.id} onClick={() => onSelect(d.id)} style={{ cursor: 'pointer' }}>
          <td><PriorityBadge level={d.priority_level} /></td>
          <td style={{ fontWeight: 500 }}>{d.creditor_name}{d.is_overdue && <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--red)' }}>{d.days_overdue}d overdue</span>}</td>
          <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{DEBT_TYPES[d.debt_type]?.label || d.debt_type}</td>
          <td style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>{d.account_reference || d.their_reference || '\u2014'}</td>
          <td style={{ textAlign: 'right', fontWeight: 500, fontFamily: 'var(--font-mono)' }}>{fmt.currency(d.current_balance)}</td>
          <td><StatusBadge status={d.status} /></td>
          <td style={{ fontSize: 16, color: 'var(--text-muted)' }}>\u203a</td>
        </tr>
      ))}</tbody></table>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// DETAIL (overlay modal)
// ═══════════════════════════════════════════════════════════════
function DebtDetail({ debtId, onClose, onEdit, onDeleted }) {
  const [debt, setDebt] = useState(null);
  const [payments, setPayments] = useState([]);
  const [plans, setPlans] = useState([]);
  const [interactions, setInteractions] = useState([]);
  const [subTab, setSubTab] = useState('overview');
  const [showAdd, setShowAdd] = useState(null); // 'payment'|'plan'|'interaction'

  const reload = async () => {
    const [d, p, pl, i] = await Promise.all([
      get(`/debts/${debtId}`), get(`/debts/${debtId}/payments`),
      get(`/debts/${debtId}/plans`), get(`/debts/${debtId}/interactions`),
    ]);
    if (d) setDebt(d); if (p) setPayments(p); if (pl) setPlans(pl); if (i) setInteractions(i);
  };
  useEffect(() => { reload(); }, [debtId]);
  if (!debt) return null;

  const remove = async () => {
    if (!confirmDestructive('Delete this debt and all its payment/plan/interaction history?')) return;
    await del(`/debts/${debtId}`); onDeleted();
  };

  const SUB_TABS = ['overview','payments','plan','interactions'];
  if (debt.ccj_judgement_date || debt.debt_type === 'ccj') SUB_TABS.push('ccj');

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 900, maxHeight: '90vh', overflow: 'auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <PriorityBadge level={debt.priority_level} /> <StatusBadge status={debt.status} />
              {debt.is_statute_barred && <span className="badge" style={{ background: 'var(--bg-secondary)', color: 'var(--text-muted)' }}>STATUTE-BARRED</span>}
              {debt.direction === 'owed_to_me' && <span className="badge" style={{ background: 'rgba(16,217,143,0.15)', color: 'var(--green)' }}>OWED TO ME</span>}
            </div>
            <h2 style={{ margin: 0 }}>{debt.creditor_name}</h2>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
              {DEBT_TYPES[debt.debt_type]?.label}{debt.creditor_type && ` \u00b7 ${CREDITOR_TYPES[debt.creditor_type] || debt.creditor_type}`}
              {debt.original_creditor && ` \u00b7 originally ${debt.original_creditor}`}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-ghost btn-sm" onClick={() => onEdit(debt)}>Edit</button>
            <button className="btn btn-ghost btn-sm" onClick={async () => { await patch(`/debts/${debtId}`, { is_archived: !debt.is_archived }); onDeleted(); }}>{debt.is_archived ? 'Unarchive' : 'Archive'}</button>
            <button className="btn-icon btn-sm" onClick={onClose}>\u00d7</button>
          </div>
        </div>

        {/* KPIs */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 8, marginBottom: 16 }}>
          <KpiCard label="Balance" value={fmt.currency(debt.current_balance)} colour={debt.direction === 'owed_by_me' ? 'var(--red)' : 'var(--green)'} small />
          <KpiCard label="Original" value={fmt.currency(debt.original_amount)} small />
          <KpiCard label="Paid" value={fmt.currency(debt.total_paid)} colour="var(--green)" small />
          {debt.active_plan && <KpiCard label="Next payment" value={fmt.currency(debt.active_plan.amount)} sub={debt.active_plan.next_due_date ? fmt.dateShort(debt.active_plan.next_due_date) : 'N/A'} colour={debt.is_overdue ? 'var(--red)' : 'var(--text-primary)'} small />}
        </div>

        {/* Sub-tabs */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 16, background: 'var(--bg-secondary)', borderRadius: 8, padding: 3 }}>
          {SUB_TABS.map(t => (
            <button key={t} onClick={() => setSubTab(t)} style={{
              flex: 1, padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 500,
              background: subTab === t ? 'var(--bg-card)' : 'transparent',
              color: subTab === t ? 'var(--text-primary)' : 'var(--text-muted)',
              border: 'none', cursor: 'pointer', textTransform: 'capitalize',
            }}>{t}</button>
          ))}
        </div>

        {subTab === 'overview' && <OverviewPane debt={debt} />}
        {subTab === 'payments' && <PaymentsPane payments={payments} onAdd={() => setShowAdd('payment')}
          onDelete={async id => { if (!confirmDestructive('Delete this payment?')) return; await del(`/debts/${debtId}/payments/${id}`); reload(); }} />}
        {subTab === 'plan' && <PlanPane plans={plans} onAdd={() => setShowAdd('plan')}
          onEnd={async id => { if (!confirmDestructive('End this plan?')) return; await patch(`/debts/${debtId}/plans/${id}`, { is_active: false }); reload(); }} />}
        {subTab === 'interactions' && <InteractionsPane interactions={interactions} onAdd={() => setShowAdd('interaction')}
          onDelete={async id => { if (!confirmDestructive('Delete?')) return; await del(`/debts/${debtId}/interactions/${id}`); reload(); }} />}
        {subTab === 'ccj' && <CcjPane debt={debt} />}

        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
          <button className="btn btn-ghost btn-sm" style={{ color: 'var(--red)' }} onClick={remove}>Delete debt</button>
        </div>

        {showAdd === 'payment' && <AddPaymentModal debtId={debtId} onClose={() => setShowAdd(null)} onSaved={() => { setShowAdd(null); reload(); }} />}
        {showAdd === 'plan' && <AddPlanModal debtId={debtId} onClose={() => setShowAdd(null)} onSaved={() => { setShowAdd(null); reload(); }} />}
        {showAdd === 'interaction' && <AddInteractionModal debtId={debtId} onClose={() => setShowAdd(null)} onSaved={() => { setShowAdd(null); reload(); }} />}
      </div>
    </div>
  );
}

function OverviewPane({ debt }) {
  return (
    <div className="card" style={{ fontSize: 13, lineHeight: 1.8 }}>
      <DefRow label="Account reference" value={debt.account_reference} mono />
      <DefRow label="Their reference"   value={debt.their_reference} mono />
      <DefRow label="Interest rate"     value={debt.interest_rate != null ? `${debt.interest_rate}%` : null} />
      <DefRow label="Agreement date"    value={debt.agreement_date && fmt.date(debt.agreement_date)} />
      <DefRow label="Default date"      value={debt.default_date && fmt.date(debt.default_date)} hint={debt.default_date ? '6-year credit file clock starts here' : null} />
      <DefRow label="Last payment"      value={debt.last_recorded_payment && fmt.date(debt.last_recorded_payment)} />
      <DefRow label="Last acknowledged" value={debt.last_acknowledgement_date && fmt.date(debt.last_acknowledgement_date)} hint="Written acknowledgement restarts statute-barred clock" />
      <DefRow label="Statute-barred"    value={debt.statute_barred_date && fmt.date(debt.statute_barred_date)}
        hint={debt.suggested_statute_barred_date && !debt.statute_barred_date ? `Suggested: ${fmt.date(debt.suggested_statute_barred_date)}` : null} />
      <DefRow label="Secured against"   value={debt.secured_against} />
      <DefRow label="Phone"             value={debt.contact_phone} />
      <DefRow label="Email"             value={debt.contact_email} />
      <DefRow label="Address"           value={debt.contact_address} />
      {debt.notes && <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>Notes</div>
        <div style={{ whiteSpace: 'pre-wrap' }}>{debt.notes}</div>
      </div>}
    </div>
  );
}

function PaymentsPane({ payments, onAdd, onDelete }) {
  return (<div>
    <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
      <button className="btn btn-primary btn-sm" onClick={onAdd}>+ Record payment</button>
    </div>
    <div className="card" style={{ padding: 0 }}>
      <table><thead><tr><th>Date</th><th style={{ textAlign: 'right' }}>Amount</th><th>Method</th><th>Reference</th><th></th></tr></thead>
      <tbody>
        {!payments.length && <tr><td colSpan="5" style={{ textAlign: 'center', padding: 20, color: 'var(--text-muted)' }}>No payments recorded</td></tr>}
        {payments.map(p => (<tr key={p.id}>
          <td style={{ fontSize: 13 }}>{fmt.date(p.date)}</td>
          <td style={{ fontSize: 13, fontFamily: 'var(--font-mono)', textAlign: 'right', color: 'var(--green)' }}>{fmt.currency(p.amount)}</td>
          <td style={{ fontSize: 12 }}>{p.method?.replace(/_/g, ' ') || '\u2014'}</td>
          <td style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>{p.reference || '\u2014'}</td>
          <td><button className="btn-icon btn-sm" onClick={() => onDelete(p.id)}>\u00d7</button></td>
        </tr>))}
      </tbody></table>
    </div>
  </div>);
}

function PlanPane({ plans, onAdd, onEnd }) {
  const active = plans.find(p => p.is_active);
  const old = plans.filter(p => !p.is_active);
  return (<div>
    {active ? (
      <div className="card" style={{ background: 'rgba(16,217,143,0.06)', border: '1px solid rgba(16,217,143,0.2)', marginBottom: 12 }}>
        <div style={{ fontSize: 11, color: 'var(--green)', textTransform: 'uppercase', marginBottom: 8 }}>Active plan</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 12, marginBottom: 12 }}>
          <Stat label="Amount" value={fmt.currency(active.amount)} />
          <Stat label="Frequency" value={FREQUENCY_LABELS[active.frequency] || active.frequency} />
          <Stat label="Start" value={fmt.date(active.start_date)} />
          <Stat label="Next due" value={active.next_due_date ? fmt.date(active.next_due_date) : '\u2014'} />
          {active.end_date && <Stat label="End" value={fmt.date(active.end_date)} />}
        </div>
        {active.agreement_reference && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Agreement: <code>{active.agreement_reference}</code></div>}
        {active.notes && <div style={{ fontSize: 13, marginTop: 8, whiteSpace: 'pre-wrap' }}>{active.notes}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => onEnd(active.id)}>End plan</button>
        </div>
      </div>
    ) : (
      <div className="card" style={{ textAlign: 'center', padding: 24 }}>
        <div style={{ color: 'var(--text-muted)', marginBottom: 12 }}>No active payment plan.</div>
        <button className="btn btn-primary" onClick={onAdd}>+ Set up payment plan</button>
      </div>
    )}
    {old.length > 0 && <>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', margin: '16px 0 8px' }}>Past plans</div>
      {old.map(p => <div key={p.id} className="card" style={{ marginBottom: 8, fontSize: 12 }}>
        {FREQUENCY_LABELS[p.frequency]} of {fmt.currency(p.amount)} from {fmt.date(p.start_date)}{p.end_date && ` to ${fmt.date(p.end_date)}`}
      </div>)}
    </>}
  </div>);
}

function InteractionsPane({ interactions, onAdd, onDelete }) {
  return (<div>
    <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
      <button className="btn btn-primary btn-sm" onClick={onAdd}>+ Log interaction</button>
    </div>
    {!interactions.length && <div className="card" style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)' }}>No communications logged.</div>}
    {interactions.map(i => (
      <div key={i.id} className="card" style={{ marginBottom: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span className="badge" style={{ fontSize: 10 }}>{INTERACTION_TYPES[i.type] || i.type}</span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{fmt.dateTime(i.date)}</span>
            </div>
            <div style={{ fontSize: 13, fontWeight: 500 }}>{i.summary}</div>
            {i.notes && <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4, whiteSpace: 'pre-wrap' }}>{i.notes}</div>}
          </div>
          <button className="btn-icon btn-sm" onClick={() => onDelete(i.id)}>\u00d7</button>
        </div>
      </div>
    ))}
  </div>);
}

function CcjPane({ debt }) {
  const jd = debt.ccj_judgement_date ? new Date(debt.ccj_judgement_date) : null;
  const within30 = jd ? (new Date() - jd) / 864e5 <= 30 : false;
  const sixYear = jd ? new Date(jd.getTime() + 6 * 365.25 * 864e5) : null;
  return (
    <div className="card" style={{ fontSize: 13, lineHeight: 1.8 }}>
      <DefRow label="Case number"      value={debt.ccj_case_number} mono />
      <DefRow label="Court"            value={debt.ccj_court} />
      <DefRow label="Judgement date"   value={jd && fmt.date(jd)} />
      <DefRow label="Judgement amount" value={debt.ccj_judgement_amount != null && fmt.currency(debt.ccj_judgement_amount)} />
      <DefRow label="Satisfied date"   value={debt.ccj_satisfied_date && fmt.date(debt.ccj_satisfied_date)} />
      {jd && (
        <div style={{ marginTop: 16, padding: 12, background: 'rgba(124,106,255,0.06)', border: '1px solid rgba(124,106,255,0.2)', borderRadius: 6, fontSize: 12 }}>
          <strong>Credit file implications:</strong>
          <div style={{ marginTop: 8, paddingLeft: 12 }}>
            {within30 && !debt.ccj_satisfied_date && <div style={{ color: 'var(--green)', marginBottom: 4 }}>Within 30-day satisfaction window. If paid in full now, the CCJ is removed from the register entirely.</div>}
            {!within30 && !debt.ccj_satisfied_date && <div style={{ marginBottom: 4 }}>30-day satisfaction window has passed. Paying now marks "satisfied" but the CCJ stays on the register for 6 years from judgement.</div>}
            {debt.ccj_satisfied_date && <div style={{ color: 'var(--green)', marginBottom: 4 }}>Satisfied on {fmt.date(debt.ccj_satisfied_date)}.</div>}
            {sixYear && <div style={{ marginBottom: 4 }}>Falls off the credit register on {fmt.date(sixYear)} (6 years from judgement).</div>}
            <div>CCJs are never statute-barred. Judgement debts can be pursued indefinitely, though enforcement after 6 years requires a court application.</div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// ADD/EDIT DEBT FORM
// ═══════════════════════════════════════════════════════════════
function DebtFormModal({ mode, existing, onClose, onSaved }) {
  const [form, setForm] = useState(existing || {
    direction: 'owed_by_me', debt_type: 'credit_agreement', priority_level: 'standard',
    creditor_type: 'bank', currency: 'GBP', status: 'active',
    original_amount: '', current_balance: '', creditor_name: '',
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  useEffect(() => {
    if (mode === 'new') set('priority_level', DEBT_TYPES[form.debt_type]?.priority || 'standard');
  }, [form.debt_type]);

  useEffect(() => {
    if (mode === 'new' && form.original_amount && !form.current_balance) set('current_balance', form.original_amount);
  }, [form.original_amount]);

  const save = async () => {
    if (!form.creditor_name || form.original_amount === '' || form.original_amount == null) { alert('Creditor name and original amount are required.'); return; }
    const payload = { ...form };
    for (const k of Object.keys(payload)) { if (payload[k] === '') payload[k] = null; }
    if (mode === 'new') await post('/debts', payload);
    else                await patch(`/debts/${existing.id}`, payload);
    onSaved();
  };

  const isCcj = form.debt_type === 'ccj' || !!form.ccj_judgement_date;
  const isSecured = ['mortgage','secured_loan'].includes(form.debt_type);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 760, maxHeight: '90vh', overflow: 'auto' }}>
        <div className="modal-title">{mode === 'new' ? 'Add debt' : `Edit ${form.creditor_name}`}</div>

        <div className="form-row">
          <div className="form-group"><label className="form-label">Direction</label>
            <select value={form.direction} onChange={e => set('direction', e.target.value)}>
              <option value="owed_by_me">I owe them</option><option value="owed_to_me">They owe me</option>
            </select></div>
          <div className="form-group"><label className="form-label">Debt type</label>
            <select value={form.debt_type} onChange={e => set('debt_type', e.target.value)}>
              {Object.entries(DEBT_TYPES).map(([v, i]) => <option key={v} value={v}>{i.label}</option>)}
            </select></div>
          <div className="form-group"><label className="form-label">Priority {mode === 'new' && <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>(auto)</span>}</label>
            <select value={form.priority_level} onChange={e => set('priority_level', e.target.value)}>
              <option value="critical">Critical</option><option value="high">High</option>
              <option value="standard">Standard</option><option value="low">Low</option>
            </select></div>
        </div>

        <div className="form-row">
          <div className="form-group"><label className="form-label">Creditor name *</label>
            <input value={form.creditor_name || ''} onChange={e => set('creditor_name', e.target.value)} /></div>
          <div className="form-group"><label className="form-label">Creditor type</label>
            <select value={form.creditor_type || ''} onChange={e => set('creditor_type', e.target.value)}>
              <option value="">\u2014</option>
              {Object.entries(CREDITOR_TYPES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select></div>
        </div>
        <div className="form-group"><label className="form-label">Original creditor (if sold to DCA)</label>
          <input value={form.original_creditor || ''} onChange={e => set('original_creditor', e.target.value)} placeholder="e.g. Barclaycard (now Lowell)" /></div>

        <div className="form-row">
          <div className="form-group"><label className="form-label">Original amount *</label>
            <input type="number" step="0.01" value={form.original_amount || ''} onChange={e => set('original_amount', e.target.value)} /></div>
          <div className="form-group"><label className="form-label">Current balance</label>
            <input type="number" step="0.01" value={form.current_balance || ''} onChange={e => set('current_balance', e.target.value)} /></div>
          <div className="form-group" style={{ maxWidth: 100 }}><label className="form-label">APR %</label>
            <input type="number" step="0.01" value={form.interest_rate || ''} onChange={e => set('interest_rate', e.target.value)} /></div>
        </div>

        <div className="form-row">
          <div className="form-group"><label className="form-label">Account reference</label>
            <input value={form.account_reference || ''} onChange={e => set('account_reference', e.target.value)} /></div>
          <div className="form-group"><label className="form-label">Their reference</label>
            <input value={form.their_reference || ''} onChange={e => set('their_reference', e.target.value)} /></div>
        </div>

        <SectionHeader title="Key dates" />
        <div className="form-row">
          <div className="form-group"><label className="form-label">Agreement date</label><input type="date" value={form.agreement_date || ''} onChange={e => set('agreement_date', e.target.value)} /></div>
          <div className="form-group"><label className="form-label">Default date</label><input type="date" value={form.default_date || ''} onChange={e => set('default_date', e.target.value)} /></div>
        </div>
        <div className="form-row">
          <div className="form-group"><label className="form-label">Last payment</label><input type="date" value={form.last_payment_date || ''} onChange={e => set('last_payment_date', e.target.value)} /></div>
          <div className="form-group"><label className="form-label">Last acknowledgement</label><input type="date" value={form.last_acknowledgement_date || ''} onChange={e => set('last_acknowledgement_date', e.target.value)} /></div>
          <div className="form-group"><label className="form-label">Statute-barred from</label><input type="date" value={form.statute_barred_date || ''} onChange={e => set('statute_barred_date', e.target.value)} /></div>
        </div>

        {isCcj && <>
          <SectionHeader title="CCJ details" />
          <div className="form-row">
            <div className="form-group"><label className="form-label">Case number</label><input value={form.ccj_case_number || ''} onChange={e => set('ccj_case_number', e.target.value)} /></div>
            <div className="form-group"><label className="form-label">Court</label><input value={form.ccj_court || ''} onChange={e => set('ccj_court', e.target.value)} /></div>
          </div>
          <div className="form-row">
            <div className="form-group"><label className="form-label">Judgement date</label><input type="date" value={form.ccj_judgement_date || ''} onChange={e => set('ccj_judgement_date', e.target.value)} /></div>
            <div className="form-group"><label className="form-label">Judgement amount</label><input type="number" step="0.01" value={form.ccj_judgement_amount || ''} onChange={e => set('ccj_judgement_amount', e.target.value)} /></div>
            <div className="form-group"><label className="form-label">Satisfied date</label><input type="date" value={form.ccj_satisfied_date || ''} onChange={e => set('ccj_satisfied_date', e.target.value)} /></div>
          </div>
        </>}

        {isSecured && <div className="form-group"><label className="form-label">Secured against</label>
          <input value={form.secured_against || ''} onChange={e => set('secured_against', e.target.value)} placeholder="e.g. property address" /></div>}

        <SectionHeader title="Contact" />
        <div className="form-row">
          <div className="form-group"><label className="form-label">Phone</label><input value={form.contact_phone || ''} onChange={e => set('contact_phone', e.target.value)} /></div>
          <div className="form-group"><label className="form-label">Email</label><input type="email" value={form.contact_email || ''} onChange={e => set('contact_email', e.target.value)} /></div>
        </div>
        <div className="form-group"><label className="form-label">Address</label><textarea rows={2} value={form.contact_address || ''} onChange={e => set('contact_address', e.target.value)} /></div>

        <div className="form-row">
          <div className="form-group"><label className="form-label">Status</label>
            <select value={form.status} onChange={e => set('status', e.target.value)}>
              {Object.entries(STATUS_LABELS).map(([v, s]) => <option key={v} value={v}>{s.label}</option>)}
            </select></div>
        </div>
        <div className="form-group"><label className="form-label">Notes</label><textarea rows={4} value={form.notes || ''} onChange={e => set('notes', e.target.value)} /></div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={save}>Save</button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// SMALL MODALS
// ═══════════════════════════════════════════════════════════════
function AddPaymentModal({ debtId, onClose, onSaved }) {
  const [form, setForm] = useState({ amount: '', date: new Date().toISOString().split('T')[0], method: 'bank_transfer', reference: '', notes: '' });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const save = async () => {
    if (!form.amount || !form.date) { alert('Amount and date required.'); return; }
    await post(`/debts/${debtId}/payments`, form); onSaved();
  };
  return (<div className="modal-overlay" onClick={onClose}><div className="modal" onClick={e => e.stopPropagation()}>
    <div className="modal-title">Record payment</div>
    <div className="form-row">
      <div className="form-group"><label className="form-label">Amount *</label><input type="number" step="0.01" value={form.amount} onChange={e => set('amount', e.target.value)} autoFocus /></div>
      <div className="form-group"><label className="form-label">Date *</label><input type="date" value={form.date} onChange={e => set('date', e.target.value)} /></div>
    </div>
    <div className="form-group"><label className="form-label">Method</label><select value={form.method} onChange={e => set('method', e.target.value)}>
      {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m.replace(/_/g, ' ')}</option>)}
    </select></div>
    <div className="form-group"><label className="form-label">Reference</label><input value={form.reference} onChange={e => set('reference', e.target.value)} /></div>
    <div className="form-group"><label className="form-label">Notes</label><textarea rows={3} value={form.notes} onChange={e => set('notes', e.target.value)} /></div>
    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}><button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={save}>Record</button></div>
  </div></div>);
}

function AddPlanModal({ debtId, onClose, onSaved }) {
  const [form, setForm] = useState({ frequency: 'monthly', amount: '', start_date: new Date().toISOString().split('T')[0], end_date: '', agreement_reference: '', agreement_date: '', notes: '' });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const save = async () => {
    if (!form.amount || !form.start_date) { alert('Amount and start date required.'); return; }
    const p = { ...form }; for (const k of Object.keys(p)) if (p[k] === '') p[k] = null;
    await post(`/debts/${debtId}/plans`, p); onSaved();
  };
  return (<div className="modal-overlay" onClick={onClose}><div className="modal" onClick={e => e.stopPropagation()}>
    <div className="modal-title">Set up payment plan</div>
    <div className="form-row">
      <div className="form-group"><label className="form-label">Frequency *</label><select value={form.frequency} onChange={e => set('frequency', e.target.value)}>
        {Object.entries(FREQUENCY_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select></div>
      <div className="form-group"><label className="form-label">Amount *</label><input type="number" step="0.01" value={form.amount} onChange={e => set('amount', e.target.value)} /></div>
    </div>
    <div className="form-row">
      <div className="form-group"><label className="form-label">Start date *</label><input type="date" value={form.start_date} onChange={e => set('start_date', e.target.value)} /></div>
      <div className="form-group"><label className="form-label">End date</label><input type="date" value={form.end_date} onChange={e => set('end_date', e.target.value)} /></div>
    </div>
    <div className="form-row">
      <div className="form-group"><label className="form-label">Agreement reference</label><input value={form.agreement_reference} onChange={e => set('agreement_reference', e.target.value)} placeholder="e.g. DMP-12345" /></div>
      <div className="form-group"><label className="form-label">Agreement date</label><input type="date" value={form.agreement_date} onChange={e => set('agreement_date', e.target.value)} /></div>
    </div>
    <div className="form-group"><label className="form-label">Notes</label><textarea rows={3} value={form.notes} onChange={e => set('notes', e.target.value)} /></div>
    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}><button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={save}>Create plan</button></div>
  </div></div>);
}

function AddInteractionModal({ debtId, onClose, onSaved }) {
  const now = new Date(); const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  const [form, setForm] = useState({ type: 'call_outbound', date: local, summary: '', notes: '' });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const save = async () => {
    if (!form.summary) { alert('Summary required.'); return; }
    await post(`/debts/${debtId}/interactions`, { ...form, date: new Date(form.date).toISOString() }); onSaved();
  };
  return (<div className="modal-overlay" onClick={onClose}><div className="modal" onClick={e => e.stopPropagation()}>
    <div className="modal-title">Log interaction</div>
    <div className="form-row">
      <div className="form-group"><label className="form-label">Type</label><select value={form.type} onChange={e => set('type', e.target.value)}>
        {Object.entries(INTERACTION_TYPES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select></div>
      <div className="form-group"><label className="form-label">When</label><input type="datetime-local" value={form.date} onChange={e => set('date', e.target.value)} /></div>
    </div>
    <div className="form-group"><label className="form-label">Summary *</label><input value={form.summary} onChange={e => set('summary', e.target.value)} placeholder="e.g. Called Lowell, agreed 25/month" autoFocus /></div>
    <div className="form-group"><label className="form-label">Notes</label><textarea rows={4} value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Full detail for evidence trail" /></div>
    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}><button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={save}>Save</button></div>
  </div></div>);
}

// ═══════════════════════════════════════════════════════════════
// PRIMITIVES
// ═══════════════════════════════════════════════════════════════
function KpiCard({ label, value, sub, colour, small }) {
  return (<div className="card" style={{ padding: small ? 10 : 16 }}>
    <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
    <div style={{ fontSize: small ? 18 : 24, fontWeight: 600, color: colour || 'var(--text-primary)', fontFamily: 'var(--font-mono)', marginTop: 4 }}>{value}</div>
    {sub && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{sub}</div>}
  </div>);
}
function Stat({ label, value }) {
  return (<div><div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{label}</div><div style={{ fontSize: 14, fontWeight: 500, marginTop: 2 }}>{value}</div></div>);
}
function PriorityBadge({ level }) {
  const c = PRIORITY_LABELS[level] || PRIORITY_LABELS.standard;
  return <span className="badge" style={{ background: c.bg, color: c.colour, fontSize: 10, fontWeight: 600 }}>{c.label}</span>;
}
function StatusBadge({ status }) {
  const c = STATUS_LABELS[status] || { label: status, colour: 'var(--text-muted)' };
  return <span className="badge" style={{ background: 'var(--bg-secondary)', color: c.colour, fontSize: 10, fontWeight: 600 }}>{c.label}</span>;
}
function DefRow({ label, value, hint, mono }) {
  if (value === null || value === undefined || value === '' || value === false) return null;
  return (<div style={{ display: 'flex', gap: 12, padding: '4px 0' }}>
    <div style={{ flex: '0 0 200px', color: 'var(--text-muted)', fontSize: 12 }}>{label}</div>
    <div style={{ flex: 1, fontFamily: mono ? 'var(--font-mono)' : 'inherit', fontSize: 13 }}>{value}
      {hint && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{hint}</div>}
    </div>
  </div>);
}
function SectionHeader({ title }) {
  return <h3 style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '16px 0 8px' }}>{title}</h3>;
}
