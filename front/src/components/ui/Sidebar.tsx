import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { clientsApi } from '../../api/clients/clients.api';
import { queryKeys } from '../../api/queryKeys';
import { useStudioSettings } from '../../hooks/useStudioCurrency';
import { NAV, NAV_BOTTOM, prefetchJournal, type NavEntry } from './navItems';
import { Tooltip } from './Tooltip';
import { UserMenu } from './UserMenu';
import { MobileNav } from './MobileNav';

// ─── РЕЖИМ «РЕЛЬСЫ» ──────────────────────────────────────────────────────────
// На ноутбучных экранах 240px подписей — непозволительная роскошь: меню
// схлопывается до колонки иконок (68px), подписи уезжают в тултипы.
// ≤1180px — принудительно (места нет вообще), ≤1400px — по умолчанию,
// но пользователь может развернуть обратно; выбор живёт в localStorage.
// Ниже 768px меню не «рельса», а нижняя панель — см. MobileNav.
const RAIL_KEY = 'velora.sidebar.rail';
const FORCE_RAIL = '(max-width: 1180px)';
const AUTO_RAIL_W = 1400;

function useRail() {
  const [forced, setForced] = useState(() => window.matchMedia(FORCE_RAIL).matches);
  const [manual, setManual] = useState(() => {
    const saved = localStorage.getItem(RAIL_KEY);
    return saved !== null ? saved === '1' : window.innerWidth <= AUTO_RAIL_W;
  });

  useEffect(() => {
    const mq = window.matchMedia(FORCE_RAIL);
    const onChange = (e: MediaQueryListEvent) => setForced(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const toggle = () => setManual(v => {
    localStorage.setItem(RAIL_KEY, v ? '0' : '1');
    return !v;
  });

  return { isRail: forced || manual, canToggle: !forced, toggle };
}

export interface SidebarProps {
  role: string | null;           // owner видит все разделы, admin/trainer — только свои
}

// Боковое меню каркаса (стили — классы .sidebar/.nav-item в App.css).
export function Sidebar({ role }: SidebarProps) {
  const { t } = useTranslation('menu');
  const { data: studio } = useStudioSettings();
  const { isRail, canToggle, toggle } = useRail();

  // Счётчик клиентов для бейджа меню — реальные данные, не хардкод. Через Query,
  // а не разовым fetch в useState: каркас не размонтируется, и одноразовая
  // загрузка застревала навсегда — у пустой на момент входа студии бейдж
  // показывал 0 и после добавления клиентов. Ключ лежит под префиксом 'clients',
  // который мутации клиента инвалидируют и так, — число обновляется само.
  const { data: countData } = useQuery({
    queryKey: queryKeys.clientsCount,
    queryFn: () => clientsApi.getCount(),
  });
  // Ошибка запроса (нет прав, сеть) — бейджа просто нет, а не «0 клиентов».
  const clientsCount = countData?.count ?? null;

  const renderItem = (item: NavEntry) => {
    if (item.owner && role !== 'owner') return null;
    const label = t(`nav.${item.key}`);
    const link = (
      <NavLink
        key={item.to}
        to={item.to}
        end={item.end}
        onMouseEnter={item.prefetch}
        className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
        style={{ textDecoration: 'none' }}
      >
        {item.icon}
        <span className="nav-label">{label}</span>
        {item.badge === 'clients' && clientsCount !== null && (
          <span className="nav-badge">{clientsCount}</span>
        )}
        {item.badge === 'beta' && <span className="nav-badge nav-badge-new">{t('badge.beta')}</span>}
      </NavLink>
    );
    // В рельсе подпись живёт в тултипе (портал — не режется overflow меню).
    return isRail
      ? <Tooltip key={item.to} label={label} side="right" block>{link}</Tooltip>
      : link;
  };

  const journalLink = (
    <NavLink to="/dashboard/journal" onMouseEnter={prefetchJournal} className="sidebar-journal" style={{ textDecoration: 'none' }}>
      <div className="journal-icon">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
      </div>
      <div className="nav-label">
        <div className="journal-text">{t('nav.journal')}</div>
        <div className="journal-sub">{t('subtitles.journal')}</div>
      </div>
    </NavLink>
  );

  return (
    <>
      <nav className={isRail ? 'sidebar is-rail' : 'sidebar'}>
        <div className="sidebar-logo">
          <div className="logo-row">
            <div className="logo-name">
              {/* Знак Velora: четыре окошка без подложки. Плитки упираются в границы
                  вьюбокса — оптический центр совпадает с геометрическим сам собой. */}
              <span className="sidebar-mark">
                <svg width="100%" height="100%" viewBox="0 0 20 20" fill="currentColor">
                  <rect width="9" height="9" rx="2.6" />
                  <rect x="11" width="9" height="9" rx="2.6" opacity="0.55" />
                  <rect y="11" width="9" height="9" rx="2.6" opacity="0.55" />
                  <rect x="11" y="11" width="9" height="9" rx="2.6" />
                </svg>
              </span>
              <span className="nav-label">{t('brand.product')}</span>
            </div>
            {canToggle && (
              <button
                type="button"
                className="sidebar-toggle"
                onClick={toggle}
                aria-label={t(isRail ? 'sidebar.expand' : 'sidebar.collapse')}
                title={t(isRail ? 'sidebar.expand' : 'sidebar.collapse')}
              >
                {/* Иконка панели: рамка со «стенкой» слева, шеврон показывает,
                    в какую сторону поедет меню — разворачивать нечего. */}
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3.5" width="18" height="17" rx="3" />
                  <line x1="9.5" y1="3.5" x2="9.5" y2="20.5" />
                  <path d={isRail ? 'M14 9.5l2.5 2.5L14 14.5' : 'M17 9.5L14.5 12l2.5 2.5'} />
                </svg>
              </button>
            )}
          </div>
          {studio?.name && (
            <Tooltip label={t('tooltips.studioName', { name: studio.name })} side="bottom">
              <div className="studio-badge">{studio.name}</div>
            </Tooltip>
          )}
        </div>

        <div className="sidebar-nav">
          {NAV.map(renderItem)}
          <div className="sidebar-divider"></div>
          {NAV_BOTTOM.map(renderItem)}
        </div>

        <div className="sidebar-bottom">
          {isRail
            ? <Tooltip label={t('nav.journal')} side="right" block>{journalLink}</Tooltip>
            : journalLink}
          <UserMenu />
        </div>
      </nav>

      {/* Телефон: меню-колонка уходит (CSS), навигация переезжает вниз экрана.
          Рендерится всегда, а не по matchMedia — счётчик клиентов уже посчитан
          здесь, и второй хук ради того же числа заводить незачем. */}
      <MobileNav role={role} clientsCount={clientsCount} />
    </>
  );
}
