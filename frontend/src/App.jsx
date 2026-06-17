import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext.jsx';
import { PreferencesProvider, usePrefs } from './contexts/PreferencesContext.jsx';
import Layout       from './components/Layout.jsx';
import Login        from './components/Login.jsx';
import Dashboard    from './components/dashboard/Dashboard.jsx';
import Finance      from './components/finance/Finance.jsx';
import Business     from './components/business/Business.jsx';
import Marketing    from './components/marketing/Marketing.jsx';
import Goals        from './components/goals/Goals.jsx';
import Habits       from './components/habits/Habits.jsx';
import Trackers     from './components/trackers/Trackers.jsx';
import Notes        from './components/notes/Notes.jsx';
import Calendar     from './components/calendar/Calendar.jsx';
import Journal      from './components/journal/Journal.jsx';
import TimeTracking from './components/timetracking/TimeTracking.jsx';
import Debts        from './components/debts/Debts.jsx';
import Settings     from './components/Settings.jsx';

// Placeholder until Deploy 2 ships the full Tickets module
function TicketsPlaceholder() {
  return (
    <div style={{ textAlign: 'center', padding: 60 }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>▣</div>
      <h2>IT Ticketing</h2>
      <p style={{ color: 'var(--text-muted)', maxWidth: 400, margin: '12px auto' }}>
        Job tracking, time logging, and invoice generation for FLT client work. Coming in the next deploy.
      </p>
    </div>
  );
}

const Protected = ({ children }) => {
  const { isAuth } = useAuth();
  return isAuth ? children : <Navigate to="/login" replace />;
};

const LandingRedirect = () => {
  const { prefs, loaded } = usePrefs();
  if (!loaded) return <Dashboard />;
  const target = prefs.default_landing || '/';
  if (target === '/' || target === '') return <Dashboard />;
  return <Navigate to={target} replace />;
};

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <PreferencesProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/" element={<Protected><Layout /></Protected>}>
              <Route index               element={<LandingRedirect />} />
              <Route path="dashboard"    element={<Dashboard />} />
              <Route path="finance/*"    element={<Finance />} />
              <Route path="debts/*"      element={<Debts />} />
              <Route path="business/*"   element={<Business />} />
              <Route path="tickets/*"    element={<TicketsPlaceholder />} />
              <Route path="marketing/*"  element={<Marketing />} />
              <Route path="goals"        element={<Goals />} />
              <Route path="habits"       element={<Habits />} />
              <Route path="trackers"     element={<Trackers />} />
              <Route path="notes/*"      element={<Notes />} />
              <Route path="calendar"     element={<Calendar />} />
              <Route path="journal"      element={<Journal />} />
              <Route path="time"         element={<TimeTracking />} />
              <Route path="settings"     element={<Settings />} />
            </Route>
          </Routes>
        </PreferencesProvider>
      </BrowserRouter>
    </AuthProvider>
  );
}
