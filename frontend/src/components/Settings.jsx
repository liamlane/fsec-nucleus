import { useState, useEffect } from 'react';
import { get, post, patch, del } from '../utils/api';

export default function Settings() {
    const [activeTab, setActiveTab] = useState('prefs');
    const [prefs, setPrefs] = useState({});
    const [lifeAreas, setLifeAreas] = useState([]);
    const [categories, setCategories] = useState([]);
    const [notebooks, setNotebooks] = useState([]);
    const [logs, setLogs] = useState({ logs: [], total: 0 });
    const [logFilter, setLogFilter] = useState({ level: '', module: '' });
    const [pinForm, setPinForm] = useState({ current: '', new: '', confirm: '' });
    const [pinResult, setPinResult] = useState(null);
    const [modal, setModal] = useState(null);
    const [editItem, setEditItem] = useState(null);

    const load = async () => {
        const [p, la, cat, nb] = await Promise.allSettled([
            get('/settings/preferences'),
            get('/settings/life-areas'),
            get('/settings/categories'),
            get('/settings/notebooks'),
        ]);
        if (p.value) setPrefs(p.value);
        if (la.value) setLifeAreas(la.value);
        if (cat.value) setCategories(cat.value);
        if (nb.value) setNotebooks(nb.value);
    };
    useEffect(() => { load(); }, []);

    const loadLogs = async () => {
        const params = new URLSearchParams();
        if (logFilter.level) params.append('level', logFilter.level);
        if (logFilter.module) params.append('module', logFilter.module);
        const data = await get(`/settings/logs?${params.toString()}`);
        setLogs(data);
    };
    useEffect(() => { loadLogs(); }, [logFilter]);

    const updatePref = async (key, value) => {
        await patch('/settings/preferences', { [key]: value });
        setPrefs(prev => ({ ...prev, [key]: value }));
    };

    const changePin = async () => {
        if (pinForm.new !== pinForm.confirm) return alert('New PINs do not match');
        const res = await post('/settings/change-pin', { current_pin: pinForm.current, new_pin: pinForm.new });
        setPinResult(res);
        alert(`New hash: ${res.hash}\n${res.instruction}`);
    };

    const exportData = async () => {
        window.location.href = '/settings/export';
    };

    const renderReferenceTable = (items, onAdd, onEdit, onDelete, fields) => (
        <div>
            <button className="btn btn-primary btn-sm" onClick={() => setModal({ type: 'add', fields })}>+ Add</button>
            <table className="data-table" style={{ marginTop: 12, width: '100%' }}>
                <thead><tr>{fields.map(f => <th key={f.key}>{f.label}</th>)}<th>Actions</th></tr></thead>
                <tbody>
                    {items.map(item => (
                        <tr key={item.id}>
                            {fields.map(f => <td key={f.key}>{item[f.key]}</td>)}
                            <td>
                                <button className="btn-icon" onClick={() => onEdit(item)}>✎</button>
                                <button className="btn-icon" onClick={() => onDelete(item.id)}>×</button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );

    // Helper for modals (simplified – you'll expand)
    const handleAddLifeArea = async (data) => { await post('/settings/life-areas', data); load(); setModal(null); };
    const handleEditLifeArea = async (id, data) => { await patch(`/settings/life-areas/${id}`, data); load(); setModal(null); };
    const handleDeleteLifeArea = async (id) => { if (confirm('Delete?')) await del(`/settings/life-areas/${id}`); load(); };

    // Similar for categories and notebooks...

    return (
        <div className="page animate-fade">
            <div className="page-header"><h1 className="page-title">Settings</h1></div>

            <div style={{ display: 'flex', gap: 8, borderBottom: '1px solid var(--border)', marginBottom: 24 }}>
                {['prefs','security','lifeareas','categories','notebooks','logs','export'].map(tab => (
                    <button key={tab} onClick={() => setActiveTab(tab)} className={`btn-ghost`} style={{ padding: '8px 16px', borderBottom: activeTab === tab ? '2px solid var(--accent)' : 'none' }}>
                        {tab.charAt(0).toUpperCase() + tab.slice(1)}
                    </button>
                ))}
            </div>

            {activeTab === 'prefs' && (
                <div className="card" style={{ maxWidth: 500 }}>
                    <div className="form-group">
                        <label>Currency</label>
                        <select value={prefs.currency || 'GBP'} onChange={e => updatePref('currency', e.target.value)}>
                            <option>GBP</option><option>USD</option><option>EUR</option>
                        </select>
                    </div>
                    <div className="form-group">
                        <label>First day of week</label>
                        <select value={prefs.first_day_of_week || '1'} onChange={e => updatePref('first_day_of_week', e.target.value)}>
                            <option value="0">Sunday</option><option value="1">Monday</option>
                        </select>
                    </div>
                    <div className="form-group">
                        <label>Date format</label>
                        <select value={prefs.date_format || 'en-GB'} onChange={e => updatePref('date_format', e.target.value)}>
                            <option>en-GB</option><option>en-US</option>
                        </select>
                    </div>
                </div>
            )}

            {activeTab === 'security' && (
                <div className="card" style={{ maxWidth: 500 }}>
                    <div className="form-group"><label>Current PIN</label><input type="password" value={pinForm.current} onChange={e => setPinForm({...pinForm, current: e.target.value})} /></div>
                    <div className="form-group"><label>New PIN</label><input type="password" value={pinForm.new} onChange={e => setPinForm({...pinForm, new: e.target.value})} /></div>
                    <div className="form-group"><label>Confirm new PIN</label><input type="password" value={pinForm.confirm} onChange={e => setPinForm({...pinForm, confirm: e.target.value})} /></div>
                    <button className="btn btn-primary" onClick={changePin}>Change PIN</button>
                    {pinResult && <pre style={{ marginTop: 16, fontSize: 11, background: 'var(--bg-secondary)', padding: 12, borderRadius: 8 }}>{JSON.stringify(pinResult, null, 2)}</pre>}
                </div>
            )}

            {activeTab === 'lifeareas' && renderReferenceTable(lifeAreas, handleAddLifeArea, handleEditLifeArea, handleDeleteLifeArea, [
                { key: 'name', label: 'Name' }, { key: 'colour', label: 'Colour' }, { key: 'icon', label: 'Icon' }
            ])}

            {activeTab === 'logs' && (
                <div>
                    <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
                        <select value={logFilter.level} onChange={e => setLogFilter({...logFilter, level: e.target.value})}><option value="">All levels</option><option>info</option><option>warn</option><option>error</option></select>
                        <input placeholder="Module" value={logFilter.module} onChange={e => setLogFilter({...logFilter, module: e.target.value})} />
                    </div>
                    <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
                        <table style={{ width: '100%', fontSize: 12 }}>
                            <thead><tr><th>Time</th><th>Level</th><th>Module</th><th>Message</th></tr></thead>
                            <tbody>
                                {logs.logs.map(l => (
                                    <tr key={l.id}><td>{new Date(l.created_at).toLocaleString()}</td><td>{l.level}</td><td>{l.module}</td><td>{l.message}</td></tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {activeTab === 'export' && (
                <div className="card"><button className="btn btn-primary" onClick={exportData}>Download all data as JSON</button></div>
            )}
        </div>
    );
}