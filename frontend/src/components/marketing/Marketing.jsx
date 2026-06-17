import { useState, useEffect, useMemo } from 'react';
import { get, post, patch, del, fmt } from '../../utils/api.js';

const TABS = ['Pipeline', 'Calendar', 'Generator', 'Templates', 'Ideas', 'Campaigns'];

const PLATFORMS = {
  linkedin:  { label: 'LinkedIn',  colour: '#0a66c2', limit: 3000 },
  twitter:   { label: 'X / Twitter', colour: '#000000', limit: 280 },
  facebook:  { label: 'Facebook',  colour: '#1877f2', limit: 63000 },
  instagram: { label: 'Instagram', colour: '#e1306c', limit: 2200 },
  blog:      { label: 'Blog',      colour: '#6366f1', limit: 100000 },
  youtube:   { label: 'YouTube',   colour: '#ff0000', limit: 5000 },
  tiktok:    { label: 'TikTok',    colour: '#69c9d0', limit: 2200 },
  other:     { label: 'Other',     colour: '#6b7280', limit: 10000 },
};

const STATUSES = {
  idea:      { label: 'Idea',      colour: '#6b7280' },
  drafted:   { label: 'Drafted',   colour: '#4da6ff' },
  scheduled: { label: 'Scheduled', colour: '#f59e0b' },
  posted:    { label: 'Posted',    colour: '#10d98f' },
  archived:  { label: 'Archived',  colour: '#6b7280' },
};

const PRIORITY = { low: '#6b7280', medium: '#f59e0b', high: '#ff4d6d' };

// Pull {placeholders} out of a template string
const parseVars = (tpl) => {
  if (!tpl) return [];
  const set = new Set();
  for (const m of tpl.matchAll(/\{(\w+)\}/g)) set.add(m[1]);
  return [...set];
};

const fillTemplate = (tpl, vars) => {
  let out = tpl;
  for (const [k, v] of Object.entries(vars || {})) {
    out = out.split(`{${k}}`).join(v || `{${k}}`);
  }
  return out;
};

