import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent, type RefObject } from 'react';
import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { NAV, NAV_BOTTOM, type NavEntry } from './navItems';
import { UserMenu } from './UserMenu';
import { useDrawerSwipe } from './drawerSwipe';
import { useDrawerMotion } from './drawerMotion';

// ─── ПАНЕЛЬ «ЕЩЁ» ────────────────────────────────────────────────────────────
// Девять одинаковых плиток — девять одинаково важных действий: глазу не за что
// зацепиться, и меню приходится прочитывать целиком. Ищем среди ТРЁХ смысловых
// групп, а не среди девяти объектов; с ростом числа разделов сетка ломается, а
// группы — нет. Внутри первой — крупные плитки (в них ходят каждый день), в
// остальных компактные строки с пояснением из menu:subtitles.<key> — тех же
// слов, что и подзаголовок самого раздела. Пояснение заодно отвечает на «чем
// „искра“ в шапке отличается от Velora AI в меню»: там чат ассистента, здесь
// раздел с агентами и автоответами.
const GROUPS: { title: string; keys: string[]; tiles?: boolean }[] = [
  { title: 'more.business', keys: ['staff', 'catalog', 'finances', 'reports'], tiles: true },
  { title: 'more.comms', keys: ['loyalty', 'booking', 'notifications'] },
  { title: 'brand.product', keys: ['ai', 'billing'] },
];

const Chevron = (
  <svg className="mdrawer-row-chev" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="9 6 15 12 9 18" />
  </svg>
);

// Порядковый номер для каскада появления: строки въезжают вслед за панелью
// одна за другой, а не всем списком разом (drawerMotion.ts читает --i).
const nth = (i: number) => ({ '--i': i }) as CSSProperties;

function groupsFor(role: string | null, tabKeys: Set<string>) {
  const visible = (item: NavEntry) => !item.owner || role === 'owner';
  // «Ещё» — всё, чего нет в нижней панели: разделы владельца, тариф, ассистент.
  const rest = [...NAV, ...NAV_BOTTOM].filter(item => visible(item) && !tabKeys.has(item.key));
  const byKey = new Map(rest.map(item => [item.key, item]));
  const listed = new Set(GROUPS.flatMap(g => g.keys));
  // Раздел, который завели в navItems и забыли расписать по группам, падает в
  // последнюю: строка не в той группе видна глазами, пропавший раздел — нет.
  // Группа без единого доступного роли раздела не рисуется вовсе — у тренера и
  // администратора от «Бизнеса» не остаётся ничего.
  return GROUPS.map((g, i) => ({
    title: g.title,
    tiles: g.tiles,
    items: [
      ...g.keys.map(k => byKey.get(k)).filter((x): x is NavEntry => !!x),
      ...(i === GROUPS.length - 1 ? rest.filter(x => !listed.has(x.key)) : []),
    ],
  })).filter(g => g.items.length > 0);
}

export interface MobileMoreProps {
  role: string | null;
  /** Ключи разделов, которые уже стоят вкладками нижней панели. */
  tabKeys: Set<string>;
  /**
   * Панель смонтирована заранее и живёт всегда (MobileNav): закрытая спрятана
   * content-visibility, открытие — смена класса и анимации на готовых узлах
   * (drawerMotion.ts), а не вставка сотни узлов в кадр тапа: первая вставка
   * со шрифтами и стилями стоила до 100 мс на ровном месте.
   */
  phase: 'closed' | 'open' | 'leaving';
  onClose: () => void;
  /**
   * Тап по разделу: панель закрывается, а бусина дока остаётся на «Ещё».
   * С адресом — переход делает док, после первого кадра ухода панели (иначе
   * уход ждал бы, пока соберётся новая страница). Без адреса ссылка уже
   * перешла сама (профиль в меню аккаунта). Ссылка должна быть стабильной:
   * от неё зависит, перерисуется ли список на смене фазы.
   */
  onNavigate: (to?: string) => void;
  onClosed: () => void;
}

