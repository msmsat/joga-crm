import { memo, useCallback, useEffect, useRef, useState, type MouseEvent } from 'react';
import { NavLink, matchPath, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { NAV, NAV_BOTTOM, JOURNAL_ENTRY, type NavEntry } from './navItems';
import { MobileMore } from './MobileMore';
import { useDockMotion, waveDots } from './dockMotion';

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
// панель и ПЕРЕТЕКАЕТ к новой вкладке, а не гаснет в одной и загорается в
// другой — так глаз ведёт за переходом. Как она движется и почему без
// framer-motion — в dockMotion.ts.
// «Ещё» — просто три точки, без подписи ни в каком состоянии: пока открыта
// панель, бусина-кружок стоит под точками, второй тап по ним закрывает. На
// разделе из «Ещё» (Финансы, Отчёты…) вкладки этого раздела внизу нет —
// бусина стоит на «Ещё», откуда в него пришли.

// Точки — не SVG: волну по HTML-элементам ведёт компоновщик, по узлам SVG —
// главный поток (waveDots в dockMotion.ts).
const Dots = (
  <span className="mnav-dots">
    <span className="mnav-dot" />
    <span className="mnav-dot" />
    <span className="mnav-dot" />
  </span>
);

// Переход — ПОСЛЕ первого кадра движения. Тап сначала отдаёт компоновщику
// анимацию дока, и только потом React начинает собирать новую страницу:
// иначе её раскладка шла в одной задаче с тапом и бусина трогалась с места,
// когда страница уже готова.
const afterPaint = (fn: () => void) => requestAnimationFrame(() => setTimeout(fn, 0));

// Обычный тап; с модификатором ссылку открывает браузер (новая вкладка).
const plainClick = (e: MouseEvent) => e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;

export interface MobileNavProps {
  role: string | null;
  clientsCount: number | null;
}

type Phase = 'closed' | 'open' | 'leaving';

export const MobileNav = memo(function MobileNav({ role, clientsCount }: MobileNavProps) {
  const { t, i18n } = useTranslation('menu');
  const location = useLocation();
  const { pathname } = location;
  const navigate = useNavigate();
  const dockRef = useRef<HTMLDivElement>(null);
  const moreRef = useRef<HTMLButtonElement>(null);
  // Три состояния, а не флаг: закрытая панель ещё ~0,3 с уезжает вправо, и всё
  // это время её надо держать видимой.
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

  // Подстраховка к концу анимации ухода (drawerMotion.ts): в свёрнутой вкладке
  // браузера она может не доиграть вовремя.
  useEffect(() => {
    if (phase !== 'leaving') return;
    const id = window.setTimeout(closed, 450);
    return () => window.clearTimeout(id);
  }, [phase, closed]);

  // Панель «Ещё» ставится в документ заранее, в простое после загрузки, и
  // дальше только прячется: первая вставка (шрифты, стили сотни узлов) стоила
  // до 100 мс, и именно её палец ждал на первом открытии. На десктопе панель
  // display: none — там она обходится одним рендером React.
  const [moreReady, setMoreReady] = useState(false);
  useEffect(() => {
    if (window.requestIdleCallback) {
      const id = window.requestIdleCallback(() => setMoreReady(true), { timeout: 2500 });
      return () => window.cancelIdleCallback(id);
    }
    // Safari без requestIdleCallback: после того как страница успокоится.
    const id = window.setTimeout(() => setMoreReady(true), 1200);
    return () => window.clearTimeout(id);
  }, []);

  // Бусина едет в кадр тапа, а не когда новый раздел соберётся: роутер держит
  // прежний адрес, пока страница рендерится в переходе (startTransition), и
  // без этого палец ждал бы отклика. Цель живёт, пока адрес тот же, с
  // которого ушли.
  const [pending, setPending] = useState<{ key: string; from: string } | null>(null);
  if (pending && pending.from !== pathname) setPending(null);
  const target = pending?.from === pathname ? pending.key : undefined;
  const mark = useCallback((key: string) => { setPending({ key, from: pathname }); close(); }, [pathname, close]);

  const here = `${location.pathname}${location.search}${location.hash}`;
  const follow = useCallback((to: string) => {
    // Тап по разделу, где уже стоишь, — замена записи, как у самой NavLink.
    const replace = here === to;
    afterPaint(() => navigate(to, { replace }));
  }, [here, navigate]);

  // Стабильная между открытием и закрытием «Ещё»: от неё зависит, будет ли
  // список панели перерисовываться на каждой смене фазы.
  const onMoreNavigate = useCallback((to?: string) => {
    mark(MORE);
    if (to) follow(to);
  }, [mark, follow]);

  const onTab = (e: MouseEvent, item: NavEntry) => {
    if (!plainClick(e)) return;
    e.preventDefault();
    mark(item.key);
    follow(item.to);
  };

  const onMore = () => {
    waveDots(moreRef.current);
    setPhase(p => (p === 'open' ? 'leaving' : 'open'));
  };

  const routeKey = TABS.find(item => matchPath({ path: item.to, end: !!item.end }, pathname))?.key;
  const beadKey = open ? MORE : target ?? routeKey ?? MORE;
  useDockMotion(dockRef, beadKey, i18n.language);

  const badgeFor = (item: NavEntry) => {
    if (item.badge === 'clients' && clientsCount !== null) return String(clientsCount);
    if (item.badge === 'beta') return t('badge.beta');
    return null;
  };

  return (
    <>
      <nav className="mnav" aria-label={t('nav.dashboard')}>
        <div className="mnav-dock" ref={dockRef}>
          {/* Бусина — слоями под вкладками, см. dockMotion.ts. */}
          <span className="mnav-bead" aria-hidden="true">
            <span className="mnav-bead-glow" />
            <span className="mnav-bead-mid" />
            <span className="mnav-bead-cap-l" />
            <span className="mnav-bead-cap-r" />
            <span className="mnav-bead-glint"><span /></span>
          </span>

          {TABS.map(item => {
            const label = t(`nav.${item.key}`);
            const badge = badgeFor(item);
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                data-key={item.key}
                onClick={e => onTab(e, item)}
                aria-label={label}
                className={`mnav-item${beadKey === item.key ? ' is-on' : ''}`}
              >
                {/* group — едет к новому месту (FLIP), inner — сжимается под
                    пальцем: два transform на разных слоях не спорят. */}
                <span className="mnav-group">
                  <span className="mnav-inner">
                    <span className="mnav-icon">
                      {/* Две копии иконки — приглушённая и тёмная «на бусине»
                          поверх неё, проявляется прозрачностью: перекраска
                          цвета шла бы главным потоком. */}
                      <span className="mnav-ink">{item.icon}</span>
                      <span className="mnav-ink is-lit">{item.icon}</span>
                      {badge && <span className="mnav-badge">{badge}</span>}
                    </span>
                    <span className="mnav-label" aria-hidden="true">{label}</span>
                  </span>
                </span>
              </NavLink>
            );
          })}

          {/* Панель выезжает ПОД доком, поэтому «Ещё» остаётся под тем же
              пальцем: второй тап по тем же точкам закрывает. */}
          <button
            ref={moreRef}
            type="button"
            data-key={MORE}
            className={`mnav-item mnav-more${beadKey === MORE ? ' is-on' : ''}${open ? ' is-open' : ''}`}
            onClick={onMore}
            aria-expanded={open}
            aria-label={open ? t('common:buttons.close') : t('nav.more')}
          >
            <span className="mnav-group">
              <span className="mnav-inner">
                <span className="mnav-icon">
                  <span className="mnav-ink">{Dots}</span>
                  <span className="mnav-ink is-lit">{Dots}</span>
                </span>
              </span>
            </span>
          </button>
        </div>
      </nav>

      {(moreReady || phase !== 'closed') && (
        <MobileMore
          role={role}
          tabKeys={TAB_KEY_SET}
          phase={phase}
          onClose={close}
          onNavigate={onMoreNavigate}
          onClosed={closed}
        />
      )}
    </>
  );
});
