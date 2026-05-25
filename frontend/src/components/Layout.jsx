import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.jsx';

const NAV = [
  { to: '/',         label: 'Dashboard', icon: '⬡', exact: true },
  { to: '/finance',  label: 'Finance',   icon: '₤' },
  { to: '/goals',    label: 'Goals',     icon: '◎' },
  { to: '/habits',   label: 'Habits',    icon: '⊕' },
  { to: '/notes',    label: 'Notes',     icon: '≡' },
  { to: '/calendar', label: 'Calendar',  icon: '⊞' },
  { to: '/journal',  label: 'Journal',   icon: '◈' },
  { to: '/time',     label: 'Time',      icon: '◷' },
];

function BottomNav() {
  const location = useLocation();

  const isActive = (item) => {
    if (item.exact) return location.pathname === item.to;
    return location.pathname.startsWith(item.to);
  };

  return (
    <nav className="bottom-nav">
      {NAV.map(item => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.exact}
          className={({ isActive: navActive }) =>
            `bottom-nav-item${navActive ? ' active' : ''}`
          }
        >
          <span className="bottom-nav-icon">{item.icon}</span>
          <span>{item.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}

export default function Layout() {
  const { logout } = useAuth();
  const navigate = useNavigate();

  const today = new Date().toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'short',
  });

  return (
    <div className="app-shell">
      {/* ── Sidebar (desktop) ────────────────────────────────────────────── */}
      <aside className="app-sidebar">
        {/* Logo */}
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

        {/* Nav links */}
        <nav style={{ flex: 1, padding: '12px 8px', overflowY: 'auto' }}>
          {NAV.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.exact}
              style={({ isActive }) => ({
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '9px 12px',
                borderRadius: 8,
                marginBottom: 2,
                fontSize: 14,
                fontWeight: isActive ? 600 : 400,
                color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                background: isActive ? 'var(--bg-hover)' : 'transparent',
                transition: 'var(--transition)',
                textDecoration: 'none',
                position: 'relative',
              })}
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <div style={{
                      position: 'absolute', left: 0, top: '50%',
                      transform: 'translateY(-50%)',
                      width: 3, height: '60%',
                      background: 'var(--accent)',
                      borderRadius: '0 2px 2px 0',
                      boxShadow: '0 0 8px var(--accent)',
                    }} />
                  )}
                  <span style={{ fontSize: 16, width: 20, textAlign: 'center' }}>{item.icon}</span>
                  <span>{item.label}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Lock button */}
        <div style={{ padding: '12px 8px', borderTop: '1px solid var(--border)' }}>
          <button
            onClick={() => { logout(); navigate('/login'); }}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '9px 12px', borderRadius: 8, fontSize: 14,
              color: 'var(--text-muted)', background: 'transparent', width: '100%',
              transition: 'var(--transition)',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.color = 'var(--text-primary)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)'; }}
          >
            <span style={{ fontSize: 16 }}>⏏</span>
            <span>Lock</span>
          </button>
        </div>
      </aside>

      {/* ── Main content ─────────────────────────────────────────────────── */}
      <main className="app-main">
        <Outlet />
      </main>

      {/* ── Bottom nav (mobile only — CSS hides on desktop) ───────────────── */}
      <BottomNav />
    </div>
  );
}
