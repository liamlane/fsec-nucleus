import { useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.jsx';
import { get } from '../utils/api.js';

// ── Nav structure: grouped into Work + Personal ────────────────────────
const WORK_NAV = [
  { to: '/business',  label: 'Business',  icon: '✦' },
  { to: '/tickets',   label: 'Tickets',   icon: '▣' },
  { to: '/marketing', label: 'Marketing', icon: '◊' },
  { to: '/time',      label: 'Time',      icon: '◷' },
];

const PERSONAL_NAV = [
  { to: '/finance',   label: 'Finance',   icon: '₤' },
  { to: '/debts',     label: 'Debts',     icon: '⚖' },
  { to: '/goals',     label: 'Goals',     icon: '◎' },
  { to: '/habits',    label: 'Habits',    icon: '⊕' },
  { to: '/trackers',  label: 'Trackers',  icon: '◉' },
  { to: '/notes',     label: 'Notes',     icon: '≡' },
  { to: '/calendar',  label: 'Calendar',  icon: '⊞' },
  { to: '/journal',   label: 'Journal',   icon: '◈' },
];

// Flat list for search routing + mobile nav
const ALL_NAV = [
  { to: '/', label: 'Dashboard', icon: '⬡', exact: true },
  ...WORK_NAV,
  ...PERSONAL_NAV,
  { to: '/settings', label: 'Settings', icon: '⚙' },
];

function NavSection({ title, items, collapsed, onToggle, onNavClick }) {
  return (
    <div style={{ marginBottom: 4 }}>
      <button
        onClick={onToggle}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          width: '100%', padding: '8px 16px', background: 'transparent',
          border: 'none', cursor: 'pointer', color: 'var(--text-muted)',
          fontSize: 10, fontWeight: 600, textTransform: 'uppercase',
          letterSpacing: '0.08em',
        }}
      >
        {title}
        <span style={{ fontSize: 9, opacity: 0.6, transition: 'transform 0.15s', transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}>▼</span>
      </button>
      {!collapsed && items.map(item => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.exact}
          onClick={onNavClick}
          className={({ isActive }) => isActive ? 'active' : ''}
        >
          <span className="nav-icon">{item.icon}</span>
          <span className="nav-label">{item.label}</span>
        </NavLink>
      ))}
    </div>
  );
}

function BottomNav() {
  const location = useLocation();
  const MOBILE_NAV = [
    { to: '/',         label: 'Home',     icon: '⬡', exact: true },
    { to: '/business', label: 'Business', icon: '✦' },
    { to: '/tickets',  label: 'Tickets',  icon: '▣' },
    { to: '/finance',  label: 'Finance',  icon: '₤' },
    { to: '/time',     label: 'Time',     icon: '◷' },
  ];
  return (
    <nav className="bottom-nav">
      {MOBILE_NAV.map(item => {
        const active = item.exact
          ? location.pathname === item.to
          : location.pathname.startsWith(item.to);
        return (
          <NavLink key={item.to} to={item.to} className={active ? 'active' : ''}>
            <span className="nav-icon">{item.icon}</span>
            <span className="nav-label">{item.label}</span>
          </NavLink>
        );
      })}
    </nav>
  );
}

