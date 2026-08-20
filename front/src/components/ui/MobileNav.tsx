import { useEffect, useRef, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { NAV, NAV_BOTTOM, JOURNAL_ENTRY, type NavEntry } from './navItems';
import { UserMenu } from './UserMenu';

// ─── НИЖНЯЯ ПАНЕЛЬ (телефон, <768px) ─────────────────────────────────────────
// Колонка меню на экране в 375px съедает половину ширины, поэтому на телефоне
// навигация переезжает под большой палец. В панели — четыре раздела, которыми
// пользуются каждый день и которые видит любая роль, плюс «Ещё» со всем
// остальным. Разметка рендерится всегда, показывает её только медиазапрос
// (см. блок «ТЕЛЕФОН» в App.css) — так не нужен ни matchMedia, ни ресайз-хук.
// Порядок задан списком ключей, а не порядком NAV: в боковом меню Журнал —
// закреплённая внизу кнопка, здесь он второй вкладкой. filter вместо
// NAV.find(...)! — переименование ключа должно стоить одной пропавшей вкладки,
// а не undefined.to и белого экрана на всём телефоне.
//
// Velora AI вкладкой не занимает слот: ассистент открывается кнопкой AI в
// верхней панели с ЛЮБОЙ страницы, то есть до него и так один тап, а слотов
// внизу всего четыре. На освободившееся место — Настройки.
// Ключи здесь не проходят проверку роли (TABS рендерится без visible()),
// поэтому вкладкой может быть только раздел, доступный всем ролям: из
// оставшихся это Настройки — у тренера и администратора там свои личные
// вкладки. Любой owner-раздел на этом месте просто пропал бы у половины
// пользователей, оставив панель с тремя кнопками.
const TAB_KEYS = ['dashboard', 'journal', 'clients', 'settings'];
const BY_KEY = new Map([...NAV, ...NAV_BOTTOM, JOURNAL_ENTRY].map(item => [item.key, item]));
const TABS: NavEntry[] = TAB_KEYS.map(k => BY_KEY.get(k)).filter((i): i is NavEntry => !!i);
const TAB_KEY_SET = new Set(TAB_KEYS);

const MoreIcon = (
  <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
    <circle cx="5" cy="12" r="1.6" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
    <circle cx="19" cy="12" r="1.6" fill="currentColor" stroke="none" />
  </svg>
);

export interface MobileNavProps {
  role: string | null;
  clientsCount: number | null;
}

export function MobileNav({ role, clientsCount }: MobileNavProps) {
  const { t } = useTranslation('menu');
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => {
    if (!sheetOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setSheetOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sheetOpen]);

  // Свайп вниз по «ручке» закрывает шит — на телефоне это ожидаемый жест,
  // и без него панель ощущается как десктопная модалка, приехавшая снизу.
  const startY = useRef<number | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const onTouchStart = (e: React.TouchEvent) => { startY.current = e.touches[0].clientY; };
  const onTouchMove = (e: React.TouchEvent) => {
    if (startY.current === null || !panelRef.current) return;
    const dy = Math.max(0, e.touches[0].clientY - startY.current);
    panelRef.current.style.transform = `translateY(${dy}px)`;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (startY.current === null || !panelRef.current) return;
    const dy = e.changedTouches[0].clientY - startY.current;
    panelRef.current.style.transform = '';
    startY.current = null;
    if (dy > 90) setSheetOpen(false);
  };

  const visible = (item: NavEntry) => !item.owner || role === 'owner';
  // «Ещё» — всё, чего нет в нижней панели: разделы владельца, настройки, тариф.
  const rest = [...NAV, ...NAV_BOTTOM].filter(item => visible(item) && !TAB_KEY_SET.has(item.key));

  const badgeFor = (item: NavEntry) => {
    if (item.badge === 'clients' && clientsCount !== null) return String(clientsCount);
    if (item.badge === 'beta') return t('badge.beta');
    return null;
  };

  return (
    <>
      <nav className="mnav" aria-label={t('nav.dashboard')}>
        {TABS.map(item => {
          const badge = badgeFor(item);
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `mnav-item${isActive ? ' active' : ''}`}
            >
              <span className="mnav-icon">
                {item.icon}
                {badge && <span className="mnav-badge">{badge}</span>}
              </span>
              <span className="mnav-label">{t(`nav.${item.key}`)}</span>
            </NavLink>
          );
        })}

        <button
          type="button"
          className={`mnav-item${sheetOpen ? ' active' : ''}`}
          onClick={() => setSheetOpen(v => !v)}
          aria-expanded={sheetOpen}
        >
          <span className="mnav-icon">{MoreIcon}</span>
          <span className="mnav-label">{t('nav.more')}</span>
        </button>
      </nav>

      {sheetOpen && (
        <div className="msheet-overlay" onClick={() => setSheetOpen(false)}>
          <div
            ref={panelRef}
            className="msheet"
            role="dialog"
            aria-modal="true"
            onClick={e => e.stopPropagation()}
          >
            <div
              className="msheet-grip"
              onTouchStart={onTouchStart}
              onTouchMove={onTouchMove}
              onTouchEnd={onTouchEnd}
            >
              <span />
            </div>

            {/* Закрываем на всплытии клика, а не эффектом по смене пути: тап
                по разделу должен убирать шит и когда путь тот же (пользователь
                вернулся в раздел, из которого открыл «Ещё»). */}
            <div className="msheet-grid" onClick={() => setSheetOpen(false)}>
              {rest.map(item => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) => `msheet-item${isActive ? ' active' : ''}`}
                >
                  {item.icon}
                  <span>{t(`nav.${item.key}`)}</span>
                </NavLink>
              ))}
            </div>

            {/* Шит закрывается вместе с панелью аккаунтов: тап по «Профилю»
                уводит на страницу, а шит без этого оставался висеть поверх неё
                (клик по .msheet-grid сюда не доходит — это соседний блок). */}
            <div className="msheet-account">
              <UserMenu onNavigate={() => setSheetOpen(false)} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
