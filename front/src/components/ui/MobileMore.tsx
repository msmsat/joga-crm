import type { CSSProperties } from 'react';
import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { NAV, NAV_BOTTOM, type NavEntry } from './navItems';
import { UserMenu } from './UserMenu';
import { useDrawerSwipe } from './drawerSwipe';

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
// одна за другой, а не всем списком разом.
const nth = (i: number) => ({ '--i': i }) as CSSProperties;

export interface MobileMoreProps {
  role: string | null;
  /** Ключи разделов, которые уже стоят вкладками нижней панели. */
  tabKeys: Set<string>;
  leaving: boolean;
  onClose: () => void;
  /** Тап по разделу: панель закрывается, а бусина дока остаётся на «Ещё». */
  onNavigate: () => void;
  onClosed: () => void;
}

export function MobileMore({ role, tabKeys, leaving, onClose, onNavigate, onClosed }: MobileMoreProps) {
  const { t } = useTranslation('menu');
  const swipe = useDrawerSwipe(onClose);

  const visible = (item: NavEntry) => !item.owner || role === 'owner';
  // «Ещё» — всё, чего нет в нижней панели: разделы владельца, тариф, ассистент.
  const rest = [...NAV, ...NAV_BOTTOM].filter(item => visible(item) && !tabKeys.has(item.key));
  const byKey = new Map(rest.map(item => [item.key, item]));
  const listed = new Set(GROUPS.flatMap(g => g.keys));
  // Раздел, который завели в navItems и забыли расписать по группам, падает в
  // последнюю: строка не в той группе видна глазами, пропавший раздел — нет.
  // Группа без единого доступного роли раздела не рисуется вовсе — у тренера и
  // администратора от «Бизнеса» не остаётся ничего.
  const groups = GROUPS.map((g, i) => ({
    title: g.title,
    tiles: g.tiles,
    items: [
      ...g.keys.map(k => byKey.get(k)).filter((x): x is NavEntry => !!x),
      ...(i === GROUPS.length - 1 ? rest.filter(x => !listed.has(x.key)) : []),
    ],
  })).filter(g => g.items.length > 0);

  // Номер в каскаде: заголовок группы, затем её разделы, затем следующая группа.
  const starts = groups.map((_, gi) => groups.slice(0, gi).reduce((n, g) => n + 1 + g.items.length, 0));
  const total = groups.reduce((n, g) => n + 1 + g.items.length, 0);

  const tile = (item: NavEntry, i: number) => (
    <NavLink
      key={item.to}
      to={item.to}
      end={item.end}
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
    // Слой — этажом НИЖЕ дока (.mnav): затемнение ложится на весь экран, а док
    // остаётся над ним живым, поэтому «Ещё» закрывается вторым тапом по той же
    // кнопке. Затемнение и панель — соседи, а не родитель и ребёнок: прозрачность
    // затемнения (оно гаснет вслед за пальцем при свайпе) не должна гасить панель.
    <div
      className={`mdrawer-layer${leaving ? ' is-leaving' : ''}`}
      onAnimationEnd={e => { if (e.animationName === 'mdrawer-out') onClosed(); }}
    >
      <div className="mdrawer-scrim" onClick={onClose} />
      <aside
        {...swipe}
        className="mdrawer"
        role="dialog"
        aria-label={t('more.title')}
      >
        <div className="mdrawer-head">
          <span className="mdrawer-title">{t('more.title')}</span>
          <button type="button" className="mdrawer-close" onClick={onClose} aria-label={t('common:buttons.close')}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="mdrawer-body">
          {/* Закрываем на всплытии клика, а не эффектом по смене пути: тап
              по разделу должен убирать панель и когда путь тот же (человек
              вернулся в раздел, из которого открыл «Ещё»). */}
          <div onClick={e => ((e.target as Element).closest('a') ? onNavigate : onClose)()}>
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
          <UserMenu onNavigate={onNavigate} />
        </div>
      </aside>
    </div>
  );
}
