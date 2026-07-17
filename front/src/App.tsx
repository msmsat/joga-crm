import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useState, useEffect, type ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './api/queryClient';
import { authApi, type UserMe } from './api';
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
import Catalog from './pages/dashboard/Catalog';
// import RegisterPage from './pages/RegisterPage'; // Раскомментируешь, когда создашь

// ─── 1. ЗАЩИТА КАБИНЕТА (Пускает только с токеном) ──────────────────────────
const ProtectedRoute = ({ children, requireOnboarding = true }: { children: ReactNode, requireOnboarding?: boolean }) => {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<UserMe | null>(null);
  const token = localStorage.getItem('token');

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);

    authApi.getMe(controller.signal)
      .then(data => setUser(data))
      .catch(() => localStorage.removeItem('token'))
      .finally(() => { clearTimeout(timer); setLoading(false); });
  }, [token]);

  if (loading) return <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}><span className="spinner" style={{ borderColor: 'var(--peach)' }}/></div>;
  if (!token || !user) return <Navigate to="/login" replace />;
  if (requireOnboarding && user.is_onboarded === false) return <Navigate to="/onboarding" replace />;
  if (!requireOnboarding && user.is_onboarded === true) return <Navigate to="/dashboard" replace />;
  
  return children;
};

// ─── 2. ЗАЩИТА РОУТОВ ПО РОЛИ (Только для Владельца) ────────────────────────
const OwnerRoute = ({ children }: { children: ReactNode }) => {
  const token = localStorage.getItem('token');
  if (!token) return <Navigate to="/login" replace />;
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    if (payload.role !== 'owner') return <Navigate to="/dashboard" replace />;
  } catch {
    return <Navigate to="/login" replace />;
  }
  return children;
};

// ─── 3. ЗАЩИТА ЛОГИНА (Не пускает, если УЖЕ вошел) ──────────────────────────
const PublicRoute = ({ children }: { children: ReactNode }) => {
  const token = localStorage.getItem('token');
  if (token) return <Navigate to="/dashboard" replace />;
  return children;
};

// ─── ГЛАВНЫЙ КОМПОНЕНТ APP ──────────────────────────────────────────────────
export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
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
          <Route path="clients" element={<Clients />} />
          <Route path="ai" element={<AIPage />} />
          <Route path="settings" element={<Settings />} />
          <Route path="journal" element={<Journal />} />
          <Route path="profile" element={<Profile />} />
          {/* Только для Владельца */}
          <Route path="staff" element={<OwnerRoute><Staff /></OwnerRoute>} />
          <Route path="catalog" element={<OwnerRoute><Catalog /></OwnerRoute>} />
          <Route path="reports" element={<OwnerRoute><Reports /></OwnerRoute>} />
          <Route path="booking" element={<OwnerRoute><Booking /></OwnerRoute>} />
          <Route path="finances" element={<OwnerRoute><Finances /></OwnerRoute>} />
          <Route path="notifications" element={<OwnerRoute><Notifications /></OwnerRoute>} />
          <Route path="loyalty" element={<OwnerRoute><Loyalty /></OwnerRoute>} />
          <Route path="billing" element={<OwnerRoute><Billing /></OwnerRoute>} />
        </Route>

      </Routes>
    </Router>
    </AIDrawerProvider>
    </QueryClientProvider>
  );
}