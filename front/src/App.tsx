import { BrowserRouter as Router, Routes, Route, Navigate, useSearchParams } from 'react-router-dom';
import { useState, useEffect, type ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './api/queryClient';
import { authApi, type UserMe } from './api';
import { AIDrawerProvider } from './contexts/AIDrawerContext';
import { DarkClassGuard } from './contexts/ThemeContext';
import { ToastProvider } from './components/ui/index';
import Landing from "./pages/Landingpage";
import LoginPage from './pages/Loginpage'; // Твоя страница логина
import RegisterPage from './pages/Registerpage';
import OnboardingPage from './components/modals/Onboarding';
import SelectCrm from './pages/SelectCrm';
import JoinPage from './pages/JoinPage';
import { clearActiveToken, getActiveToken, rememberAccountName } from './utils/auth';

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
import PaymentsHistory from './pages/dashboard/Billing/PaymentsHistory';
import Journal from './pages/dashboard/Journal/Journal';
import Profile from './pages/dashboard/Profile';
import AIPage from './pages/dashboard/AI';
import Catalog from './pages/dashboard/Catalog';
// import RegisterPage from './pages/RegisterPage'; // Раскомментируешь, когда создашь

// ─── 1. ЗАЩИТА КАБИНЕТА (Пускает только с токеном) ──────────────────────────
const ProtectedRoute = ({ children, requireOnboarding = true }: { children: ReactNode, requireOnboarding?: boolean }) => {
  const token = getActiveToken();
  // Без токена грузить нечего — стартуем сразу в «загрузка окончена», иначе
  // на первый кадр без нужды мигал бы спиннер.
  const [loading, setLoading] = useState(!!token);
  const [user, setUser] = useState<UserMe | null>(null);

  useEffect(() => {
    if (!token) return;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);

    authApi.getMe(controller.signal)
      .then(data => {
        setUser(data);
        // Связка аккаунтов знает только email из токена — имя приходит вот
        // отсюда, поэтому дописываем его при каждой загрузке кабинета.
        if (data.email) rememberAccountName(data.email, data.name);
      })
      .catch(() => clearActiveToken())
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
  const token = getActiveToken();
  if (!token) return <Navigate to="/login" replace />;
  // Куда уводим, решаем до JSX: разметку внутри try/catch React ловить не умеет.
  let redirectTo: string | null = null;
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    if (payload.role !== 'owner') redirectTo = '/dashboard';
  } catch {
    redirectTo = '/login';
  }
  if (redirectTo) return <Navigate to={redirectTo} replace />;
  return children;
};

// ─── 3. ЗАЩИТА ЛОГИНА (Не пускает, если УЖЕ вошел) ──────────────────────────
const PublicRoute = ({ children }: { children: ReactNode }) => {
  const token = getActiveToken();
  const [searchParams] = useSearchParams();
  // ?switch=1 — вход в другой аккаунт из профиля: токен текущей сессии намеренно
  // сохраняем, поэтому редирект на дашборд здесь пропускаем.
  if (token && searchParams.get('switch') !== '1') return <Navigate to="/dashboard" replace />;
  return children;
};

// ─── 4. /onboarding: первая студия vs доп. студия (EPIC 7, задача 5) ────────
// ?new=1 — уже онбординженный владелец создаёт вторую студию тем же мастером.
// Без параметра при is_onboarded === true строго уводим на дашборд: иначе
// пользователь просто узнал бы об этом на пятом шаге по 400 с бэка.
const OnboardingRoute = () => {
  const [searchParams] = useSearchParams();
  const isNewStudio = searchParams.get('new') === '1';
  return (
    <ProtectedRoute requireOnboarding={isNewStudio}>
      <div className="ob-page" style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
        <OnboardingPage />
      </div>
    </ProtectedRoute>
  );
};

// ─── ГЛАВНЫЙ КОМПОНЕНТ APP ──────────────────────────────────────────────────
export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
    {/* Тосты — на уровне всего приложения: useToast зовут и страницы вне
        DashboardLayout (/select-crm), а без провайдера хук кидает и роняет дерево. */}
    <ToastProvider>
    <AIDrawerProvider>
    <Router>
      {/* Тёмная тема — свойство кабинета: вне /dashboard класс снимается всегда,
          кем бы он ни был поставлен (см. DarkClassGuard). */}
      <DarkClassGuard />
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
        
        {/* Убрали защиту с регистрации для тестов (в проде вернем <PublicRoute>) */}
        <Route path="/register" element={<RegisterPage />} />

        {/* 🚀 Приглашение сотрудника по ссылке из письма. Намеренно БЕЗ PublicRoute:
            приглашённый мог открыть ссылку в браузере, где уже вошёл другой аккаунт,
            и редирект на дашборд не дал бы ему принять приглашение вовсе. */}
        <Route path="/join" element={<JoinPage />} />

        {/* 🚀 Онбординг (первая студия, или ?new=1 — доп. студия, см. OnboardingRoute) */}
        <Route path="/onboarding" element={<OnboardingRoute />} />

        {/* 🚀 Мультистудийность (EPIC 7): выбор/переключение CRM — вне DashboardLayout,
            студия ещё не выбрана, сайдбар и пейволл рисовать не на чем */}
        <Route
          path="/select-crm"
          element={
            <ProtectedRoute requireOnboarding={true}>
              <SelectCrm />
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
          <Route path="billing/payments-history" element={<OwnerRoute><PaymentsHistory /></OwnerRoute>} />
        </Route>

      </Routes>
    </Router>
    </AIDrawerProvider>
    </ToastProvider>
    </QueryClientProvider>
  );
}