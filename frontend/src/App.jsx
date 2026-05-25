import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext.jsx';
import Layout from './components/Layout.jsx';
import Login from './components/Login.jsx';
import Dashboard from './components/dashboard/Dashboard.jsx';
import Finance from './components/finance/Finance.jsx';
import Goals from './components/goals/Goals.jsx';
import Habits from './components/habits/Habits.jsx';
import Notes from './components/notes/Notes.jsx';
import Calendar from './components/calendar/Calendar.jsx';
import Journal from './components/journal/Journal.jsx';
import TimeTracking from './components/timetracking/TimeTracking.jsx';
import Settings from './components/Settings.jsx';   // ✅ correct import

const Protected = ({ children }) => {
  const { isAuth } = useAuth();
  return isAuth ? children : <Navigate to="/login" replace />;
};

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<Protected><Layout /></Protected>}>
            <Route index element={<Dashboard />} />
            <Route path="finance/*" element={<Finance />} />
            <Route path="goals" element={<Goals />} />
            <Route path="habits" element={<Habits />} />
            <Route path="notes/*" element={<Notes />} />
            <Route path="calendar" element={<Calendar />} />
            <Route path="journal" element={<Journal />} />
            <Route path="time" element={<TimeTracking />} />
            <Route path="settings" element={<Settings />} />   {/* ✅ now inside the protected route */}
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}