export default function Marketing() {
  const [tab, setTab]               = useState('Pipeline');
  const [posts, setPosts]           = useState([]);
  const [templates, setTemplates]   = useState([]);
  const [ideas, setIdeas]           = useState([]);
  const [campaigns, setCampaigns]   = useState([]);
  const [modal, setModal]           = useState(null);
  const [form, setForm]             = useState({});
  const [editing, setEditing]       = useState(null);

  // Generator state
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [genVars, setGenVars]                   = useState({});
  const [genPlatform, setGenPlatform]           = useState('linkedin');

  const loadPosts     = async () => { const d = await get('/marketing/posts');     if (d) setPosts(d); };
  const loadTemplates = async () => { const d = await get('/marketing/templates'); if (d) setTemplates(d); };
  const loadIdeas     = async () => { const d = await get('/marketing/ideas');     if (d) setIdeas(d); };
  const loadCampaigns = async () => { const d = await get('/marketing/campaigns'); if (d) setCampaigns(d); };

  useEffect(() => { loadPosts(); loadTemplates(); loadCampaigns(); }, []);
  useEffect(() => { if (tab === 'Ideas') loadIdeas(); }, [tab]);

  // ── Pipeline groupings ─────────────────────────────────────────────────
  const pipeline = useMemo(() => {
    const groups = { idea: [], drafted: [], scheduled: [], posted: [] };
    for (const p of posts) {
      if (groups[p.status]) groups[p.status].push(p);
    }
    return groups;
  }, [posts]);

  const movePost = async (id, newStatus) => {
    await patch(`/marketing/posts/${id}`, { status: newStatus });
    loadPosts();
  };

  const deletePost = async (id) => {
    if (!confirm('Delete this post?')) return;
    await del(`/marketing/posts/${id}`);
    loadPosts();
  };

  const savePost = async () => {
    if (editing) {
      await patch(`/marketing/posts/${editing.id}`, form);
    } else {
      await post('/marketing/posts', form);
    }
    setModal(null); setForm({}); setEditing(null);
    loadPosts();
  };

  const openEditPost = (p) => {
    setEditing(p); setForm({ ...p }); setModal('post');
  };

  // ── Generator ───────────────────────────────────────────────────────────
  const genPreview = useMemo(() => {
    if (!selectedTemplate) return '';
    return fillTemplate(selectedTemplate.template, genVars);
  }, [selectedTemplate, genVars]);

  const genUnfilled = useMemo(() => {
    if (!selectedTemplate) return [];
    return parseVars(selectedTemplate.template).filter(v => !genVars[v]);
  }, [selectedTemplate, genVars]);

  const saveGenerated = async (status) => {
    if (!selectedTemplate || !genPreview.trim()) return;
    await post('/marketing/posts', {
      platform: genPlatform,
      content:  genPreview,
      status:   status,
      scheduled_for: status === 'scheduled' ? form.scheduled_for : null,
    });
    setSelectedTemplate(null); setGenVars({});
    alert('Post saved as ' + STATUSES[status].label.toLowerCase());
    loadPosts();
  };

  // ── Template handlers ───────────────────────────────────────────────────
  const saveTemplate = async () => {
    if (editing) {
      await patch(`/marketing/templates/${editing.id}`, form);
    } else {
      await post('/marketing/templates', form);
    }
    setModal(null); setForm({}); setEditing(null);
    loadTemplates();
  };

  // ── Idea handlers ───────────────────────────────────────────────────────
  const saveIdea = async () => {
    if (editing) {
      await patch(`/marketing/ideas/${editing.id}`, form);
    } else {
      await post('/marketing/ideas', form);
    }
    setModal(null); setForm({}); setEditing(null);
    loadIdeas();
  };

  const toggleIdeaUsed = async (idea) => {
    await patch(`/marketing/ideas/${idea.id}`, { used: !idea.used });
    loadIdeas();
  };

  // ── Campaign handlers ───────────────────────────────────────────────────
  const saveCampaign = async () => {
    if (editing) {
      await patch(`/marketing/campaigns/${editing.id}`, form);
    } else {
      await post('/marketing/campaigns', form);
    }
    setModal(null); setForm({}); setEditing(null);
    loadCampaigns();
  };

  // ── Calendar view (next 30 days) ───────────────────────────────────────
  const calendarPosts = useMemo(() => {
    const today = new Date(); today.setHours(0,0,0,0);
    const cutoff = new Date(Date.now() + 30 * 86400000);
    return posts
      .filter(p => {
        const d = p.scheduled_for || p.posted_at;
        if (!d) return false;
        const dt = new Date(d);
        return dt >= today && dt <= cutoff;
      })
      .sort((a, b) => new Date(a.scheduled_for || a.posted_at) - new Date(b.scheduled_for || b.posted_at));
  }, [posts]);

  return (
    <div className="page animate-fade">
      <div className="page-header">
        <div>
          <h1 className="page-title">Marketing</h1>
          <p className="page-subtitle">Plan · generate · track social content</p>
        </div>
        {tab === 'Pipeline'  && <button className="btn btn-primary" onClick={() => { setForm({ platform: 'linkedin', status: 'idea' }); setEditing(null); setModal('post'); }}>+ Post</button>}
        {tab === 'Calendar'  && <button className="btn btn-primary" onClick={() => { setForm({ platform: 'linkedin', status: 'scheduled' }); setEditing(null); setModal('post'); }}>+ Schedule</button>}
        {tab === 'Templates' && <button className="btn btn-primary" onClick={() => { setForm({ platforms: ['linkedin'] }); setEditing(null); setModal('template'); }}>+ Template</button>}
        {tab === 'Ideas'     && <button className="btn btn-primary" onClick={() => { setForm({ priority: 'medium' }); setEditing(null); setModal('idea'); }}>+ Idea</button>}
        {tab === 'Campaigns' && <button className="btn btn-primary" onClick={() => { setForm({ status: 'planning' }); setEditing(null); setModal('campaign'); }}>+ Campaign</button>}
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

      {/* PIPELINE — Kanban by status */}
      {tab === 'Pipeline' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, overflowX: 'auto' }}>
          {['idea','drafted','scheduled','posted'].map(s => {
            const st = STATUSES[s];
            return (
              <div key={s} style={{ minWidth: 220 }}>
                <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', color: st.colour, marginBottom: 8, letterSpacing: '0.05em' }}>
                  {st.label} ({pipeline[s].length})
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {pipeline[s].map(p => {
                    const platform = PLATFORMS[p.platform] || PLATFORMS.other;
                    return (
                      <div key={p.id} className="card" style={{ padding: 10, borderLeft: `3px solid ${platform.colour}` }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                          <span className="badge" style={{ background: platform.colour + '25', color: platform.colour, fontSize: 9 }}>{platform.label}</span>
                          <button className="btn-icon btn-sm" onClick={() => deletePost(p.id)} style={{ fontSize: 11 }}>×</button>
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-primary)', whiteSpace: 'pre-wrap', maxHeight: 80, overflow: 'hidden' }}>
                          {p.content.slice(0, 140)}{p.content.length > 140 ? '…' : ''}
                        </div>
                        {p.scheduled_for && <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>📅 {fmt.dateShort(p.scheduled_for)}</div>}
                        <div style={{ display: 'flex', gap: 4, marginTop: 8, flexWrap: 'wrap' }}>
                          <button className="btn btn-ghost btn-sm" style={{ fontSize: 10 }} onClick={() => openEditPost(p)}>Edit</button>
                          {s === 'idea'      && <button className="btn btn-ghost btn-sm" style={{ fontSize: 10 }} onClick={() => movePost(p.id, 'drafted')}>→ Draft</button>}
                          {s === 'drafted'   && <button className="btn btn-ghost btn-sm" style={{ fontSize: 10 }} onClick={() => movePost(p.id, 'scheduled')}>→ Schedule</button>}
                          {s === 'scheduled' && <button className="btn btn-ghost btn-sm" style={{ fontSize: 10 }} onClick={() => movePost(p.id, 'posted')}>→ Posted</button>}
                        </div>
                      </div>
                    );
                  })}
                  {pipeline[s].length === 0 && <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: 16 }}>Empty</div>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* CALENDAR */}
      {tab === 'Calendar' && (
        <div className="card" style={{ padding: 0 }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontSize: 13, color: 'var(--text-muted)' }}>
            Next 30 days · {calendarPosts.length} post{calendarPosts.length === 1 ? '' : 's'}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {calendarPosts.map(p => {
              const platform = PLATFORMS[p.platform] || PLATFORMS.other;
              const status   = STATUSES[p.status]   || STATUSES.scheduled;
              return (
                <div key={p.id} style={{ display: 'flex', gap: 14, padding: 14, borderBottom: '1px solid var(--border)', alignItems: 'flex-start' }}>
                  <div style={{ minWidth: 90, fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                    {fmt.dateShort(p.scheduled_for || p.posted_at)}
                    <div style={{ fontSize: 10 }}>{new Date(p.scheduled_for || p.posted_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</div>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                      <span className="badge" style={{ background: platform.colour + '25', color: platform.colour, fontSize: 10 }}>{platform.label}</span>
                      <span className="badge" style={{ background: status.colour + '25', color: status.colour, fontSize: 10 }}>{status.label}</span>
                    </div>
                    <div style={{ fontSize: 13, whiteSpace: 'pre-wrap', color: 'var(--text-secondary)' }}>{p.content.slice(0, 200)}{p.content.length > 200 ? '…' : ''}</div>
                  </div>
                  <button className="btn btn-ghost btn-sm" onClick={() => openEditPost(p)}>Edit</button>
                </div>
              );
            })}
            {calendarPosts.length === 0 && <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Nothing scheduled in the next 30 days</div>}
          </div>
        </div>
      )}

      {/* GENERATOR */}
      {tab === 'Generator' && (
        <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 20 }}>
          <div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>Pick template</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {templates.map(t => (
                <button key={t.id} onClick={() => { setSelectedTemplate(t); setGenVars({}); }} className="card" style={{
                  textAlign: 'left', padding: 12, cursor: 'pointer',
                  border: selectedTemplate?.id === t.id ? '1px solid var(--accent)' : '1px solid var(--border)',
                  background: selectedTemplate?.id === t.id ? 'var(--bg-card)' : 'var(--bg-card)',
                }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{t.name}</div>
                  {t.category && <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'capitalize' }}>{t.category.replace('_', ' ')}</div>}
                </button>
              ))}
              {templates.length === 0 && <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: 16, textAlign: 'center' }}>No templates yet</div>}
            </div>
          </div>

          <div>
            {selectedTemplate ? (
              <>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>Fill in variables</div>
                <div className="card" style={{ marginBottom: 16 }}>
                  {parseVars(selectedTemplate.template).map(v => (
                    <div key={v} className="form-group">
                      <label className="form-label" style={{ textTransform: 'capitalize' }}>{v.replace(/_/g, ' ')}</label>
                      <input
                        value={genVars[v] || ''}
                        onChange={e => setGenVars({ ...genVars, [v]: e.target.value })}
                        placeholder={`{${v}}`}
                      />
                    </div>
                  ))}
                  {parseVars(selectedTemplate.template).length === 0 && (
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>This template has no variables — it's ready as-is.</div>
                  )}
                </div>

                <div style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>Preview</div>
                <div className="card" style={{ marginBottom: 16 }}>
                  <div style={{ marginBottom: 12 }}>
                    <label className="form-label">Platform</label>
                    <select value={genPlatform} onChange={e => setGenPlatform(e.target.value)} style={{ maxWidth: 240 }}>
                      {Object.entries(PLATFORMS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select>
                  </div>
                  <div style={{
                    background: 'var(--bg-tertiary)',
                    padding: 14,
                    borderRadius: 'var(--radius-sm)',
                    whiteSpace: 'pre-wrap',
                    fontFamily: 'var(--font-mono)',
                    fontSize: 13,
                    minHeight: 100,
                  }}>
                    {genPreview || <span style={{ color: 'var(--text-muted)' }}>Fill in the variables above to see preview…</span>}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, fontSize: 11 }}>
                    <span style={{ color: genPreview.length > PLATFORMS[genPlatform].limit ? 'var(--red)' : 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                      {genPreview.length} / {PLATFORMS[genPlatform].limit} chars
                    </span>
                    {genUnfilled.length > 0 && <span style={{ color: 'var(--amber)' }}>⚠ {genUnfilled.length} placeholder{genUnfilled.length === 1 ? '' : 's'} unfilled</span>}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 10 }}>
                  <button className="btn btn-ghost" onClick={() => { setSelectedTemplate(null); setGenVars({}); }}>Cancel</button>
                  <button className="btn btn-ghost" onClick={() => saveGenerated('idea')} disabled={!genPreview}>Save as idea</button>
                  <button className="btn btn-primary" onClick={() => saveGenerated('drafted')} disabled={!genPreview}>Save as draft</button>
                </div>
              </>
            ) : (
              <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>✦</div>
                <p>Pick a template on the left to start.</p>
                <p style={{ fontSize: 12, marginTop: 8 }}>Templates use <code style={{ background: 'var(--bg-tertiary)', padding: '2px 6px', borderRadius: 3 }}>{`{variable}`}</code> placeholders.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TEMPLATES */}
      {tab === 'Templates' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 12 }}>
          {templates.map(t => (
            <div key={t.id} className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <div>
                  <div style={{ fontWeight: 600 }}>{t.name}</div>
                  {t.category && <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'capitalize' }}>{t.category.replace(/_/g, ' ')}{t.is_seeded && ' · default'}</div>}
                </div>
                <div>
                  <button className="btn-icon btn-sm" onClick={() => { setEditing(t); setForm({ ...t }); setModal('template'); }}>✎</button>
                  {!t.is_seeded && <button className="btn-icon btn-sm" onClick={async () => { if (window.confirm('Delete template?')) { await del(`/marketing/templates/${t.id}`); loadTemplates(); } }}>×</button>}
                </div>
              </div>
              <pre style={{ fontSize: 11, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', background: 'var(--bg-tertiary)', padding: 8, borderRadius: 4, maxHeight: 120, overflow: 'hidden' }}>{t.template}</pre>
              <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-muted)' }}>
                Variables: {parseVars(t.template).join(', ') || 'none'}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* IDEAS */}
      {tab === 'Ideas' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {ideas.map(i => (
            <div key={i.id} className="card" style={{
              padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12,
              borderLeft: `4px solid ${PRIORITY[i.priority] || PRIORITY.medium}`,
              opacity: i.used ? 0.55 : 1,
            }}>
              <button onClick={() => toggleIdeaUsed(i)} style={{
                width: 22, height: 22, borderRadius: 5,
                border: `2px solid ${i.used ? 'var(--green)' : 'var(--border)'}`,
                background: i.used ? 'var(--green)' : 'transparent',
                color: 'white', fontSize: 12, flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>{i.used ? '✓' : ''}</button>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 500, textDecoration: i.used ? 'line-through' : 'none' }}>{i.title}</div>
                {i.notes && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{i.notes}</div>}
              </div>
              <span style={{ fontSize: 10, color: PRIORITY[i.priority] || PRIORITY.medium, textTransform: 'uppercase' }}>{i.priority}</span>
              <button className="btn-icon btn-sm" onClick={async () => { if (window.confirm('Delete idea?')) { await del(`/marketing/ideas/${i.id}`); loadIdeas(); } }}>×</button>
            </div>
          ))}
          {ideas.length === 0 && <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>No content ideas yet</div>}
        </div>
      )}

      {/* CAMPAIGNS */}
      {tab === 'Campaigns' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
          {campaigns.map(c => (
            <div key={c.id} className="card" style={{ borderLeft: `4px solid ${c.colour}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <div style={{ fontWeight: 600 }}>{c.name}</div>
                <button className="btn-icon btn-sm" onClick={async () => { if (window.confirm('Delete campaign?')) { await del(`/marketing/campaigns/${c.id}`); loadCampaigns(); } }}>×</button>
              </div>
              {c.goal && <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}><strong>Goal:</strong> {c.goal}</div>}
              {c.description && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>{c.description}</div>}
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
                {c.posted_count}/{c.post_count} posted · <span style={{ textTransform: 'capitalize' }}>{c.status}</span>
              </div>
            </div>
          ))}
          {campaigns.length === 0 && <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>No campaigns yet</div>}
        </div>
      )}

      {/* POST MODAL */}
      {modal === 'post' && (
        <div className="modal-overlay" onClick={() => { setModal(null); setEditing(null); }}>
          <div className="modal" style={{ maxWidth: 600 }} onClick={e => e.stopPropagation()}>
            <div className="modal-title">{editing ? 'Edit post' : 'New post'}</div>
            <div className="form-row">
              <div className="form-group"><label className="form-label">Platform *</label>
                <select value={form.platform || 'linkedin'} onChange={e => setForm({ ...form, platform: e.target.value })}>
                  {Object.entries(PLATFORMS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select></div>
              <div className="form-group"><label className="form-label">Status</label>
                <select value={form.status || 'idea'} onChange={e => setForm({ ...form, status: e.target.value })}>
                  {Object.entries(STATUSES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select></div>
            </div>
            <div className="form-group">
              <label className="form-label">Content *</label>
              <textarea rows={8} value={form.content || ''} onChange={e => setForm({ ...form, content: e.target.value })} />
              {form.content && (
                <div style={{ fontSize: 11, color: form.content.length > (PLATFORMS[form.platform || 'linkedin'].limit) ? 'var(--red)' : 'var(--text-muted)', marginTop: 4, fontFamily: 'var(--font-mono)' }}>
                  {form.content.length} / {PLATFORMS[form.platform || 'linkedin'].limit} chars
                </div>
              )}
            </div>
            <div className="form-row">
              <div className="form-group"><label className="form-label">Campaign</label>
                <select value={form.campaign_id || ''} onChange={e => setForm({ ...form, campaign_id: e.target.value || null })}>
                  <option value="">— None —</option>
                  {campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select></div>
              {(form.status === 'scheduled' || form.status === 'posted') && (
                <div className="form-group"><label className="form-label">{form.status === 'posted' ? 'Posted at' : 'Scheduled for'}</label>
                  <input type="datetime-local"
                    value={(form.status === 'posted' ? form.posted_at : form.scheduled_for) ? new Date(form.status === 'posted' ? form.posted_at : form.scheduled_for).toISOString().slice(0, 16) : ''}
                    onChange={e => setForm({ ...form, [form.status === 'posted' ? 'posted_at' : 'scheduled_for']: e.target.value })} /></div>
              )}
            </div>
            {form.status === 'posted' && (
              <div className="form-group"><label className="form-label">Post URL</label><input value={form.post_url || ''} onChange={e => setForm({ ...form, post_url: e.target.value })} /></div>
            )}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => { setModal(null); setEditing(null); }}>Cancel</button>
              <button className="btn btn-primary" onClick={savePost}>{editing ? 'Save' : 'Add'}</button>
            </div>
          </div>
        </div>
      )}

      {/* TEMPLATE MODAL */}
      {modal === 'template' && (
        <div className="modal-overlay" onClick={() => { setModal(null); setEditing(null); }}>
          <div className="modal" style={{ maxWidth: 600 }} onClick={e => e.stopPropagation()}>
            <div className="modal-title">{editing ? 'Edit template' : 'New template'}</div>
            <div className="form-group"><label className="form-label">Name *</label><input value={form.name || ''} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
            <div className="form-group"><label className="form-label">Category</label>
              <input placeholder="e.g. tip, case_study, announcement" value={form.category || ''} onChange={e => setForm({ ...form, category: e.target.value })} /></div>
            <div className="form-group">
              <label className="form-label">Template *</label>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>
                Use <code>{`{placeholder}`}</code> for fillable variables, e.g. <code>{`{topic}, {benefit}`}</code>
              </div>
              <textarea rows={8} value={form.template || ''} onChange={e => setForm({ ...form, template: e.target.value })} />
              {form.template && (
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                  Variables found: {parseVars(form.template).join(', ') || 'none'}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => { setModal(null); setEditing(null); }}>Cancel</button>
              <button className="btn btn-primary" onClick={saveTemplate}>{editing ? 'Save' : 'Add'}</button>
            </div>
          </div>
        </div>
      )}

      {/* IDEA MODAL */}
      {modal === 'idea' && (
        <div className="modal-overlay" onClick={() => { setModal(null); setEditing(null); }}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">New idea</div>
            <div className="form-group"><label className="form-label">Title *</label><input value={form.title || ''} onChange={e => setForm({ ...form, title: e.target.value })} /></div>
            <div className="form-group"><label className="form-label">Notes</label><textarea rows={3} value={form.notes || ''} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
            <div className="form-group"><label className="form-label">Priority</label>
              <select value={form.priority || 'medium'} onChange={e => setForm({ ...form, priority: e.target.value })}>
                <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option>
              </select></div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => { setModal(null); setEditing(null); }}>Cancel</button>
              <button className="btn btn-primary" onClick={saveIdea}>Add</button>
            </div>
          </div>
        </div>
      )}

      {/* CAMPAIGN MODAL */}
      {modal === 'campaign' && (
        <div className="modal-overlay" onClick={() => { setModal(null); setEditing(null); }}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">New campaign</div>
            <div className="form-group"><label className="form-label">Name *</label><input value={form.name || ''} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
            <div className="form-group"><label className="form-label">Goal</label><input placeholder="e.g. Generate 5 leads" value={form.goal || ''} onChange={e => setForm({ ...form, goal: e.target.value })} /></div>
            <div className="form-group"><label className="form-label">Description</label><textarea rows={2} value={form.description || ''} onChange={e => setForm({ ...form, description: e.target.value })} /></div>
            <div className="form-row">
              <div className="form-group"><label className="form-label">Start</label><input type="date" value={form.start_date || ''} onChange={e => setForm({ ...form, start_date: e.target.value })} /></div>
              <div className="form-group"><label className="form-label">End</label><input type="date" value={form.end_date || ''} onChange={e => setForm({ ...form, end_date: e.target.value })} /></div>
            </div>
            <div className="form-row">
              <div className="form-group"><label className="form-label">Status</label>
                <select value={form.status || 'planning'} onChange={e => setForm({ ...form, status: e.target.value })}>
                  <option value="planning">Planning</option><option value="active">Active</option>
                  <option value="paused">Paused</option><option value="completed">Completed</option>
                </select></div>
              <div className="form-group"><label className="form-label">Colour</label><input type="color" value={form.colour || '#6366f1'} onChange={e => setForm({ ...form, colour: e.target.value })} style={{ height: 40 }} /></div>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => { setModal(null); setEditing(null); }}>Cancel</button>
              <button className="btn btn-primary" onClick={saveCampaign}>Add</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
