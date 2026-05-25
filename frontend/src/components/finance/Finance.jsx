import { useState, useEffect } from 'react';
import { get, post, patch, del, fmt } from '../../utils/api.js';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';

const TABS = ['Overview', 'Transactions', 'Recurring', 'Payees', 'Budgets', 'Accounts', 'Goals'];

export default function Finance() {
  const [tab, setTab]               = useState('Overview');
  const [accounts, setAccounts]     = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [categories, setCategories] = useState([]);
  const [budgets, setBudgets]       = useState([]);
  const [fGoals, setFGoals]         = useState([]);
  const [payees, setPayees]         = useState([]);
  const [recurring, setRecurring]   = useState([]);
  const [analytics, setAnalytics]   = useState(null);
  const [modal, setModal]           = useState(null);
  const [form, setForm]             = useState({});
  const [search, setSearch]         = useState('');
  const [filterType, setFilterType] = useState('');

  const load = async () => {
    const [acc, txns, cats, bdg, fg, pay, rec, an] = await Promise.allSettled([
      get('/finance/accounts'),
      get('/finance/transactions?limit=200'),
      get('/finance/categories'),
      get('/finance/budgets'),
      get('/finance/financial-goals'),
      get('/finance/payees'),
      get('/finance/recurring'),
      get('/finance/analytics/summary'),
    ]);
    if (acc.value)  setAccounts(acc.value);
    if (txns.value) setTransactions(txns.value);
    if (cats.value) setCategories(cats.value);
    if (bdg.value)  setBudgets(bdg.value);
    if (fg.value)   setFGoals(fg.value);
    if (pay.value)  setPayees(pay.value);
    if (rec.value)  setRecurring(rec.value);
    if (an.value)   setAnalytics(an.value);
  };

  useEffect(() => { load(); }, []);

  const totalBalance = accounts.reduce((s, a) => s + parseFloat(a.balance || 0), 0);

  const filteredTxns = transactions.filter(t => {
    if (filterType && t.type !== filterType) return false;
    if (search && !t.description?.toLowerCase().includes(search.toLowerCase()) &&
        !t.merchant?.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const handleAddTransaction = async () => {
    await post('/finance/transactions', {
      ...form,
      // ensure recurring fields are sane
      recurring:           !!form.recurring,
      recurring_interval:  form.recurring ? (form.recurring_interval || 'monthly') : null,
      next_due:            form.recurring ? (form.next_due || form.date) : null,
    });
    setModal(null); setForm({}); load();
  };

  const handleAddAccount = async () => {
    await post('/finance/accounts', form);
    setModal(null); setForm({}); load();
  };

  const handleAddBudget = async () => {
    await post('/finance/budgets', form);
    setModal(null); setForm({}); load();
  };

  const handleAddFGoal = async () => {
    await post('/finance/financial-goals', form);
    setModal(null); setForm({}); load();
  };

  const handleAddPayee = async () => {
    await post('/finance/payees', form);
    setModal(null); setForm({}); load();
  };

  const handleDeleteTxn = async (id) => {
    if (confirm('Delete transaction? This will reverse the account balance.')) {
      await del(`/finance/transactions/${id}`);
      load();
    }
  };

  const handlePauseRecurring = async (id) => {
    await patch(`/finance/recurring/${id}/pause`, {});
    load();
  };

  const handleResumeRecurring = async (id) => {
    await patch(`/finance/recurring/${id}/resume`, {});
    load();
  };

  const handleDeletePayee = async (id) => {
    if (confirm('Delete payee? Linked transactions will keep but unlink.')) {
      await del(`/finance/payees/${id}`);
      load();
    }
  };

  return (
    <div className="page animate-fade">
      <div className="page-header">
        <div>
          <h1 className="page-title">Finance</h1>
          <p className="page-subtitle">Track income, expenses & financial goals</p>
        </div>
        <button className="btn btn-primary" onClick={() => {
          setModal('txn');
          setForm({ type: 'expense', date: new Date().toISOString().split('T')[0] });
        }}>
          + Transaction
        </button>
      </div>

      {/* ── Net worth banner ──────────────────────────────────────────────── */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(16,217,143,0.1), rgba(77,166,255,0.08))',
        border: '1px solid rgba(16,217,143,0.2)',
        borderRadius: 'var(--radius)',
        padding: '16px 20px',
        marginBottom: 20,
        display: 'flex',
        gap: 24,
        alignItems: 'center',
        flexWrap: 'wrap',
      }}>
        <div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Net Worth</div>
          <div style={{
            fontSize: 28, fontWeight: 700, fontFamily: 'var(--font-mono)',
            color: totalBalance >= 0 ? 'var(--green)' : 'var(--red)',
          }}>
            {fmt.currency(totalBalance)}
          </div>
        </div>
        {totalBalance < 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--red)', fontSize: 13 }}>
            ⚠ Negative net worth
          </div>
        )}
        {analytics && (
          <>
            <div style={{ width: 1, height: 36, background: 'var(--border)', flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Income</div>
              <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--green)', fontFamily: 'var(--font-mono)' }}>{fmt.currency(analytics.income)}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Spend</div>
              <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--red)', fontFamily: 'var(--font-mono)' }}>{fmt.currency(analytics.expenses)}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Net</div>
              <div style={{ fontSize: 18, fontWeight: 600, fontFamily: 'var(--font-mono)', color: analytics.net >= 0 ? 'var(--green)' : 'var(--red)' }}>
                {fmt.currency(analytics.net)}
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── Tabs ──────────────────────────────────────────────────────────── */}
      <div className="finance-tabs">
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '7px 16px', borderRadius: 7, fontSize: 13, fontWeight: 500,
            whiteSpace: 'nowrap',
            background: tab === t ? 'var(--bg-card)' : 'transparent',
            color: tab === t ? 'var(--text-primary)' : 'var(--text-muted)',
            border: tab === t ? '1px solid var(--border)' : '1px solid transparent',
            transition: 'var(--transition)',
          }}>{t}</button>
        ))}
      </div>

      {/* ── Overview ─────────────────────────────────────────────────────── */}
      {tab === 'Overview' && analytics && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20 }}>
          <div className="card">
            <h3 style={{ marginBottom: 16, fontSize: 14, fontWeight: 600 }}>Spending by Category</h3>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={analytics.byCategory}
                  cx="50%" cy="50%"
                  innerRadius={55} outerRadius={85}
                  dataKey="total" paddingAngle={3}
                >
                  {analytics.byCategory.map((c, i) => <Cell key={i} fill={c.colour || '#6366f1'} />)}
                </Pie>
                <Tooltip
                  formatter={(v) => fmt.currency(v)}
                  contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
              {analytics.byCategory.slice(0, 5).map(c => (
                <div key={c.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 10, height: 10, borderRadius: 3, background: c.colour || '#6366f1', flexShrink: 0 }} />
                    <span style={{ fontSize: 13 }}>{c.name}</span>
                  </div>
                  <span style={{ fontSize: 13, fontFamily: 'var(--font-mono)', color: 'var(--red)' }}>{fmt.currency(c.total)}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <h3 style={{ marginBottom: 16, fontSize: 14, fontWeight: 600 }}>Daily Cashflow</h3>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={analytics.daily}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={d => d.slice(5)} stroke="var(--text-muted)" />
                <YAxis tick={{ fontSize: 10 }} stroke="var(--text-muted)" tickFormatter={v => `£${v}`} />
                <Tooltip
                  formatter={(v) => fmt.currency(v)}
                  contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
                />
                <Bar dataKey="income"  fill="#10d98f" radius={[3, 3, 0, 0]} />
                <Bar dataKey="expense" fill="#ff4d6d" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {analytics.byPayee && analytics.byPayee.length > 0 && (
            <div className="card">
              <h3 style={{ marginBottom: 16, fontSize: 14, fontWeight: 600 }}>Top Payees</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {analytics.byPayee.slice(0, 8).map(p => (
                  <div key={p.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 10, height: 10, borderRadius: 3, background: p.colour || '#6366f1', flexShrink: 0 }} />
                      <span style={{ fontSize: 13 }}>{p.name}</span>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>({p.count})</span>
                    </div>
                    <span style={{ fontSize: 13, fontFamily: 'var(--font-mono)', color: 'var(--red)' }}>{fmt.currency(p.total)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Transactions ──────────────────────────────────────────────────── */}
      {tab === 'Transactions' && (
        <div>
          <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
            <input
              placeholder="Search transactions..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ maxWidth: 260, flex: 1 }}
            />
            <select value={filterType} onChange={e => setFilterType(e.target.value)} style={{ width: 140 }}>
              <option value="">All types</option>
              <option value="income">Income</option>
              <option value="expense">Expense</option>
            </select>
          </div>
          <div className="card" style={{ padding: 0 }}>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Description</th>
                    <th className="hide-mobile">Payee</th>
                    <th className="hide-mobile">Category</th>
                    <th className="hide-mobile">Account</th>
                    <th>Amount</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTxns.slice(0, 100).map(t => (
                    <tr key={t.id}>
                      <td style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                        {fmt.dateShort(t.date)}
                      </td>
                      <td>
                        <div style={{ fontWeight: 500 }}>
                          {t.description || t.merchant || '—'}
                          {t.recurring && (
                            <span className="badge" style={{ marginLeft: 8, background: 'rgba(124,106,255,0.15)', color: 'var(--accent)', fontSize: 10 }}>
                              ↻ recurring
                            </span>
                          )}
                        </div>
                        {t.merchant && t.description && (
                          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t.merchant}</div>
                        )}
                      </td>
                      <td className="hide-mobile" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                        {t.payee_name || '—'}
                      </td>
                      <td className="hide-mobile">
                        {t.category_name && (
                          <span className="badge" style={{ background: t.category_colour + '25', color: t.category_colour }}>
                            {t.category_name}
                          </span>
                        )}
                      </td>
                      <td className="hide-mobile" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                        {t.account_name}
                      </td>
                      <td>
                        <span style={{
                          fontFamily: 'var(--font-mono)', fontWeight: 600,
                          color: t.type === 'income' ? 'var(--green)' : 'var(--red)',
                          whiteSpace: 'nowrap',
                        }}>
                          {t.type === 'income' ? '+' : '-'}{fmt.currency(Math.abs(t.amount))}
                        </span>
                      </td>
                      <td>
                        <button className="btn-icon" onClick={() => handleDeleteTxn(t.id)} style={{ fontSize: 14 }}>×</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── Recurring ─────────────────────────────────────────────────────── */}
      {tab === 'Recurring' && (
        <div>
          <div style={{ marginBottom: 16, fontSize: 13, color: 'var(--text-muted)' }}>
            Recurring transactions are processed daily at 00:05. Pause to stop generating new entries; existing entries remain.
          </div>
          {recurring.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)' }}>
              No recurring transactions yet. Tick the "Recurring" box when adding a transaction.
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
              {recurring.map(r => {
                const paused = !r.recurring;
                return (
                  <div key={r.id} className="card" style={{ opacity: paused ? 0.6 : 1, borderLeft: `4px solid ${paused ? 'var(--text-muted)' : (r.type === 'income' ? 'var(--green)' : 'var(--red)')}` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                      <div>
                        <div style={{ fontWeight: 600 }}>{r.description || r.merchant || '—'}</div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                          {r.payee_name || r.account_name}
                        </div>
                      </div>
                      <div style={{
                        fontSize: 16, fontWeight: 700, fontFamily: 'var(--font-mono)',
                        color: r.type === 'income' ? 'var(--green)' : 'var(--red)',
                      }}>
                        {r.type === 'income' ? '+' : '-'}{fmt.currency(Math.abs(r.amount))}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
                      <span className="badge" style={{ background: 'var(--bg-tertiary)', color: 'var(--text-secondary)', textTransform: 'capitalize' }}>
                        {r.recurring_interval || 'monthly'}
                      </span>
                      {r.category_name && (
                        <span className="badge" style={{ background: (r.category_colour || '#6366f1') + '25', color: r.category_colour || '#6366f1' }}>
                          {r.category_name}
                        </span>
                      )}
                      {paused && (
                        <span className="badge" style={{ background: 'rgba(255,181,71,0.15)', color: 'var(--amber)' }}>Paused</span>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
                      Next due: <span style={{ color: 'var(--text-secondary)' }}>{r.next_due ? fmt.date(r.next_due) : '—'}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      {paused ? (
                        <button className="btn btn-ghost btn-sm" onClick={() => handleResumeRecurring(r.id)}>Resume</button>
                      ) : (
                        <button className="btn btn-ghost btn-sm" onClick={() => handlePauseRecurring(r.id)}>Pause</button>
                      )}
                      <button className="btn btn-danger btn-sm" onClick={() => handleDeleteTxn(r.id)}>Delete</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Payees ────────────────────────────────────────────────────────── */}
      {tab === 'Payees' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
            <button className="btn btn-primary" onClick={() => { setModal('payee'); setForm({ type: 'person', colour: '#6366f1' }); }}>
              + Payee
            </button>
          </div>
          {payees.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)' }}>
              No payees yet. Add one to start tracking who you pay.
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 16 }}>
              {payees.map(p => (
                <div key={p.id} className="card" style={{ borderLeft: `4px solid ${p.colour || '#6366f1'}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <div>
                      <div style={{ fontWeight: 600 }}>{p.name}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'capitalize' }}>{p.type}</div>
                    </div>
                    <button className="btn-icon btn-sm" onClick={() => handleDeletePayee(p.id)}>×</button>
                  </div>
                  <div style={{ fontSize: 20, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--red)' }}>
                    {fmt.currency(p.total_spent || 0)}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                    {p.transaction_count || 0} transaction{p.transaction_count == 1 ? '' : 's'}
                  </div>
                  {p.notes && (
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
                      {p.notes}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Budgets ───────────────────────────────────────────────────────── */}
      {tab === 'Budgets' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
            <button className="btn btn-primary" onClick={() => { setModal('budget'); setForm({ period: 'monthly' }); }}>+ Budget</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
            {budgets.map(b => {
              const pct  = Math.min(100, fmt.percent(parseFloat(b.spent), parseFloat(b.amount)));
              const over = parseFloat(b.spent) > parseFloat(b.amount);
              return (
                <div key={b.id} className="card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                    <div>
                      <div style={{ fontWeight: 600 }}>{b.category_name}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'capitalize' }}>{b.period}</div>
                    </div>
                    <button className="btn-icon btn-sm" onClick={async () => { await del(`/finance/budgets/${b.id}`); load(); }}>×</button>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 13 }}>
                    <span style={{ color: over ? 'var(--red)' : 'var(--text-secondary)' }}>{fmt.currency(b.spent)} spent</span>
                    <span>{fmt.currency(b.amount)}</span>
                  </div>
                  <div className="progress-bar" style={{ height: 6 }}>
                    <div className="progress-bar-fill" style={{ width: `${pct}%`, background: over ? 'var(--red)' : 'var(--green)' }} />
                  </div>
                  <div style={{ fontSize: 11, color: over ? 'var(--red)' : 'var(--text-muted)', marginTop: 6 }}>
                    {over
                      ? `${fmt.currency(parseFloat(b.spent) - parseFloat(b.amount))} over budget`
                      : `${fmt.currency(parseFloat(b.amount) - parseFloat(b.spent))} remaining`}
                  </div>
                </div>
              );
            })}
            {budgets.length === 0 && <p style={{ color: 'var(--text-muted)' }}>No budgets set up yet</p>}
          </div>
        </div>
      )}

      {/* ── Accounts ─────────────────────────────────────────────────────── */}
      {tab === 'Accounts' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
            <button className="btn btn-primary" onClick={() => { setModal('account'); setForm({ type: 'current', currency: 'GBP', balance: 0 }); }}>
              + Account
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16 }}>
            {accounts.map(a => {
              const negative = parseFloat(a.balance) < 0;
              return (
                <div key={a.id} className="card" style={{ borderLeft: `4px solid ${negative ? 'var(--red)' : a.colour}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <div>
                      <div style={{ fontWeight: 600 }}>{a.name}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'capitalize' }}>{a.type}</div>
                    </div>
                    <button className="btn-icon btn-sm" onClick={async () => { if (confirm('Delete account?')) { await del(`/finance/accounts/${a.id}`); load(); } }}>×</button>
                  </div>
                  <div style={{ fontSize: 24, fontWeight: 700, fontFamily: 'var(--font-mono)', color: negative ? 'var(--red)' : 'var(--text-primary)' }}>
                    {negative && '↓ '}{fmt.currency(a.balance, a.currency)}
                  </div>
                  {negative && (
                    <div style={{ fontSize: 11, color: 'var(--red)', marginTop: 4 }}>Negative balance</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Financial Goals ───────────────────────────────────────────────── */}
      {tab === 'Goals' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
            <button className="btn btn-primary" onClick={() => { setModal('fgoal'); setForm({ current_amount: 0 }); }}>+ Financial Goal</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
            {fGoals.map(g => {
              const pct = fmt.percent(parseFloat(g.current_amount), parseFloat(g.target_amount));
              return (
                <div key={g.id} className="card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                    <div style={{ fontWeight: 600 }}>{g.name}</div>
                    <button className="btn-icon btn-sm" onClick={async () => { await del(`/finance/financial-goals/${g.id}`); load(); }}>×</button>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 13 }}>
                    <span style={{ color: 'var(--green)' }}>{fmt.currency(g.current_amount)}</span>
                    <span style={{ color: 'var(--text-muted)' }}>of {fmt.currency(g.target_amount)}</span>
                  </div>
                  <div className="progress-bar" style={{ height: 8 }}>
                    <div className="progress-bar-fill" style={{ width: `${pct}%`, background: g.colour || 'var(--green)' }} />
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
                    {pct}% · {g.target_date ? `Target: ${fmt.date(g.target_date)}` : 'No deadline'}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Modals ────────────────────────────────────────────────────────── */}
      {modal === 'txn' && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">Add Transaction</div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Type</label>
                <select value={form.type || 'expense'} onChange={e => setForm({ ...form, type: e.target.value })}>
                  <option value="expense">Expense</option>
                  <option value="income">Income</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Amount (£)</label>
                <input type="number" step="0.01" min="0" placeholder="0.00" value={form.amount || ''} onChange={e => setForm({ ...form, amount: e.target.value })} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Description</label>
              <input placeholder="e.g. Tesco shop" value={form.description || ''} onChange={e => setForm({ ...form, description: e.target.value })} />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Account</label>
                <select value={form.account_id || ''} onChange={e => setForm({ ...form, account_id: e.target.value })}>
                  <option value="">Select...</option>
                  {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Category</label>
                <select value={form.category_id || ''} onChange={e => setForm({ ...form, category_id: e.target.value })}>
                  <option value="">Select...</option>
                  {categories.filter(c => c.type === form.type).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Payee (optional)</label>
                <select value={form.payee_id || ''} onChange={e => setForm({ ...form, payee_id: e.target.value })}>
                  <option value="">— None —</option>
                  {payees.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Date (can be backdated)</label>
                <input type="date" value={form.date || ''} onChange={e => setForm({ ...form, date: e.target.value })} />
              </div>
            </div>

            {/* ── Recurring section ───────────────────────────────────────── */}
            <div style={{ padding: 12, background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-sm)', marginBottom: 16 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', userSelect: 'none' }}>
                <input
                  type="checkbox"
                  checked={!!form.recurring}
                  onChange={e => setForm({ ...form, recurring: e.target.checked })}
                  style={{ width: 'auto' }}
                />
                Recurring transaction
              </label>
              {form.recurring && (
                <div className="form-row" style={{ marginTop: 12 }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Interval</label>
                    <select value={form.recurring_interval || 'monthly'} onChange={e => setForm({ ...form, recurring_interval: e.target.value })}>
                      <option value="daily">Daily</option>
                      <option value="weekly">Weekly</option>
                      <option value="monthly">Monthly</option>
                      <option value="yearly">Yearly</option>
                    </select>
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Next Due</label>
                    <input type="date" value={form.next_due || form.date || ''} onChange={e => setForm({ ...form, next_due: e.target.value })} />
                  </div>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => setModal(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleAddTransaction}>Add</button>
            </div>
          </div>
        </div>
      )}

      {modal === 'account' && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">Add Account</div>
            <div className="form-group">
              <label className="form-label">Name</label>
              <input placeholder="e.g. Monzo Current" value={form.name || ''} onChange={e => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Type</label>
                <select value={form.type || 'current'} onChange={e => setForm({ ...form, type: e.target.value })}>
                  <option value="current">Current</option>
                  <option value="savings">Savings</option>
                  <option value="credit">Credit Card</option>
                  <option value="investment">Investment</option>
                  <option value="cash">Cash</option>
                  <option value="loan">Loan</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Opening Balance (£)</label>
                <input type="number" step="0.01" value={form.balance || 0} onChange={e => setForm({ ...form, balance: e.target.value })} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => setModal(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleAddAccount}>Add Account</button>
            </div>
          </div>
        </div>
      )}

      {modal === 'budget' && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">Add Budget</div>
            <div className="form-group">
              <label className="form-label">Category</label>
              <select value={form.category_id || ''} onChange={e => setForm({ ...form, category_id: e.target.value })}>
                <option value="">Select...</option>
                {categories.filter(c => c.type === 'expense').map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Amount (£)</label>
                <input type="number" step="0.01" value={form.amount || ''} onChange={e => setForm({ ...form, amount: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Period</label>
                <select value={form.period || 'monthly'} onChange={e => setForm({ ...form, period: e.target.value })}>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                  <option value="yearly">Yearly</option>
                </select>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => setModal(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleAddBudget}>Add Budget</button>
            </div>
          </div>
        </div>
      )}

      {modal === 'fgoal' && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">Add Financial Goal</div>
            <div className="form-group">
              <label className="form-label">Goal Name</label>
              <input placeholder="e.g. Car deposit" value={form.name || ''} onChange={e => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Target Amount (£)</label>
                <input type="number" step="0.01" value={form.target_amount || ''} onChange={e => setForm({ ...form, target_amount: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Saved So Far (£)</label>
                <input type="number" step="0.01" value={form.current_amount || 0} onChange={e => setForm({ ...form, current_amount: e.target.value })} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Target Date</label>
              <input type="date" value={form.target_date || ''} onChange={e => setForm({ ...form, target_date: e.target.value })} />
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => setModal(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleAddFGoal}>Add Goal</button>
            </div>
          </div>
        </div>
      )}

      {modal === 'payee' && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">Add Payee</div>
            <div className="form-group">
              <label className="form-label">Name</label>
              <input placeholder="e.g. British Gas, John Smith" value={form.name || ''} onChange={e => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Type</label>
                <select value={form.type || 'person'} onChange={e => setForm({ ...form, type: e.target.value })}>
                  <option value="person">Person</option>
                  <option value="company">Company</option>
                  <option value="service">Service</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Colour</label>
                <input type="color" value={form.colour || '#6366f1'} onChange={e => setForm({ ...form, colour: e.target.value })} style={{ height: 38, padding: 4 }} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Notes (optional)</label>
              <input placeholder="e.g. Energy supplier, monthly DD" value={form.notes || ''} onChange={e => setForm({ ...form, notes: e.target.value })} />
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => setModal(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleAddPayee}>Add Payee</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
