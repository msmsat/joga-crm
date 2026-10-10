import { useState, type CSSProperties, type Ref } from 'react';
import { useTranslation } from 'react-i18next';
import type { NavItem } from './navItems';
import NavGlyph from './NavGlyph';

type Props = {
  active: string;
  onSelect: (tab: string) => void;
  /** Разделы для этой студии — решает App (см. `visibleNavItems`). */
  items: NavItem[];
  /** Капсула: на свайпе разделов линза едет за пальцем (lib/pageSlider.ts
   *  пишет ей `--dock-i` напрямую, минуя рендер). */
  ref?: Ref<HTMLElement>;
};

/**
 * Плавающая капсула навигации — поднос и камень на нём. Поднос: фарфоровый
 * (в тёмной теме графитовый) обод и вырезанное в нём ложе. Камень — линза
 * текущего раздела: матовый дымчатый обсидиан (в тёмной теме — кварц), а не
 * цвет студии; студия остаётся в нём тёплым отсветом. Материалы и свет —
 * токены --dock-* и --lens-* в index.css.
 *
 * ── Заливка живёт в линзе ──────────────────────────────────────────────────
 *
 * Рядов два, и они лежат друг на друге клетка в клетку. Нижний — кнопки:
 * контурные иконки, серые подписи. Верхний — тот же ряд залитым и жемчужным, и
 * он целиком внутри камня, обрезанный его формой. Поэтому залито ровно
 * то, что под линзой: линза съехала с иконки наполовину — иконка залита
 * наполовину, ушла совсем — иконка снова контурная. Налив и слив — это сам
 * край линзы, а не отдельная анимация, которая могла бы с ним разойтись.
 *
 * Линза едет вбок на N своих ширин, ряд внутри неё — на те же N ширин обратно,
 * с той же длительностью и кривой, поэтому иконки стоят на месте, а движется
 * только окно. На ходу линза вытягивается каплей; ряд сжимается обратно ровно
 * настолько же, чтобы иконки не плыли. Отражения на камне привязаны к этому
 * же ряду, то есть к капсуле, а не к камню: камень едет — блики скользят по нему.
 *
 * ПРОИЗВОДИТЕЛЬНОСТЬ — почему сделано именно так:
 *
 * 1. Только CSS и только transform — всё движение идёт на видеокарте и не ждёт
 *    главного потока, который в кадре тапа занят новым разделом. Никаких
 *    замеров и framer: layoutId будил бы проекцию framer, а покадровый JS
 *    делил бы кадр с React. Отсюда и был прежний лаг.
 * 2. Ширины кнопок постоянные — сетка на равные доли, подписи видны у всех
 *    пунктов сразу, поэтому раскладка при переключении не меняется вовсе.
 * 3. Никакого backdrop-filter: у закреплённого элемента над прокруткой размытие
 *    перерисовывается каждый кадр прокрутки. «Лёгкость» здесь даёт поверхность
 *    с бликом по кромке и парящей тенью, а не полупрозрачность.
 */
export default function BottomNav({ active, onSelect, items, ref }: Props) {
  const { t } = useTranslation();
  const index = items.findIndex((item) => item.id === active);

  // Переезды линзы. Капля проигрывается на каждый переезд и ни разу — при
  // первом показе приложения. Перезапуск — сменой имени анимации (a ↔ b), а не
  // перемонтированием: внутри линзы едет ряд, и новый узел встал бы на место
  // сразу, без перехода, разойдясь с линзой. Правка состояния в рендере —
  // штатный приём React для «значения с прошлого рендера».
  const [shownIndex, setShownIndex] = useState(index);
  const [moves, setMoves] = useState(0);
  if (index !== shownIndex) {
    setShownIndex(index);
    setMoves(moves + 1);
  }
  const drop = moves === 0 ? undefined : moves % 2 ? 'a' : 'b';

  return (
    /* absolute, а не fixed: `fixed` привязывает низ капсулы к ОКНУ БРАУЗЕРА, а
       окно меняет высоту каждый раз, когда Safari или вебвью Instagram прячет
       и показывает свою нижнюю панель, — капсула ездила вслед за ней на каждом
       жесте. Здесь низ отмеряется от рамы `.app-shell` (App.tsx), которая
       следует за доступной высотой (lib/appHeight.ts) и сохраняется при
       клавиатуре. Рама лежит СНАРУЖИ прокрутки, поэтому вверх вместе
       с содержимым капсула не уедет. */
    /* Отступ снизу одним объявлением: `pb-safe` рядом с `pb-4` перебивал его
       и капсула ложилась на самую кромку экрана. Сам расчёт — `--nav-offset`
       в index.css: зазор плюс безопасная зона, в том числе та, что сообщает
       Telegram (в его вебвью голый env() — ноль). Там же `--nav-h` — держать
       в паре с высотой кнопок (`.dock-cell`). */
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 px-4 pb-[var(--nav-offset)]">
      <nav
        ref={ref}
        className="dock"
        style={{ '--dock-n': items.length, '--dock-i': Math.max(index, 0) } as CSSProperties}
      >
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-current={item.id === active ? 'page' : undefined}
            onClick={() => onSelect(item.id)}
            className="dock-cell dock-tab"
          >
            <NavGlyph icon={item.icon} solid={item.solid} filled={false} />
            <span className="dock-label">{t(item.labelKey)}</span>
          </button>
        ))}

        {/* Раздела нет в меню (например, «Клуб» выключили, пока он открыт) —
            линза гаснет, а не встаёт на чужую вкладку. Нажатия проходят сквозь
            неё к кнопкам. */}
        <span className="dock-lens" data-hidden={index < 0 || undefined} aria-hidden="true">
          <span className="dock-lens-body" data-drop={drop}>
            <span className="dock-lens-ink">
              <span className="dock-lens-row">
                {items.map((item) => (
                  <span key={item.id} className="dock-cell">
                    <NavGlyph icon={item.icon} solid={item.solid} filled />
                    <span className="dock-label">{t(item.labelKey)}</span>
                  </span>
                ))}
              </span>
            </span>
          </span>
        </span>
      </nav>
    </div>
  );
}
