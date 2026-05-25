import { useState, useEffect } from 'react';
import { get, post, patch, del } from '../utils/api';

export default function Settings() {
    const [activeTab, setActiveTab] = useState('prefs');
    const [prefs, setPrefs] = useState({ currency: 'GBP', first_day_of_week: '1', date_format: 'en-GB' });
    const [lifeAreas, setLifeAreas] = useState([]);
    const [categories, setCategories] = useState([]);
    const [notebooks, setNotebooks] = useState([]);
    const [logs, setLogs] = useState({ logs: [], total: 0 });
    const [logFilter, setLogFilter] = useState({ level: '', module: '' });
    const [pinForm, setPinForm] = useState({ current: '', new: '', confirm: '' });
    const [pinResult, setPinResult] = useState(null);
    const [modal, setModal] = useState(null);
    const [editItem, setEditItem] = useState(null);

    const loadPrefs = async () => {
        const data = await get('/settings/preferences');
        setPrefs(prev => ({ ...prev, ...data }));
    };
    const loadLifeAreas = async () => {
        const data = await get('/settings/life-areas');
        setLifeAreas(data);
    };
    const loadCategories = async () => {
        const data = await get('/settings/categories');
        setCategories(data);
    };
    const loadNotebooks = async () => {
        const data = await get('/settings/notebooks');
        setNotebooks(data);
    };
    const loadLogs = async () => {
        const params = new URLSearchParams();
        if (logFilter.level) params.append('level', logFilter.level);
        if (logFilter.module) params.append('module', logFilter.module);
        const data = await get(`/settings/logs?${params.toString()}`);
        setLogs(data);
    };

    useEffect(() => { loadPrefs(); }, []);
    useEffect(() => { if (activeTab === 'lifeareas') loadLifeAreas(); }, [activeTab]);
    useEffect(() => { if (activeTab === 'categories') loadCategories(); }, [activeTab]);
    useEffect(() => { if (activeTab === 'notebooks') loadNotebooks(); }, [activeTab]);
    useEffect(() => { if (activeTab === 'logs') loadLogs(); }, [activeTab, logFilter]);

    const updatePref = async (key, value) => {
        await patch('/settings/preferences', { [key]: value });
        setPrefs(prev => ({ ...prev, [key]: value }));
    };

    const changePin = async () => {
        if (pinForm.new !== pinForm.confirm) return alert('New PINs do not match');
        try {
            const res = await post('/settings/change-pin', { current_pin: pinForm.current, new_pin: pinForm.new });
            setPinResult(res);
            alert(`New PIN hash:\n${res.hash}\n\n${res.instruction}`);
        } catch (err) {
            alert(err.message);
        }
    };

    const exportData = () => {
        window.location.href = '/api/settings/export';
    };

    const handleAddLifeArea = async (data) => {
        await post('/settings/life-areas', data);
        loadLifeAreas();
        setModal(null);
    };
    const handleEditLifeArea = async (id, data) => {
        await patch(`/settings/life-areas/${id}`, data);
        loadLifeAreas();
        setModal(null);
    };
    const handleDeleteLifeArea = async (id) => {
        if (confirm('Delete this life area? It will be hidden from future use.')) {
            await del(`/settings/life-areas/${id}`);
            loadLifeAreas();
        }
    };

    // Similar for categories and notebooks – we'll implement generically
    const handleAddCategory = async (data) => {
        await post('/settings/categories', data);
        loadCategories();
        setModal(null);
    };
    const handleEditCategory = async (id, data) => {
        await patch(`/settings/categories/${id}`, data);
        loadCategories();
        setModal(null);
    };
    const handleDeleteCategory = async (id) => {
        if (confirm('Delete this category? Transactions will keep the category name but it will be hidden.')) {
            await del(`/settings/categories/${id}`);
            loadCategories();
        }
    };

    const handleAddNotebook = async (data) => {
        await post('/settings/notebooks', data);
        loadNotebooks();
        setModal(null);
    };
    const handleEditNotebook = async (id, data) => {
        await patch(`/settings/notebooks/${id}`, data);
        loadNotebooks();
        setModal(null);
    };
    const handleDeleteNotebook = async (id) => {
        if (confirm('Delete this notebook? All notes inside will remain but become unassigned.')) {
            await del(`/settings/notebooks/${id}`);
            loadNotebooks();
        }
    };

    const renderModal = () => {
        if (!modal) return null;
        const { type, item } = modal;
        const isEdit = !!item;
        const title = isEdit ? `Edit ${type}` : `Add ${type}`;
        const [form, setForm] = useState(isEdit ? { ...item } : { name: '', colour: '#6366f1', icon: type === 'category' ? '📂' : (type === 'lifearea' ? '📌' : '📓') });
        if (type === 'category' && !isEdit) form.type = 'expense';
        const handleSave = () => {
            if (type === 'lifearea') isEdit ? handleEditLifeArea(item.id, form) : handleAddLifeArea(form);
            if (type === 'category') isEdit ? handleEditCategory(item.id, form) : handleAddCategory(form);
            if (type === 'notebook') isEdit ? handleEditNotebook(item.id, form) : handleAddNotebook(form);
        };
        return (
            <div className="modal-overlay" onClick={() => setModal(null)}>
                <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 400 }}>
                    <div className="modal-title">{title}</div>
                    <div className="form-group">
                        <label>Name</label>
                        <input value={form.name || ''} onChange={e => setForm({ ...form, name: e.target.value })} />
                    </div>
                    {type === 'category' && !isEdit && (
                        <div className="form-group">
                            <label>Type</label>
                            <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
                                <option value="expense">Expense</option>
                                <option value="income">Income</option>
                            </select>
                        </div>
                    )}
                    <div className="form-group">
                        <label>Colour</label>
                        <input type="color" value={form.colour || '#6366f1'} onChange={e => setForm({ ...form, colour: e.target.value })} />
                    </div>
                    <div className="form-group">
                        <label>Icon (emoji)</label>
                        <input value={form.icon || ''} onChange={e => setForm({ ...form, icon: e.target.value })} placeholder="📌" />
                    </div>
                    <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                        <button className="btn btn-ghost" onClick={() => setModal(null)}>Cancel</button>
                        <button className="btn btn-primary" onClick={handleSave}>Save</button>
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className="page animate-fade">
            <div className="page-header">
                <h1 className="page-title">Settings</h1>
            </div>

            <div style={{ display: 'flex', gap: 8, borderBottom: '1px solid var(--border)', marginBottom: 24, overflowX: 'auto' }}>
                {['prefs', 'security', 'lifeareas', 'categories', 'notebooks', 'logs', 'export'].map(tab => (
                    <button key={tab} onClick={() => setActiveTab(tab)} className="btn-ghost" style={{ padding: '8px 16px', borderBottom: activeTab === tab ? '2px solid var(--accent)' : 'none', whiteSpace: 'nowrap' }}>
                        {tab === 'prefs' ? 'Preferences' : tab === 'security' ? 'Security' : tab === 'lifeareas' ? 'Life Areas' : tab === 'categories' ? 'Categories' : tab === 'notebooks' ? 'Notebooks' : tab === 'logs' ? 'Logs' : 'Export'}
                    </button>
                ))}
            </div>

            {/* Preferences */}
            {activeTab === 'prefs' && (
                <div className="card" style={{ maxWidth: 500 }}>
                    <div className="form-group">
                        <label>Currency</label>
                        <select value={prefs.currency} onChange={e => updatePref('currency', e.target.value)}>
                            <option>GBP</option><option>USD</option><option>EUR</option>
                        </select>
                    </div>
                    <div className="form-group">
                        <label>First day of week</label>
                        <select value={prefs.first_day_of_week} onChange={e => updatePref('first_day_of_week', e.target.value)}>
                            <option value="0">Sunday</option><option value="1">Monday</option>
                        </select>
                    </div>
                    <div className="form-group">
                        <label>Date format</label>
                        <select value={prefs.date_format} onChange={e => updatePref('date_format', e.target.value)}>
                            <option>en-GB</option><option>en-US</option>
                        </select>
                    </div>
                </div>
            )}

            {/* Security */}
            {activeTab === 'security' && (
                <div className="card" style={{ maxWidth: 500 }}>
                    <div className="form-group"><label>Current PIN</label><input type="password" value={pinForm.current} onChange={e => setPinForm({...pinForm, current: e.target.value})} /></div>
                    <div className="form-group"><label>New PIN</label><input type="password" value={pinForm.new} onChange={e => setPinForm({...pinForm, new: e.target.value})} /></div>
                    <div className="form-group"><label>Confirm new PIN</label><input type="password" value={pinForm.confirm} onChange={e => setPinForm({...pinForm, confirm: e.target.value})} /></div>
                    <button className="btn btn-primary" onClick={changePin}>Change PIN</button>
                    {pinResult && <pre style={{ marginTop: 16, fontSize: 11, background: 'var(--bg-secondary)', padding: 12, borderRadius: 8 }}>{JSON.stringify(pinResult, null, 2)}</pre>}
                </div>
            )}

            {/* Life Areas */}
            {activeTab === 'lifeareas' && (
                <div>
                    <button className="btn btn-primary btn-sm" onClick={() => setModal({ type: 'lifearea' })}>+ Add Life Area</button>
                    <div className="grid" style={{ marginTop: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px,1fr))', gap: 12 }}>
                        {lifeAreas.map(la => (
                            <div key={la.id} className="card" style={{ padding: 12, borderLeft: `4px solid ${la.colour}` }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span><span style={{ fontSize: 20 }}>{la.icon}</span> <strong>{la.name}</strong></span>
                                    <div>
                                        <button className="btn-icon" onClick={() => setModal({ type: 'lifearea', item: la })}>✎</button>
                                        <button className="btn-icon" onClick={() => handleDeleteLifeArea(la.id)}>×</button>
                                    </div>
                                </div>
                                {!la.user_managed && <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>system</span>}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Categories */}
            {activeTab === 'categories' && (
                <div>
                    <button className="btn btn-primary btn-sm" onClick={() => setModal({ type: 'category' })}>+ Add Category</button>
                    <div style={{ marginTop: 16 }}>
                        <h3>Expense</h3>
                        <div className="grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px,1fr))', gap: 12 }}>
                            {categories.filter(c => c.type === 'expense').map(cat => (
                                <div key={cat.id} className="card" style={{ padding: 8, borderLeft: `4px solid ${cat.colour}` }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <span><span>{cat.icon}</span> {cat.name}</span>
                                        <div><button className="btn-icon" onClick={() => setModal({ type: 'category', item: cat })}>✎</button><button className="btn-icon" onClick={() => handleDeleteCategory(cat.id)}>×</button></div>
                                    </div>
                                </div>
                            ))}
                        </div>
                        <h3 style={{ marginTop: 20 }}>Income</h3>
                        <div className="grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px,1fr))', gap: 12 }}>
                            {categories.filter(c => c.type === 'income').map(cat => (
                                <div key={cat.id} className="card" style={{ padding: 8, borderLeft: `4px solid ${cat.colour}` }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <span><span>{cat.icon}</span> {cat.name}</span>
                                        <div><button className="btn-icon" onClick={() => setModal({ type: 'category', item: cat })}>✎</button><button className="btn-icon" onClick={() => handleDeleteCategory(cat.id)}>×</button></div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Notebooks */}
            {activeTab === 'notebooks' && (
                <div>
                    <button className="btn btn-primary btn-sm" onClick={() => setModal({ type: 'notebook' })}>+ Add Notebook</button>
                    <div className="grid" style={{ marginTop: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px,1fr))', gap: 12 }}>
                        {notebooks.map(nb => (
                            <div key={nb.id} className="card" style={{ padding: 8, borderLeft: `4px solid ${nb.colour}` }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span><span>{nb.icon}</span> {nb.name}</span>
                                    <div><button className="btn-icon" onClick={() => setModal({ type: 'notebook', item: nb })}>✎</button><button className="btn-icon" onClick={() => handleDeleteNotebook(nb.id)}>×</button></div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Logs */}
            {activeTab === 'logs' && (
                <div>
                    <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
                        <select value={logFilter.level} onChange={e => setLogFilter({...logFilter, level: e.target.value})}>
                            <option value="">All levels</option><option>info</option><option>warn</option><option>error</option>
                        </select>
                        <input placeholder="Module" value={logFilter.module} onChange={e => setLogFilter({...logFilter, module: e.target.value})} />
                    </div>
                    <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
                        <table style={{ width: '100%', fontSize: 12 }}>
                            <thead><tr><th>Time</th><th>Level</th><th>Module</th><th>Message</th></tr></thead>
                            <tbody>
                                {logs.logs.map(l => (
                                    <tr key={l.id}>
                                        <td>{new Date(l.created_at).toLocaleString()}</td>
                                        <td style={{ color: l.level === 'error' ? '#ef4444' : l.level === 'warn' ? '#f59e0b' : '#10b981' }}>{l.level}</td>
                                        <td>{l.module}</td>
                                        <td>{l.message}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Export */}
            {activeTab === 'export' && (
                <div className="card">
                    <button className="btn btn-primary" onClick={exportData}>Download all data as JSON</button>
                    <p className="text-muted" style={{ marginTop: 12, fontSize: 12 }}>Export includes all accounts, transactions, goals, habits, notes, journal, time entries, and wellness data.</p>
                </div>
            )}

            {renderModal()}
        </div>
    );
}