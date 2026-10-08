import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { NavLink, matchPath, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion, useReducedMotion, type Transition } from 'framer-motion';
import { NAV, NAV_BOTTOM, JOURNAL_ENTRY, type NavEntry } from './navItems';
import { MobileMore } from './MobileMore';

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
const MORE = 'more';

// ─── ДОК ─────────────────────────────────────────────────────────────────────
// Ониксовая капсула над краем экрана. Подпись есть только у ТЕКУЩЕГО раздела:
// персиковая «бусина» под ним раскрывается в иконку с названием, остальные —
// иконки. Пять подписей по 9px читались хуже, чем одна крупная: человек всегда
// видит, где он, а куда ещё можно — говорят знакомые значки. Бусина одна на всю
// панель (общий layoutId) и ПЕРЕТЕКАЕТ к новой вкладке, а не гаснет в одной и
// загорается в другой — так глаз ведёт за переходом.
// Пока открыта панель «Ещё», бусина стоит на «Ещё», три точки сворачиваются в
// крестик, а подпись становится «Закрыть»: второй тап по той же кнопке — и
// есть способ закрыть. На разделе из «Ещё» (Финансы, Отчёты…) вкладки этого
// раздела внизу нет — бусина стоит на «Ещё», откуда в него пришли.
const SPRING: Transition = { type: 'spring', visualDuration: 0.42, bounce: 0.22 };
// Подпись проявляется, когда бусина уже подъехала под неё, а не раньше.
const LABEL_IN: Transition = { duration: 0.24, delay: 0.2, ease: [0.2, 0.8, 0.2, 1] };
const INSTANT: Transition = { duration: 0 };

// Три точки, которые сворачиваются в крестик: крайние съезжаются в центр и
// гаснут, штрихи креста прорисовываются поверх (stroke-dashoffset, App.css).
const MoreGlyph = (
  <svg className="nav-icon mnav-moreglyph" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <circle className="mnav-dot mnav-dot-l" cx="5" cy="12" r="1.7" fill="currentColor" stroke="none" />
    <circle className="mnav-dot mnav-dot-c" cx="12" cy="12" r="1.7" fill="currentColor" stroke="none" />
    <circle className="mnav-dot mnav-dot-r" cx="19" cy="12" r="1.7" fill="currentColor" stroke="none" />
    <path className="mnav-cross mnav-cross-a" d="M7 7l10 10" pathLength={1} />
    <path className="mnav-cross mnav-cross-b" d="M17 7L7 17" pathLength={1} />
  </svg>
);

export interface MobileNavProps {
  role: string | null;
  clientsCount: number | null;
}

type Phase = 'closed' | 'open' | 'leaving';

export function MobileNav({ role, clientsCount }: MobileNavProps) {
  const { t } = useTranslation('menu');
  const { pathname } = useLocation();
  const reduce = useReducedMotion();
  // Три состояния, а не флаг: закрытая панель ещё ~0,3 с уезжает вправо, и всё
  // это время её надо держать на экране.
  const [phase, setPhase] = useState<Phase>('closed');
  const open = phase === 'open';

  const close = useCallback(() => setPhase(p => (p === 'open' ? 'leaving' : p)), []);
  const closed = useCallback(() => setPhase(p => (p === 'leaving' ? 'closed' : p)), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close]);

  // Подстраховка к animationend: событие не придёт, если анимацию сняли
  // (свернули вкладку браузера, повернули экран в планшетную ширину).
  useEffect(() => {
    if (phase !== 'leaving') return;
    const id = window.setTimeout(closed, 450);
    return () => window.clearTimeout(id);
  }, [phase, closed]);

  // Бусина едет в кадр тапа, а не когда новый раздел догрузится: роутер держит
  // прежний адрес, пока ленивая страница не готова, и без этого палец ждал бы
  // отклика полсекунды. Цель живёт, пока адрес тот же, с которого ушли.
  const [pending, setPending] = useState<{ key: string; from: string } | null>(null);
  if (pending && pending.from !== pathname) setPending(null);
  const target = pending?.from === pathname ? pending.key : undefined;
  const go = (key: string) => { setPending({ key, from: pathname }); close(); };

  const routeKey = TABS.find(item => matchPath({ path: item.to, end: !!item.end }, pathname))?.key;
  const beadKey = open ? MORE : target ?? routeKey ?? MORE;
  const spring = reduce ? INSTANT : SPRING;

  const badgeFor = (item: NavEntry) => {
    if (item.badge === 'clients' && clientsCount !== null) return String(clientsCount);
    if (item.badge === 'beta') return t('badge.beta');
    return null;
  };

  // Содержимое кнопки одинаково у вкладок и у «Ещё»: капсула, бусина под ней
  // (только у выбранной), иконка и подпись. layout у капсулы — ширина меняется
  // плавно, layout="position" у детей — текст и иконка не растягиваются, пока
  // капсула растёт.
  const pill = (key: string, icon: ReactNode, label: string, badge: string | null) => {
    const on = beadKey === key;
    return (
      <motion.span layout transition={spring} className="mnav-pill">
        {on && <motion.span layoutId="mnav-bead" transition={spring} className="mnav-bead" style={{ borderRadius: 24 }} />}
        <motion.span layout="position" transition={spring} className="mnav-icon">
          {icon}
          {badge && <span className="mnav-badge">{badge}</span>}
        </motion.span>
        {on && (
          <motion.span
            key={label}
            layout="position"
            className="mnav-label"
            initial={reduce ? false : { opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={reduce ? INSTANT : { ...LABEL_IN, layout: spring }}
          >
            {label}
          </motion.span>
        )}
      </motion.span>
    );
  };

  const moreLabel = open ? t('common:buttons.close') : t('nav.more');

  return (
    <>
      <nav className="mnav" aria-label={t('nav.dashboard')}>
        <div className="mnav-dock">
          {TABS.map(item => {
            const label = t(`nav.${item.key}`);
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                onClick={() => go(item.key)}
                aria-label={label}
                className={`mnav-item${beadKey === item.key ? ' is-on' : ''}`}
              >
                {pill(item.key, item.icon, label, badgeFor(item))}
              </NavLink>
            );
          })}

          {/* Панель выезжает ПОД доком, поэтому «Ещё» остаётся под тем же
              пальцем: второй тап по той же кнопке закрывает. */}
          <button
            type="button"
            className={`mnav-item${beadKey === MORE ? ' is-on' : ''}${open ? ' is-open' : ''}`}
            onClick={() => setPhase(p => (p === 'open' ? 'leaving' : 'open'))}
            aria-expanded={open}
            aria-label={moreLabel}
          >
            {pill(MORE, MoreGlyph, moreLabel, null)}
          </button>
        </div>
      </nav>

      {phase !== 'closed' && (
        <MobileMore
          role={role}
          tabKeys={TAB_KEY_SET}
          leaving={phase === 'leaving'}
          onClose={close}
          onNavigate={() => go(MORE)}
          onClosed={closed}
        />
      )}
    </>
  );
}