export default function Layout() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery]     = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [showSearch, setShowSearch]       = useState(false);
  const [drawerOpen, setDrawerOpen]       = useState(false);
  const [workCollapsed, setWorkCollapsed]       = useState(false);
  const [personalCollapsed, setPersonalCollapsed] = useState(false);

  const today = new Date().toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'short',
  });

  const handleSearch = async (e) => {
    const q = e.target.value;
    setSearchQuery(q);
    if (q.length >= 2) {
      try {
        const res = await get(`/search?q=${encodeURIComponent(q)}`);
        setSearchResults(res.results || []);
        setShowSearch(true);
      } catch {
        setSearchResults([]);
        setShowSearch(false);
      }
    } else {
      setSearchResults([]);
      setShowSearch(false);
    }
  };

  const goToResult = (type, id) => {
    let path = '';
    // Personal
    if      (type === 'note')        path = `/notes/${id}`;
    else if (type === 'goal')        path = '/goals';
    else if (type === 'transaction') path = '/finance';
    else if (type === 'event')       path = '/calendar';
    else if (type === 'journal')     path = '/journal';
    else if (type === 'habit')       path = '/habits';
    else if (type === 'payee')       path = '/finance';
    else if (type === 'substance')   path = '/habits';
    // Business / Work
    else if (type === 'client')      path = '/business';
    else if (type === 'project')     path = '/business';
    else if (type === 'invoice')     path = '/business';
    else if (type === 'quote')       path = '/business';
    else if (type === 'expense')     path = '/business';
    else if (type === 'ticket')      path = '/tickets';
    // Marketing
    else if (type === 'social_post') path = '/marketing';
    else if (type === 'idea')        path = '/marketing';
    else if (type === 'campaign')    path = '/marketing';
    // Trackers
    else if (type === 'media')       path = '/trackers';
    else if (type === 'contact')     path = '/trackers';
    else return;
    navigate(path);
    setShowSearch(false);
    setSearchQuery('');
    setDrawerOpen(false);
  };

  const TYPE_LABELS = {
    note: 'Note', goal: 'Goal', transaction: 'Transaction', event: 'Event',
    journal: 'Journal', habit: 'Habit', payee: 'Payee', substance: 'Substance',
    client: 'Client', project: 'Project', invoice: 'Invoice', quote: 'Quote',
    expense: 'Expense', social_post: 'Post', idea: 'Idea', campaign: 'Campaign',
    media: 'Media', contact: 'Contact', ticket: 'Ticket',
  };

  const closeDrawer = () => setDrawerOpen(false);

  return (
    <div className="app-shell">
      {/* Sidebar */}
      <aside className={`app-sidebar ${drawerOpen ? 'open' : ''}`}>
        <div style={{ padding: '20px 16px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10,
              background: 'linear-gradient(135deg, #7c6aff, #4da6ff)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 18, boxShadow: '0 0 16px rgba(124,106,255,0.35)',
            }}>⬡</div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 16 }}>Nucleus</div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{today}</div>
            </div>
          </div>
        </div>

        <nav className="sidebar-nav">
          {/* Dashboard — always at top */}
          <NavLink to="/" end onClick={closeDrawer} className={({ isActive }) => isActive ? 'active' : ''}>
            <span className="nav-icon">⬡</span>
            <span className="nav-label">Dashboard</span>
          </NavLink>

          <div style={{ height: 6 }} />

          {/* Work section */}
          <NavSection title="Work" items={WORK_NAV}
            collapsed={workCollapsed} onToggle={() => setWorkCollapsed(c => !c)}
            onNavClick={closeDrawer} />

          {/* Personal section */}
          <NavSection title="Personal" items={PERSONAL_NAV}
            collapsed={personalCollapsed} onToggle={() => setPersonalCollapsed(c => !c)}
            onNavClick={closeDrawer} />

          <div style={{ height: 6 }} />

          {/* Settings — always at bottom of nav */}
          <NavLink to="/settings" onClick={closeDrawer} className={({ isActive }) => isActive ? 'active' : ''}>
            <span className="nav-icon">⚙</span>
            <span className="nav-label">Settings</span>
          </NavLink>
        </nav>

        <div style={{ padding: 12, borderTop: '1px solid var(--border)' }}>
          <button className="btn btn-ghost btn-sm" style={{ width: '100%' }} onClick={logout}>Log out</button>
        </div>
      </aside>

      {drawerOpen && <div className="drawer-overlay" onClick={closeDrawer} />}

      {/* Main */}
      <main className="app-main">
        <header className="app-header">
          <button className="drawer-toggle" onClick={() => setDrawerOpen(d => !d)} aria-label="Menu">☰</button>

          <div className="search-wrap" style={{ position: 'relative', flex: 1, maxWidth: 480 }}>
            <input
              type="search"
              placeholder="Search everything..."
              value={searchQuery}
              onChange={handleSearch}
              onBlur={() => setTimeout(() => setShowSearch(false), 200)}
              onFocus={() => searchQuery.length >= 2 && setShowSearch(true)}
              style={{ width: '100%' }}
            />
            {showSearch && searchResults.length > 0 && (
              <div style={{
                position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
                background: 'var(--bg-card)', border: '1px solid var(--border)',
                borderRadius: 'var(--radius)', boxShadow: 'var(--shadow-lg)',
                maxHeight: 480, overflowY: 'auto', zIndex: 100,
              }}>
                {searchResults.map(r => (
                  <button
                    key={`${r.type}-${r.id}`}
                    onClick={() => goToResult(r.type, r.id)}
                    style={{
                      width: '100%', textAlign: 'left', padding: '10px 14px',
                      background: 'transparent', border: 'none',
                      borderBottom: '1px solid var(--border)',
                      display: 'flex', justifyContent: 'space-between', gap: 12,
                      alignItems: 'center', cursor: 'pointer',
                    }}
                  >
                    <span style={{
                      fontSize: 13, color: 'var(--text-primary)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>{r.text || '(untitled)'}</span>
                    <span style={{
                      fontSize: 10, color: 'var(--text-muted)',
                      background: 'var(--bg-tertiary)', padding: '2px 8px',
                      borderRadius: 99, flexShrink: 0,
                    }}>{TYPE_LABELS[r.type] || r.type}</span>
                  </button>
                ))}
              </div>
            )}
            {showSearch && searchQuery.length >= 2 && searchResults.length === 0 && (
              <div style={{
                position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
                background: 'var(--bg-card)', border: '1px solid var(--border)',
                borderRadius: 'var(--radius)', padding: 14,
                fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', zIndex: 100,
              }}>No results for "{searchQuery}"</div>
            )}
          </div>
        </header>

        <div className="app-content">
          <Outlet />
        </div>

        <BottomNav />
      </main>
    </div>
  );
}
