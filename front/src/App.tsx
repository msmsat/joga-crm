import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useState, useEffect, type ReactNode } from 'react';
import { AIDrawerProvider } from './contexts/AIDrawerContext';
import Landing from "./pages/Landingpage";
import LoginPage from './pages/Loginpage'; // Твоя страница логина
import RegisterPage from './pages/Registerpage';
import OnboardingPage from './components/modals/Onboarding';
import ChangePassword from './pages/ChangePassword';

import DashboardLayout from './layouts/DashboardLayout';

// ─── СТРАНИЦЫ ДАШБОРДА (все 12 штук) ──────────────────────────────────────────
import Overview from './pages/dashboard/Overview/Overview';
import Staff from './pages/dashboard/Staff/Staff';
import Clients from './pages/dashboard/Clients/Clients';
import Reports from './pages/dashboard/Reports/Reports';
import Booking from './pages/dashboard/Booking';
import Finances from './pages/dashboard/Finances/Finances';
import Notifications from './pages/dashboard/Notifications/Notifications';
import Loyalty from './pages/dashboard/Loyalty/Loyalty';
import Settings from './pages/dashboard/Settings/Settings';
import Billing from './pages/dashboard/Billing/Billing';
import Journal from './pages/dashboard/Journal/Journal';
import Profile from './pages/dashboard/Profile';
import AIPage from './pages/dashboard/AI';
// import RegisterPage from './pages/RegisterPage'; // Раскомментируешь, когда создашь

// ─── 1. ЗАЩИТА КАБИНЕТА (Пускает только с токеном) ──────────────────────────
const ProtectedRoute = ({ children, requireOnboarding = true }: { children: ReactNode, requireOnboarding?: boolean }) => {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const token = localStorage.getItem('token');

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }

    // Запрашиваем профиль юзера один раз при переходе на защищенный роут
    fetch("http://localhost:8000/auth/me", {
      headers: { Authorization: `Bearer ${token}` }
    })
    .then(res => {
      if (!res.ok) throw new Error("Invalid token");
      return res.json();
    })
    .then(data => setUser(data))
    .catch(() => localStorage.removeItem('token')) // Если токен протух - удаляем
    .finally(() => setLoading(false));
  }, [token]);

  if (loading) return <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}><span className="spinner" style={{ borderColor: 'var(--peach)' }}/></div>;
  if (!token || !user) return <Navigate to="/login" replace />;
  if (requireOnboarding && user.is_onboarded === false) return <Navigate to="/onboarding" replace />;
  if (!requireOnboarding && user.is_onboarded === true) return <Navigate to="/dashboard" replace />;
  
  return children;
};

// ─── 2. ЗАЩИТА ЛОГИНА (Не пускает, если УЖЕ вошел) ──────────────────────────
const PublicRoute = ({ children }: { children: ReactNode }) => {
  const token = localStorage.getItem('token');
  if (token) return <Navigate to="/dashboard" replace />;
  return children;
};

// ─── ГЛАВНЫЙ КОМПОНЕНТ APP ──────────────────────────────────────────────────
export default function App() {
  return (
    <AIDrawerProvider>
    <Router>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
        
        {/* Убрали защиту с регистрации для тестов (в проде вернем <PublicRoute>) */}
        <Route path="/register" element={<RegisterPage />} />

        {/* 🚀 Онбординг */}
        <Route 
          path="/onboarding" 
          element={
            <ProtectedRoute requireOnboarding={false}>
              <div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
                <OnboardingPage />
              </div>
            </ProtectedRoute>
          } 
        />

        <Route 
          path="/change-password" 
          element={
            <ProtectedRoute requireOnboarding={true}>
              <ChangePassword />
            </ProtectedRoute>
          } 
        />

        {/* 🚀 ДАШБОРД (Каркас + Вложенные страницы) */}
        <Route 
          path="/dashboard" 
          element={
            <ProtectedRoute requireOnboarding={true}>
              <DashboardLayout /> 
            </ProtectedRoute>
          } 
        >
          {/* Сюда подставляются страницы в зависимости от URL */}
          <Route index element={<Overview />} />
          <Route path="staff" element={<Staff />} />
          <Route path="clients" element={<Clients />} />
          <Route path="reports" element={<Reports />} />
          <Route path="booking" element={<Booking />} />
          <Route path="finances" element={<Finances />} />
          <Route path="notifications" element={<Notifications />} />
          <Route path="loyalty" element={<Loyalty />} />
          <Route path="ai" element={<AIPage />} />
          <Route path="settings" element={<Settings />} />
          <Route path="billing" element={<Billing />} />
          <Route path="journal" element={<Journal />} />
          <Route path="profile" element={<Profile />} />
        </Route>

      </Routes>
    </Router>
    </AIDrawerProvider>
  );
}