import { useState, useEffect } from 'react';
import { Outlet, useLocation, Navigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import '../App.css';
import { useAIDrawer } from '../contexts/AIDrawerContext';
import { ThemeProvider } from '../contexts/ThemeContext';
import AIDrawer from '../components/AIDrawer';
import PlanLimitModal from '../components/PlanLimitModal';
import PhoneGate from '../components/PhoneGate';
import { useMe } from '../hooks/useMe';
import { getUserRoleFromToken } from '../utils/auth';
import { billingApi } from '../api/billing/billing.api';
import type { BillingPlan } from '../api/billing/billing.types';
import SubscriptionBanner from '../components/SubscriptionBanner';
import { useStudioSettings } from '../hooks/useStudioCurrency';
import { settingsApi } from '../api/settings/settings.api';
import { queryKeys } from '../api/queryKeys';
import i18n from '../i18n';
// Важно: путь с /index — иначе на Windows импорт папки ui сталкивается с UI.tsx по регистру.
import { Sidebar, Navbar, ErrorBoundary } from '../components/ui/index';

// Активная подписка = trial или active; всё прочее (none, истёкшая) → пейволл.
const ACTIVE_STATUSES = ['trial', 'active'];
// Разделы, доступные без активной подписки: тариф (чтобы оплатить) и профиль.
const PAYWALL_ALLOWED = ['/dashboard/billing', '/dashboard/profile'];

// ─── КОНФИГУРАЦИЯ ЗАГОЛОВКОВ ─────────────────────────────────────────────────
// Путь → ключ раздела в неймспейсе menu (nav.<key> / subtitles.<key>).
// Текст резолвится в рендере через t(), а не хранится готовой строкой —
// иначе на смену языка модульная константа не перерисуется.
const ROUTE_KEY: Record<string, string> = {
  '/dashboard': 'dashboard',
  '/dashboard/staff': 'staff',
  '/dashboard/catalog': 'catalog',
  '/dashboard/clients': 'clients',
  '/dashboard/reports': 'reports',
  '/dashboard/booking': 'booking',
  '/dashboard/finances': 'finances',
  '/dashboard/notifications': 'notifications',
  '/dashboard/loyalty': 'loyalty',
  '/dashboard/ai': 'ai',
  '/dashboard/settings': 'settings',
  '/dashboard/billing': 'billing',
  '/dashboard/journal': 'journal',
  '/dashboard/profile': 'profile',
};

// ─── ГЛАВНЫЙ КОМПОНЕНТ КАРКАСА ────────────────────────────────────────────────
// Оболочка: Sidebar + Navbar (вынесены в components/ui) + контент + пейволл.
export default function DashboardLayout() {
  const { t } = useTranslation('menu');
  const location = useLocation();
  const { isOpen: isDrawerOpen } = useAIDrawer();
  const role = getUserRoleFromToken();

  const routeKey = ROUTE_KEY[location.pathname.replace(/\/$/, '')] ?? 'dashboard';

  // Язык интерфейса → i18next. Личный выбор сотрудника (Настройки → Внешний
  // вид) главнее языка студии; не выбран — идём за студией, как раньше.
  // Мутации в Настройках зовут changeLanguage сами; это — для входа в
  // приложение и смены студии.
  const { data: studio } = useStudioSettings();
  const { data: appearance } = useQuery({
    queryKey: queryKeys.appearance,
    queryFn: () => settingsApi.getAppearance(),
    staleTime: 5 * 60_000,
  });
  const uiLanguage = appearance?.language ?? studio?.language;
  useEffect(() => {
    if (uiLanguage && uiLanguage !== i18n.language) {
      i18n.changeLanguage(uiLanguage);
    }
  }, [uiLanguage]);

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

  // PhoneGate (ниже) блокирует экран целиком и закрыть его нельзя — но сам Outlet
  // (Дашборд с графиками, живой лентой на 60с-поллинге и т.д.) всё равно монтировался
  // и рендерился под ним. На первом входе после онбординга, на слабом мобильном CPU,
  // это соревнование за главный поток и было причиной лагов при вводе телефона —
  // не в самой модалке (она уже без backdrop-filter, см. .v-overlay), а в том, что
  // крутилось позади неё. me ещё не загружен → not needsPhone, Outlet рендерится как
  // раньше (не мигает пустотой у обычных пользователей с уже заполненным телефоном).
  const { data: me } = useMe();
  const needsPhone = !!me && !me.phone;

  return (
    <ThemeProvider>
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

        <Navbar title={t(`nav.${routeKey}`)} subtitle={t(`subtitles.${routeKey}`)} />

        <SubscriptionBanner plan={plan} />

        <div className="content" style={{
          flex: 1,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          position: 'relative', // 🔥 Включает контекст наложения для этой области
          zIndex: 1             // 🔥 Делает весь контент и графики ниже уровня topbar
        }}>
          {paywalled ? <Navigate to="/dashboard/billing" replace /> : needsPhone ? null : (
            <ErrorBoundary key={location.pathname}>
              <Outlet />
            </ErrorBoundary>
          )}
        </div>
      </div>

      <AIDrawer />
      <PlanLimitModal />
      {/* Аккаунт = email + телефон: если номера нет (Google-вход, старые
          владельцы), спрашиваем один раз здесь — на входе в кабинет. */}
      <PhoneGate />
    </div>
    </ThemeProvider>
  );
}
