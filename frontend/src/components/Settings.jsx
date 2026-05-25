import { useState, useEffect, useRef } from 'react';
import { get, post, patch, del } from '../utils/api';

// Comprehensive emoji list
const EMOJI_LIST = [
    '💰', '💵', '💷', '💶', '💳', '🏦', '📈', '📉', 'piggy-bank', 'landmark', 'repeat', 'plus', 'salary',
    '🛒', '🛍️', 'shopping-cart', 'utensils', '🍔', '🍕', '🥗', '🍎', '🥛', '🍺', '☕', '🧃',
    '👕', '👖', '👗', '👔', '👟', '👠', '🧥', '🧦', '🩳', '🩴',
    '🏠', '🔌', '💡', '🔧', '🔨', '🧹', '🧺', '🚿', '🛏️', '🪑', '📺', '❄️', '🔥', '💧',
    '🏥', '🩺', '💊', '🧪', '🩹', '🧘', '🏃', '🚴', '🏋️', '🥗', '🍎', '🥦', '🧃',
    '🚗', '🚕', '🚌', '🚲', '🛵', '⛽', '🚆', '✈️', '🚢', '🚁', '🛴',
    '💼', '💻', '🖥️', '📱', '📞', '✉️', '📎', '🗂️', '📊', '📅', '⏰', '🤝', '🎯',
    '🔄', '📺', '🎬', '🎵', '📰', '📚', '📖', '🎮', '🧾', '📝', '🔁',
    '❓', '❗', '🔹', '🔸', '📌', '⭐', '❤️', '✨', '⚙️', '🔒', '🔓', '✅', '❌',
    '😀', '😎', '🤔', '😢', '😡', '😍', '🥳', '😴', '💪', '🧠', '👤', '👥', '👶', '🧓',
    '🌱', '🌲', '🌳', '🍃', '🌺', '🌞', '🌙', '☀️', '🌈', '⛅',
    '🎨', '🎭', '🎤', '🎧', '🎸', '🏀', '⚽', '🎾', '🏈', '🏐', '🎲', '🧩', '🎮',
];

const textToEmoji = {
    'piggy-bank': '🐷', 'landmark': '🏛️', 'repeat': '🔄', 'plus': '➕', 'salary': '💼',
    'shopping-cart': '🛒', 'utensils': '🍽️', 'shirt': '👕', 'stethoscope': '🩺',
    'more-horizontal': '⋯', 'scissors': '✂️', 'car': '🚗', 'zap': '⚡',
    'laptop': '💻', 'other-income': '➕',
};