export function MobileMore({ role, tabKeys, phase, onClose, onNavigate, onClosed }: MobileMoreProps) {
  const { t } = useTranslation('menu');
  const swipe = useDrawerSwipe(onClose);
  const layerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const groups = useMemo(() => groupsFor(role, tabKeys), [role, tabKeys]);
  const total = groups.reduce((n, g) => n + 1 + g.items.length, 0);

  // Прогрев: смонтированная заранее панель один раз раскладывается за краем
  // экрана (шрифты, стили, раскладка), и только потом её прячет
  // content-visibility — та хранит готовое. Без прогрева всё это считалось
  // бы на первом открытии, под пальцем.
  const [warm, setWarm] = useState(phase === 'closed');
  useEffect(() => {
    if (!warm) return;
    let id = requestAnimationFrame(() => { id = requestAnimationFrame(() => setWarm(false)); });
    return () => cancelAnimationFrame(id);
  }, [warm]);

  // Меню аккаунта при каждом открытии — свёрнутое, как было при монтировании
  // панели заново (ключ меняется в том же рендере, без лишнего прохода).
  const [seen, setSeen] = useState(phase);
  const [generation, setGeneration] = useState(0);
  if (seen !== phase) {
    setSeen(phase);
    if (phase === 'open') setGeneration(g => g + 1);
  }

  // Открытие — с чистого листа: список с начала, без следов прошлого свайпа
  // (уход по свайпу оставляет --swipe и --swipe-x, чтобы улететь с места).
  // Эффект объявлен раньше useDrawerMotion — следы стёрты до старта анимаций.
  useLayoutEffect(() => {
    if (phase !== 'open') return;
    const scrim = layerRef.current?.querySelector<HTMLElement>(':scope > .mdrawer-scrim');
    const panel = panelRef.current;
    if (bodyRef.current) bodyRef.current.scrollTop = 0;
    if (scrim) {
      scrim.style.removeProperty('--swipe');
      delete scrim.dataset.dragging;
    }
    if (panel) {
      panel.style.removeProperty('--swipe-x');
      panel.style.transition = '';
      panel.style.transform = '';
    }
  }, [phase]);
  useDrawerMotion(layerRef, panelRef, phase, onClosed);

  return (
    // Слой — этажом НИЖЕ дока (.mnav): затемнение ложится на весь экран, а док
    // остаётся над ним живым, поэтому «Ещё» закрывается вторым тапом по той же
    // кнопке. Затемнение и панель — соседи, а не родитель и ребёнок: прозрачность
    // затемнения (оно гаснет вслед за пальцем при свайпе) не должна гасить панель.
    <div ref={layerRef} className={`mdrawer-layer is-${phase}${warm && phase === 'closed' ? ' is-warming' : ''}`}>
      <div className="mdrawer-scrim" onClick={onClose} />
      <aside
        {...swipe}
        // Уходящая панель ещё под пальцем, но тап по ней уже ничего не выбирает.
        // Перехват клика, а не pointer-events: то наследуется и пересчитывало бы
        // стили всей панели в кадр закрытия.
        onClickCapture={e => {
          if (phase !== 'open') { e.preventDefault(); e.stopPropagation(); return; }
          swipe.onClickCapture(e);
        }}
        ref={panelRef}
        className="mdrawer"
        role="dialog"
        aria-label={t('more.title')}
      >
        <MoreList groups={groups} bodyRef={bodyRef} onClose={onClose} onNavigate={onNavigate} />

        {/* Аккаунт закреплён у нижнего края и в прокрутку списка не уходит:
            профиль, смена студии и выход должны быть на одном месте, каким
            бы длинным ни стал список разделов. Кнопка остаётся внизу, меню
            раскрывается ВВЕРХ поверх разделов (.user-menu-panel и так
            absolute + bottom: 100% — блок вынесен из .mdrawer-body, чтобы
            его не срезал скролл).
            Панель закрывается вместе с меню аккаунтов: тап по «Профилю»
            уводит на страницу, а панель без этого оставалась бы висеть
            поверх неё (клик по группам сюда не доходит — соседний блок). */}
        <div className="mdrawer-account" style={nth(total)}>
          <UserMenu key={generation} onNavigate={onNavigate} />
        </div>
      </aside>
    </div>
  );
}

interface MoreListProps {
  groups: ReturnType<typeof groupsFor>;
  bodyRef: RefObject<HTMLDivElement | null>;
  onClose: () => void;
  onNavigate: (to?: string) => void;
}

// Шапка и разделы — отдельно и под memo: на открытии и закрытии меняется
// только фаза, и перерисовывать ради неё два десятка ссылок с переводами
// (≈20 мс при CPU ×4 одних t()) было бы платой за тап на ровном месте.
const MoreList = memo(function MoreList({ groups, bodyRef, onClose, onNavigate }: MoreListProps) {
  const { t } = useTranslation('menu');

  // Номер в каскаде: заголовок группы, затем её разделы, затем следующая группа.
  const starts = groups.map((_, gi) => groups.slice(0, gi).reduce((n, g) => n + 1 + g.items.length, 0));

  const follow = (e: MouseEvent, to: string) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    onNavigate(to);
  };

  const tile = (item: NavEntry, i: number) => (
    <NavLink
      key={item.to}
      to={item.to}
      end={item.end}
      onClick={e => follow(e, item.to)}
      style={nth(i)}
      className={({ isActive }) => `mdrawer-tile${isActive ? ' active' : ''}`}
    >
      <span className="mdrawer-glyph">{item.icon}</span>
      <span className="mdrawer-tile-label">{t(`nav.${item.key}`)}</span>
    </NavLink>
  );

  const row = (item: NavEntry, i: number) => (
    <NavLink
      key={item.to}
      to={item.to}
      end={item.end}
      onClick={e => follow(e, item.to)}
      style={nth(i)}
      className={({ isActive }) => `mdrawer-row${isActive ? ' active' : ''}`}
    >
      <span className="mdrawer-glyph">{item.icon}</span>
      <span className="mdrawer-row-text">
        <span className="mdrawer-row-label">{t(`nav.${item.key}`)}</span>
        <span className="mdrawer-row-sub">{t(`subtitles.${item.key}`)}</span>
      </span>
      {Chevron}
    </NavLink>
  );

  return (
    <>
      <div className="mdrawer-head">
        <span className="mdrawer-title">{t('more.title')}</span>
        <button type="button" className="mdrawer-close" onClick={onClose} aria-label={t('common:buttons.close')}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      <div className="mdrawer-body" ref={bodyRef}>
        {/* Тап по разделу закрывает панель сам (follow), а не эффект по
            смене пути: панель должна уходить и когда путь тот же (человек
            вернулся в раздел, из которого открыл «Ещё»). Тап мимо разделов —
            по заголовку группы, между строками — тоже закрывает. */}
        <div onClick={e => { if (!(e.target as Element).closest('a')) onClose(); }}>
          {groups.map((g, gi) => (
            <section key={g.title} className="mdrawer-group">
              <h3 className="mdrawer-gtitle" style={nth(starts[gi])}>{t(g.title)}</h3>
              <div className={g.tiles ? 'mdrawer-tiles' : 'mdrawer-rows'}>
                {g.items.map((item, j) => (g.tiles ? tile : row)(item, starts[gi] + 1 + j))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </>
  );
});
