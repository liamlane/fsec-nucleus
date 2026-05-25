import { useState, useEffect, useRef } from 'react';
import { get, post, patch, del } from '../../utils/api.js';

export default function Notes() {
  const [notebooks, setNotebooks]       = useState([]);
  const [notes, setNotes]               = useState([]);
  const [selected, setSelected]         = useState(null);
  const [editNote, setEditNote]         = useState(null);
  const [filterNotebook, setFilterNotebook] = useState('');
  const [search, setSearch]             = useState('');
  const [modal, setModal]               = useState(null);
  const [form, setForm]                 = useState({});
  const [mobilePanel, setMobilePanel]   = useState('list'); // 'list' | 'editor'
  const saveTimeout = useRef(null);

  const load = async () => {
    const [nb, n] = await Promise.allSettled([get('/notebooks'), get('/notes')]);
    if (nb.value) setNotebooks(nb.value);
    if (n.value) {
      setNotes(n.value);
      if (!selected && n.value.length > 0) setSelected(n.value[0]);
    }
  };

  useEffect(() => { load(); }, []);

  const filtered = notes.filter(n => {
    if (filterNotebook && n.notebook_id !== filterNotebook) return false;
    if (search && !n.title.toLowerCase().includes(search.toLowerCase()) &&
        !n.content?.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const handleSelect = async (note) => {
    const full = await get(`/notes/${note.id}`);
    setSelected(full);
    setEditNote(full);
    setMobilePanel('editor'); // switch to editor on mobile
  };

  const handleContentChange = (field, val) => {
    setEditNote(prev => ({ ...prev, [field]: val }));
    clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(async () => {
      await patch(`/notes/${editNote.id}`, { [field]: val });
      setNotes(prev => prev.map(n => n.id === editNote.id ? { ...n, [field]: val } : n));
    }, 800);
  };

  const handleNew = async () => {
    const n = await post('/notes', { title: 'Untitled Note', notebook_id: filterNotebook || null });
    setNotes(prev => [n, ...prev]);
    setSelected(n);
    setEditNote(n);
    setMobilePanel('editor');
  };

  const handleDelete = async (id) => {
    if (confirm('Delete note?')) {
      await del(`/notes/${id}`);
      setNotes(prev => prev.filter(n => n.id !== id));
      if (selected?.id === id) {
        setSelected(null);
        setEditNote(null);
        setMobilePanel('list');
      }
    }
  };

  const handlePin = async (note) => {
    await patch(`/notes/${note.id}`, { pinned: !note.pinned });
    setNotes(prev => prev.map(n => n.id === note.id ? { ...n, pinned: !n.pinned } : n));
  };

  const handleBack = () => setMobilePanel('list');

  return (
    <div className="notes-shell page animate-fade">

      {/* ── Sidebar: notebooks + note list ───────────────────────────────── */}
      <div className={`notes-sidebar${mobilePanel === 'editor' ? ' mobile-hidden' : ''}`}>

        {/* Toolbar */}
        <div style={{ padding: '16px 16px 12px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h2 style={{ fontWeight: 700, fontSize: 16 }}>Notes</h2>
            <button className="btn btn-primary btn-sm" onClick={handleNew}>+ New</button>
          </div>
          <input placeholder="Search notes..." value={search} onChange={e => setSearch(e.target.value)} style={{ fontSize: 13 }} />
        </div>

        {/* Notebooks */}
        <div style={{ padding: '10px 8px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', padding: '0 8px' }}>
              Notebooks
            </span>
            <button className="btn-icon" style={{ fontSize: 16, padding: '2px 6px' }} onClick={() => setModal('nb')}>+</button>
          </div>
          <button onClick={() => setFilterNotebook('')} style={{
            display: 'block', width: '100%', padding: '6px 12px', borderRadius: 6,
            textAlign: 'left', fontSize: 13,
            background: !filterNotebook ? 'var(--accent-dim)' : 'transparent',
            color: !filterNotebook ? 'var(--accent)' : 'var(--text-secondary)',
          }}>
            All Notes ({notes.length})
          </button>
          {notebooks.map(nb => (
            <button key={nb.id} onClick={() => setFilterNotebook(filterNotebook === nb.id ? '' : nb.id)} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              width: '100%', padding: '6px 12px', borderRadius: 6, textAlign: 'left', fontSize: 13,
              background: filterNotebook === nb.id ? nb.colour + '20' : 'transparent',
              color: filterNotebook === nb.id ? nb.colour : 'var(--text-secondary)',
            }}>
              <span>📒 {nb.name}</span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{nb.note_count}</span>
            </button>
          ))}
        </div>

        {/* Note list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
          {filtered.filter(n => n.pinned).length > 0 && (
            <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', padding: '4px 8px 6px' }}>
              Pinned
            </div>
          )}
          {filtered.sort((a, b) => b.pinned - a.pinned).map(note => (
            <div key={note.id} onClick={() => handleSelect(note)} style={{
              padding: '10px 12px', borderRadius: 8, marginBottom: 2, cursor: 'pointer',
              background: selected?.id === note.id ? 'var(--bg-hover)' : 'transparent',
              border: `1px solid ${selected?.id === note.id ? 'var(--border-active)' : 'transparent'}`,
              transition: 'var(--transition)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <span style={{ fontSize: 13, fontWeight: 500, flex: 1 }} className="truncate">
                  {note.title || 'Untitled'}
                </span>
                {note.pinned && <span style={{ fontSize: 10, color: 'var(--amber)', flexShrink: 0 }}>📌</span>}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }} className="truncate">
                {note.content?.replace(/<[^>]*>/g, '').slice(0, 60) || 'No content'}
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
                {new Date(note.updated_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)', fontSize: 13 }}>No notes</div>
          )}
        </div>
      </div>

      {/* ── Editor ───────────────────────────────────────────────────────── */}
      <div className={`notes-editor${mobilePanel === 'list' ? ' mobile-hidden' : ''}`}>
        {editNote ? (
          <>
            {/* Editor toolbar */}
            <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              {/* Back button — mobile only (CSS could hide on desktop but it's subtle enough) */}
              <button
                onClick={handleBack}
                className="btn-icon"
                style={{ fontSize: 18, display: mobilePanel === 'editor' ? 'flex' : 'none', flexShrink: 0 }}
                aria-label="Back to notes list"
              >
                ‹
              </button>
              <input
                value={editNote.title || ''}
                onChange={e => handleContentChange('title', e.target.value)}
                style={{ fontSize: 18, fontWeight: 700, background: 'transparent', border: 'none', padding: 0, flex: 1 }}
                placeholder="Note title..."
              />
              <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                <button
                  className="btn-icon"
                  onClick={() => handlePin(editNote)}
                  title="Pin"
                  style={{ fontSize: 16, color: editNote.pinned ? 'var(--amber)' : 'var(--text-muted)' }}
                >
                  📌
                </button>
                <button className="btn btn-danger btn-sm" onClick={() => handleDelete(editNote.id)}>Delete</button>
              </div>
            </div>

            {/* Tags */}
            <div style={{ padding: '8px 20px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              {(editNote.tags || []).map(tag => (
                <span
                  key={tag}
                  className="badge"
                  style={{ background: 'var(--accent-dim)', color: 'var(--accent)', cursor: 'pointer' }}
                  onClick={() => handleContentChange('tags', editNote.tags.filter(t => t !== tag))}
                >
                  #{tag} ×
                </span>
              ))}
              <input
                placeholder="Add tag..."
                style={{ background: 'transparent', border: '1px dashed var(--border)', fontSize: 12, padding: '2px 8px', width: 100, minHeight: 'auto' }}
                onKeyDown={e => {
                  if (e.key === 'Enter' && e.target.value) {
                    handleContentChange('tags', [...(editNote.tags || []), e.target.value.trim()]);
                    e.target.value = '';
                  }
                }}
              />
            </div>

            {/* Content */}
            <textarea
              value={editNote.content || ''}
              onChange={e => handleContentChange('content', e.target.value)}
              style={{
                flex: 1, resize: 'none', background: 'transparent', border: 'none',
                padding: '20px', fontSize: 15, lineHeight: 1.8,
                color: 'var(--text-primary)', outline: 'none', fontFamily: 'var(--font)',
              }}
              placeholder="Start writing..."
            />

            {/* Footer */}
            <div style={{
              padding: '8px 20px', borderTop: '1px solid var(--border)',
              fontSize: 11, color: 'var(--text-muted)',
              display: 'flex', gap: 16, flexWrap: 'wrap',
            }}>
              <span>{(editNote.content || '').split(/\s+/).filter(Boolean).length} words</span>
              <span>{(editNote.content || '').length} chars</span>
              <span>Updated {new Date(editNote.updated_at).toLocaleString('en-GB')}</span>
            </div>
          </>
        ) : (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>≡</div>
              <p>Select a note or create a new one</p>
            </div>
          </div>
        )}
      </div>

      {/* ── New Notebook modal ────────────────────────────────────────────── */}
      {modal === 'nb' && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">New Notebook</div>
            <div className="form-group">
              <label className="form-label">Name</label>
              <input value={form.name || ''} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Notebook name" />
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => setModal(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={async () => {
                await post('/notebooks', form);
                setModal(null); setForm({}); load();
              }}>Create</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