function getEmojiDisplay(icon) {
    if (!icon) return '📌';
    if (/[\u{1F300}-\u{1F6FF}]/u.test(icon)) return icon;
    const lower = icon.toLowerCase();
    if (textToEmoji[lower]) return textToEmoji[lower];
    return icon;
}

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
    const [modalForm, setModalForm] = useState({ name: '', colour: '#6366f1', icon: '' });
    const [showEmojiPicker, setShowEmojiPicker] = useState(false);
    const pickerRef = useRef(null);

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

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (pickerRef.current && !pickerRef.current.contains(event.target)) {
                setShowEmojiPicker(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

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

    // Fixed export function using fetch with token
    const exportData = async () => {
        const token = localStorage.getItem('nucleus_token');
        if (!token) {
            alert('Not authenticated');
            return;
        }
        try {
            const response = await fetch('/api/settings/export', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!response.ok) throw new Error('Export failed');
            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `nucleus_export_${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (err) {
            alert(err.message);
        }
    };

    const openModal = (type, item = null) => {
        if (item) {
            setModalForm({ name: item.name, colour: item.colour || '#6366f1', icon: item.icon || '' });
            setModal({ type, item });
        } else {
            let defaultIcon = '';
            if (type === 'lifearea') defaultIcon = '📌';
            if (type === 'category') defaultIcon = '📂';
            if (type === 'notebook') defaultIcon = '📓';
            setModalForm({ name: '', colour: '#6366f1', icon: defaultIcon });
            setModal({ type, item: null });
        }
        setShowEmojiPicker(false);
    };

    const closeModal = () => {
        setModal(null);
        setModalForm({ name: '', colour: '#6366f1', icon: '' });
        setShowEmojiPicker(false);
    };

    const handleModalSave = async () => {
        if (!modal) return;
        const { type, item } = modal;
        const data = { ...modalForm };
        if (!data.name) return alert('Name is required');
        if (type === 'lifearea') {
            if (item) {
                await patch(`/settings/life-areas/${item.id}`, data);
                loadLifeAreas();
            } else {
                await post('/settings/life-areas', data);
                loadLifeAreas();
            }
        } else if (type === 'category') {
            if (item) {
                await patch(`/settings/categories/${item.id}`, data);
                loadCategories();
            } else {
                const categoryData = { ...data, type: modalForm.type || 'expense' };
                await post('/settings/categories', categoryData);
                loadCategories();
            }
        } else if (type === 'notebook') {
            if (item) {
                await patch(`/settings/notebooks/${item.id}`, data);
                loadNotebooks();
            } else {
                await post('/settings/notebooks', data);
                loadNotebooks();
            }
        }
        closeModal();
    };

    const renderModal = () => {
        if (!modal) return null;
        const { type, item } = modal;
        const isEdit = !!item;
        const title = isEdit ? `Edit ${type}` : `Add ${type}`;
        return (
            <div className="modal-overlay" onClick={closeModal}>
                <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 500 }}>
                    <div className="modal-title">{title}</div>
                    <div className="form-group">
                        <label>Name</label>
                        <input value={modalForm.name} onChange={e => setModalForm({ ...modalForm, name: e.target.value })} />
                    </div>
                    {type === 'category' && !isEdit && (
                        <div className="form-group">
                            <label>Type</label>
                            <select value={modalForm.type || 'expense'} onChange={e => setModalForm({ ...modalForm, type: e.target.value })}>
                                <option value="expense">Expense</option>
                                <option value="income">Income</option>
                            </select>
                        </div>
                    )}
                    <div className="form-group">
                        <label>Colour</label>
                        <input type="color" value={modalForm.colour} onChange={e => setModalForm({ ...modalForm, colour: e.target.value })} />
                    </div>
                    <div className="form-group">
                        <label>Icon</label>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                            <div style={{ fontSize: 32, width: 60, textAlign: 'center', background: 'var(--bg-secondary)', borderRadius: 8, padding: '4px' }}>
                                {getEmojiDisplay(modalForm.icon)}
                            </div>
                            <button type="button" className="btn btn-ghost" onClick={() => setShowEmojiPicker(!showEmojiPicker)} style={{ fontSize: 20 }}>
                                😀 Pick Emoji
                            </button>
                            <input
                                placeholder="or type any text"
                                value={modalForm.icon}
                                onChange={e => setModalForm({ ...modalForm, icon: e.target.value })}
                                style={{ flex: 1, minWidth: 120 }}
                            />
                        </div>
                        {showEmojiPicker && (
                            <div ref={pickerRef} style={{
                                position: 'absolute',
                                zIndex: 1001,
                                background: 'var(--bg-card)',
                                border: '1px solid var(--border)',
                                borderRadius: 12,
                                padding: 12,
                                marginTop: 8,
                                width: 340,
                                maxHeight: 280,
                                overflowY: 'auto',
                                display: 'grid',
                                gridTemplateColumns: 'repeat(8, 1fr)',
                                gap: 8,
                                boxShadow: '0 8px 20px rgba(0,0,0,0.2)'
                            }}>
                                {EMOJI_LIST.map(emoji => (
                                    <button
                                        key={emoji}
                                        className="btn-icon"
                                        onClick={() => {
                                            setModalForm({ ...modalForm, icon: emoji });
                                            setShowEmojiPicker(false);
                                        }}
                                        style={{ fontSize: 26, padding: 6, cursor: 'pointer' }}
                                        title={emoji}
                                    >
                                        {getEmojiDisplay(emoji)}
                                    </button>
                                ))}
                            </div>
                        )}
                        <small style={{ fontSize: 11, color: 'var(--text-muted)' }}>Click an emoji to use it, or type your own.</small>
                    </div>
                    <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
                        <button className="btn btn-ghost" onClick={closeModal}>Cancel</button>
                        <button className="btn btn-primary" onClick={handleModalSave}>Save</button>
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
                    <div className="form-group"><label>Currency</label><select value={prefs.currency} onChange={e => updatePref('currency', e.target.value)}><option>GBP</option><option>USD</option><option>EUR</option><option>JPY</option><option>CAD</option><option>AUD</option></select></div>
                    <div className="form-group"><label>First day of week</label><select value={prefs.first_day_of_week} onChange={e => updatePref('first_day_of_week', e.target.value)}><option value="0">Sunday</option><option value="1">Monday</option></select></div>
                    <div className="form-group"><label>Date format</label><select value={prefs.date_format} onChange={e => updatePref('date_format', e.target.value)}><option>en-GB</option><option>en-US</option></select></div>
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
                <div><button className="btn btn-primary btn-sm" onClick={() => openModal('lifearea')}>+ Add Life Area</button>
                <div className="grid" style={{ marginTop: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px,1fr))', gap: 12 }}>
                    {lifeAreas.map(la => (<div key={la.id} className="card" style={{ padding: 12, borderLeft: `4px solid ${la.colour}` }}><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><span><span style={{ fontSize: 20 }}>{getEmojiDisplay(la.icon)}</span> <strong>{la.name}</strong></span><div><button className="btn-icon" onClick={() => openModal('lifearea', la)}>✎</button><button className="btn-icon" onClick={async () => { if(confirm('Delete?')) { await del(`/settings/life-areas/${la.id}`); loadLifeAreas(); } }}>×</button></div></div>{!la.user_managed && <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>system</span>}</div>))}
                </div></div>
            )}

            {/* Categories */}
            {activeTab === 'categories' && (
                <div><button className="btn btn-primary btn-sm" onClick={() => openModal('category')}>+ Add Category</button>
                <div style={{ marginTop: 16 }}><h3>Expense</h3><div className="grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px,1fr))', gap: 12 }}>
                    {categories.filter(c => c.type === 'expense').map(cat => (<div key={cat.id} className="card" style={{ padding: 8, borderLeft: `4px solid ${cat.colour}` }}><div style={{ display: 'flex', justifyContent: 'space-between' }}><span><span style={{ fontSize: 16 }}>{getEmojiDisplay(cat.icon)}</span> {cat.name}</span><div><button className="btn-icon" onClick={() => openModal('category', cat)}>✎</button><button className="btn-icon" onClick={async () => { if(confirm('Delete?')) { await del(`/settings/categories/${cat.id}`); loadCategories(); } }}>×</button></div></div></div>))}
                </div><h3 style={{ marginTop: 20 }}>Income</h3><div className="grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px,1fr))', gap: 12 }}>
                    {categories.filter(c => c.type === 'income').map(cat => (<div key={cat.id} className="card" style={{ padding: 8, borderLeft: `4px solid ${cat.colour}` }}><div style={{ display: 'flex', justifyContent: 'space-between' }}><span><span style={{ fontSize: 16 }}>{getEmojiDisplay(cat.icon)}</span> {cat.name}</span><div><button className="btn-icon" onClick={() => openModal('category', cat)}>✎</button><button className="btn-icon" onClick={async () => { if(confirm('Delete?')) { await del(`/settings/categories/${cat.id}`); loadCategories(); } }}>×</button></div></div></div>))}
                </div></div></div>
            )}

            {/* Notebooks */}
            {activeTab === 'notebooks' && (
                <div><button className="btn btn-primary btn-sm" onClick={() => openModal('notebook')}>+ Add Notebook</button>
                <div className="grid" style={{ marginTop: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px,1fr))', gap: 12 }}>
                    {notebooks.map(nb => (<div key={nb.id} className="card" style={{ padding: 8, borderLeft: `4px solid ${nb.colour}` }}><div style={{ display: 'flex', justifyContent: 'space-between' }}><span><span style={{ fontSize: 16 }}>{getEmojiDisplay(nb.icon)}</span> {nb.name}</span><div><button className="btn-icon" onClick={() => openModal('notebook', nb)}>✎</button><button className="btn-icon" onClick={async () => { if(confirm('Delete?')) { await del(`/settings/notebooks/${nb.id}`); loadNotebooks(); } }}>×</button></div></div></div>))}
                </div></div>
            )}

            {/* Logs */}
            {activeTab === 'logs' && (
                <div><div style={{ display: 'flex', gap: 12, marginBottom: 16 }}><select value={logFilter.level} onChange={e => setLogFilter({...logFilter, level: e.target.value})}><option value="">All levels</option><option>info</option><option>warn</option><option>error</option></select><input placeholder="Module" value={logFilter.module} onChange={e => setLogFilter({...logFilter, module: e.target.value})} /></div>
                <div className="card" style={{ padding: 0, overflowX: 'auto' }}><table style={{ width: '100%', fontSize: 12 }}><thead><tr><th>Time</th><th>Level</th><th>Module</th><th>Message</th></tr></thead><tbody>{logs.logs.map(l => (<tr key={l.id}><td>{new Date(l.created_at).toLocaleString()}</td><td style={{ color: l.level === 'error' ? '#ef4444' : l.level === 'warn' ? '#f59e0b' : '#10b981' }}>{l.level}</td><td>{l.module}</td><td>{l.message}</td></tr>))}</tbody></table></div></div>
            )}

            {/* Export */}
            {activeTab === 'export' && (
                <div className="card"><button className="btn btn-primary" onClick={exportData}>Download all data as JSON</button><p className="text-muted" style={{ marginTop: 12, fontSize: 12 }}>Export includes all accounts, transactions, goals, habits, notes, journal, time entries, and wellness data.</p></div>
            )}

            {renderModal()}
        </div>
    );
}