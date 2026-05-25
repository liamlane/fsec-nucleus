import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useState } from 'react';
import { get } from '../../utils/api.js';

const NAV = [
  { to: '/',         label: 'Dashboard', icon: '⬡', exact: true },
  { to: '/finance',  label: 'Finance',   icon: '₤' },
  { to: '/goals',    label: 'Goals',     icon: '◎' },
  { to: '/habits',   label: 'Habits',    icon: '⊕' },
  { to: '/notes',    label: 'Notes',     icon: '≡' },
  { to: '/calendar', label: 'Calendar',  icon: '⊞' },
  { to: '/journal',  label: 'Journal',   icon: '◈' },
  { to: '/time',     label: 'Time',      icon: '◷' },
  { to: '/settings', label: 'Settings',  icon: '⚙' },
];

function BottomNav() { /* same as before */ }

export default function Layout() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [showSearch, setShowSearch] = useState(false);

  const today = new Date().toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'short',
  });

  const handleSearch = async (e) => {
    const q = e.target.value;
    setSearchQuery(q);
    if (q.length >= 2) {
      const res = await get(`/search?q=${encodeURIComponent(q)}`);
      setSearchResults(res.results);
      setShowSearch(true);
    } else {
      setSearchResults([]);
      setShowSearch(false);
    }
  };

  const goToResult = (type, id) => {
    let path = '';
    if (type === 'note') path = `/notes/${id}`;
    else if (type === 'goal') path = `/goals`;
    else if (type === 'transaction') path = `/finance`;
    else if (type === 'event') path = `/calendar`;
    else if (type === 'journal') path = `/journal`;
    else return;
    navigate(path);
    setShowSearch(false);
    setSearchQuery('');
  };

  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        {/* Logo same as before */}
        <div style={{ padding: '20px 16px', borderBottom: '1px solid var(--border)' }}>
          {/* unchanged logo block */}
        </div>

        <nav style={{ flex: 1, padding: '12px 8px', overflowY: 'auto' }}>
          {NAV.map(item => (
            <NavLink key={item.to} to={item.to} end={item.exact} style={({ isActive }) => ({ /* same style as before */ })}>
              {({ isActive }) => (
                <>
                  {isActive && <div style={{ position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)', width: 3, height: '60%', background: 'var(--accent)', borderRadius: '0 2px 2px 0', boxShadow: '0 0 8px var(--accent)' }} />}
                  <span style={{ fontSize: 16, width: 20, textAlign: 'center' }}>{item.icon}</span>
                  <span>{item.label}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Lock button – unchanged */}
        <div style={{ padding: '12px 8px', borderTop: '1px solid var(--border)' }}>
          <button onClick={() => { logout(); navigate('/login'); }} style={{ /* same */ }}>
            <span style={{ fontSize: 16 }}>⏏</span>
            <span>Lock</span>
          </button>
        </div>
      </aside>

      <main className="app-main">
        {/* Search bar */}
        <div style={{ padding: '12px 20px', background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, zIndex: 10 }}>
          <div style={{ position: 'relative', maxWidth: 400 }}>
            <input
              type="text"
              placeholder="Search notes, goals, transactions..."
              value={searchQuery}
              onChange={handleSearch}
              style={{ width: '100%', padding: '8px 12px', borderRadius: 8, background: 'var(--bg-card)', border: '1px solid var(--border)' }}
            />
            {showSearch && searchResults.length > 0 && (
              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, marginTop: 4, zIndex: 1000, maxHeight: 300, overflowY: 'auto' }}>
                {searchResults.map(r => (
                  <div key={`${r.type}-${r.id}`} onClick={() => goToResult(r.type, r.id)} style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', cursor: 'pointer', hover: { background: 'var(--bg-hover)' } }}>
                    <span style={{ fontSize: 12, color: 'var(--accent)' }}>[{r.type}]</span> {r.text}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        <Outlet />
      </main>

      <BottomNav />
    </div>
  );
}