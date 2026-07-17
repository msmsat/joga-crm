import { useMemo, useState, useEffect } from 'react';
import { Outlet, useLocation, Navigate } from 'react-router-dom';
import '../App.css';
import { useAIDrawer } from '../contexts/AIDrawerContext';
import AIDrawer from '../components/AIDrawer';
import PlanLimitModal from '../components/PlanLimitModal';
import { getUserRoleFromToken } from '../utils/auth';
import { billingApi } from '../api/billing/billing.api';
import type { BillingPlan } from '../api/billing/billing.types';
import SubscriptionBanner from '../components/SubscriptionBanner';
// Важно: путь с /index — иначе на Windows импорт папки ui сталкивается с UI.tsx по регистру.
import { ToastProvider, Sidebar, Navbar } from '../components/ui/index';

// Активная подписка = trial или active; всё прочее (none, истёкшая) → пейволл.
const ACTIVE_STATUSES = ['trial', 'active'];
// Разделы, доступные без активной подписки: тариф (чтобы оплатить) и профиль.
const PAYWALL_ALLOWED = ['/dashboard/billing', '/dashboard/profile'];

// ─── КОНФИГУРАЦИЯ ЗАГОЛОВКОВ ─────────────────────────────────────────────────
const ROUTE_META: Record<string, [string, string]> = {
  '/dashboard': ['Дашборд', 'Добро пожаловать в Velora CRM'],
  '/dashboard/staff': ['Сотрудники', 'Управление командой'],
  '/dashboard/catalog': ['Каталог', 'Студии, залы и услуги'],
  '/dashboard/clients': ['Клиенты', 'База клиентов студии'],
  '/dashboard/reports': ['Отчёты', 'Аналитика и статистика'],
  '/dashboard/booking': ['Онлайн-запись', 'Управление каналами записи'],
  '/dashboard/finances': ['Финансы', 'Счета, операции, документы'],
  '/dashboard/notifications': ['Уведомления', 'Каналы и типы оповещений'],
  '/dashboard/loyalty': ['Лояльность', 'Программы и карты клиентов'],
  '/dashboard/ai': ['Velora AI', 'Умный ассистент и автоответы'],
  '/dashboard/settings': ['Настройки', 'Конфигурация системы'],
  '/dashboard/billing': ['Тариф и оплата', 'Управление подпиской'],
  '/dashboard/journal': ['Журнал', 'Расписание занятий'],
  '/dashboard/profile': ['Профиль', 'Аккаунт и настройки'],
};

// ─── ГЛАВНЫЙ КОМПОНЕНТ КАРКАСА ────────────────────────────────────────────────
// Оболочка: Sidebar + Navbar (вынесены в components/ui) + контент + пейволл.
export default function DashboardLayout() {
  const location = useLocation();
  const { isOpen: isDrawerOpen } = useAIDrawer();
  const role = getUserRoleFromToken();

  const [title, subtitle] = useMemo(() => {
    const currentPath = location.pathname.replace(/\/$/, '');
    return ROUTE_META[currentPath] || ROUTE_META['/dashboard'];
  }, [location.pathname]);

  // Пейволл (задача 12b): подписка не активна → пускаем только на «Тариф» и «Профиль».
  // /billing/plan — только для owner; admin/trainer план не тянут (undefined = не блокируем,
  // их отсекает 402-гейт на данных → редирект из api/client.ts). Возврат с оплаты
  // (?payment=return) не блокируем — Billing сам перезапросит план после вебхука.
  const currentPath = location.pathname.replace(/\/$/, '');
  const paymentReturn = new URLSearchParams(location.search).get('payment') === 'return';

  const [plan, setPlan] = useState<BillingPlan | null | undefined>(undefined);
  useEffect(() => {
    if (role !== 'owner') return;
    // Перечитываем и при возврате с оплаты: вебхук мог активировать подписку, иначе
    // после ухода со страницы биллинга стухший план ложно вернул бы юзера на пейволл.
    billingApi.getPlan()
      .then(setPlan)
      .catch(() => setPlan(null)); // ошибку глотаем — не запираем на сбое сети
  }, [role, paymentReturn]);
  const subActive = plan ? ACTIVE_STATUSES.includes(plan.status) : undefined;

  const paywalled =
    subActive === false && !paymentReturn && !PAYWALL_ALLOWED.includes(currentPath);

  return (
    <ToastProvider>
    <div className={`dash-root${isDrawerOpen ? ' drawer-open' : ''}`} style={{
      display: 'flex',
      height: '100vh',
      overflow: 'hidden',
      fontFamily: 'var(--font)',
      background: 'var(--bg)',
      color: 'var(--text)',
      fontSize: '14px',
      lineHeight: 1.5,
      transition: 'padding-right 380ms cubic-bezier(0.25, 0.46, 0.45, 0.94)',
    }}>

      <Sidebar role={role} />

      {/* ─── MAIN ─── */}
      <div className="main" style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>

        <Navbar title={title} subtitle={subtitle} />

        <SubscriptionBanner plan={plan} />

        <div className="content" style={{
          flex: 1,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          position: 'relative', // 🔥 Включает контекст наложения для этой области
          zIndex: 1             // 🔥 Делает весь контент и графики ниже уровня topbar
        }}>
          {paywalled ? <Navigate to="/dashboard/billing" replace /> : <Outlet />}
        </div>
      </div>

      <AIDrawer />
      <PlanLimitModal />
    </div>
    </ToastProvider>
  );
}
