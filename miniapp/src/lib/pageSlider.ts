import { flushSync } from 'react-dom';
import {
  PAGE_EASE, PAGE_SLIDE_MS, RELEASE_EASE, SWIPE_AXIS_RATIO, SWIPE_SLOP_PX,
  releaseDuration, rubberBand, shouldComplete, velocityOf, type Sample,
} from './pager';

type Box<T> = { readonly current: T | null };

/** Куда едет лента — для меню: линза встаёт на раздел в момент решения,
 *  а не когда страница доедет. */
export type SlideTarget = { from: string; to: string };

export type PageSliderConfig = {
  /** Колонка с разделами (`.tab-pane[data-tab]`, App.tsx). */
  column: Box<HTMLElement>;
  /** Прокручиваемое на телефоне (`.app-scroll`). */
  scroller: Box<HTMLElement>;
  /** Капсула меню (`.dock`, BottomNav): линза едет за пальцем. */
  dock: Box<HTMLElement>;
  /** Разделы ленты в порядке меню. */
  order: string[];
  /** Раздел на экране. */
  active: string;
  /** Листать можно: телефонная раскладка и кабинет открыт. */
  enabled: boolean;
  /** Собрать раздел, если его ещё нет в DOM, — синхронно (`flushSync`). */
  mount: (tab: string) => void;
  /** Переход решён: тап по меню или отпущенный свайп. */
  onSelect: (tab: string) => void;
  /** Раздел доехал — сделать его текущим. Зовётся внутри `flushSync`. */
  onCommit: (tab: string) => void;
};

/** Один проезд ленты: текущий раздел и сосед, который выезжает рядом. */
type Slide = {
  fromTab: string;
  from: HTMLElement;
  toTab: string | null;
  to: HTMLElement | null;
  /** С какой стороны сосед: 1 — справа (следующий), -1 — слева, 0 — ещё не ясно. */
  side: 1 | -1 | 0;
  width: number;
  /** Прокрутка на старте: сосед встаёт на эту высоту, то есть прямо в окно. */
  top: number;
  /** Сдвиг текущего раздела, px. */
  offset: number;
  /** Доводка и проезд по тапу — анимации, которые доезжают сами. */
  animations: Animation[];
  /** Ведение за пальцем: приостановленные анимации, которые палец перематывает. */
  scrubs: Map<HTMLElement, Animation>;
  /** Линза капсулы и залитый ряд в ней — их ведёт палец. */
  lens: HTMLElement[];
  /** Доводится до соседа, а не возвращается. */
  completing: boolean;
  done: boolean;
};

type Gesture = { id: number; x: number; y: number; locked: boolean; samples: Sample[] };

const tx = (x: number) => `translate3d(${x}px, 0, 0)`;

/** Сдвиг линзы и ряда внутри неё — те же формулы, что у `.dock-lens` и
 *  `.dock-lens-row` в index.css, только с дробной позицией. */
const lensShift = (position: number, count: number) => [
  `translateX(${position * 100}%)`,
  `translateX(${(-position * 100) / count}%)`,
];

/** Перемотка линзы: ход на соседа в каждую сторону — за это время, мс. */
const LENS_SCRUB_MS = 1000;

/** Откуда ленту не тянем: поля ввода и узлы со своим горизонтальным жестом. */
const NO_SWIPE = '[data-noswipe], input, textarea, select, [contenteditable="true"]';

/** Сколько после свайпа гасится «клик» под пальцем: отпускание на кнопке
 *  не должно её нажимать. */
const CLICK_GUARD_MS = 120;

/**
 * Ход, который палец перематывает: приостановленная линейная анимация от
 * `from` до `to`, позиция — её `currentTime`.
 *
 * Почему не запись transform в стиль на каждое движение: у такого узла Chrome
 * пересобирает слои (Layerize) каждый кадр — замерено при CPU ×4 ~4 мс на
 * кадр только на это, и палец «вёл» страницу рывками. Узел с анимацией
 * transform для компоновщика уже подвижный, и перемотка обходится без
 * пересборки: те же 20 кадров — 8 мс вместо 73–93.
 */
function scrubber(node: HTMLElement, from: string, to: string, duration: number): Animation {
  const animation = node.animate([{ transform: from }, { transform: to }], { duration, fill: 'both', easing: 'linear' });
  animation.pause();
  return animation;
}

/**
 * Лента разделов: свайп между ними и проезд по тапу в меню.
 *
 * Состояние React меняется ДВАЖДЫ за проезд — в момент решения (меню, `onTarget`)
 * и когда страница доехала (`onCommit`). Всё между ними — анимации в DOM в
 * обход React: за пальцем — перемотка приостановленных (`scrubber`), доводка и
 * тап — Web Animations на видеокарте. Главный поток в это время свободен, и
 * проезд не ждёт ни React, ни раскладки.
 *
 * Текущий раздел едет на своём месте в потоке; сосед показывается поверх
 * колонки (`data-peek`, index.css) на высоте текущей прокрутки — то есть в
 * окне, — и в поток встаёт уже после проезда, когда ничего не движется: тогда
 * же прокрутка уходит наверх. Тяжёлый кадр смены раздела приходится на момент,
 * когда смотреть уже не на что.
 */
export class PageSlider {
  private config: PageSliderConfig | null = null;
  private slide: Slide | null = null;
  private gesture: Gesture | null = null;
  private clickGuardUntil = 0;

  /** Куда едет лента (для меню), null — никуда. */
  private readonly onTarget: (target: SlideTarget | null) => void;

  constructor(onTarget: (target: SlideTarget | null) => void) {
    this.onTarget = onTarget;
  }

  configure(config: PageSliderConfig) {
    this.config = config;
  }

  /**
   * Тап по меню. `false` — проехать нельзя (десктоп, гость, раздел вне ленты,
   * просьба системы не анимировать): переключать мгновенно, как раньше.
   */
  go = (tab: string): boolean => {
    if (!this.config) return false;
    // Палец ещё тянет ленту — второй тап не перехватывает её.
    if (this.gesture?.locked) return true;
    // Прошлый проезд не доехал — довести сразу: новый начинается с того
    // раздела, куда вёл прошлый.
    if (this.slide) this.finish(this.slide, this.slide.completing);

    const { enabled, order, active } = this.config;
    if (!enabled || tab === active || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
    const from = order.indexOf(active);
    const to = order.indexOf(tab);
    const fromPane = this.pane(active);
    if (from < 0 || to < 0 || !fromPane) return false;

    const slide = this.begin(fromPane, active);
    if (!slide || !this.aim(slide, to > from ? 1 : -1, tab)) {
      if (slide) this.finish(slide, false);
      return false;
    }
    slide.completing = true;
    this.config.onSelect(tab);
    this.onTarget({ from: active, to: tab });
    this.run(slide, -slide.side * slide.width, PAGE_SLIDE_MS, PAGE_EASE);
    return true;
  };

  /** Раздел сменился мимо ленты (ссылка, оплата, вход): бросить проезд. */
  sync(active: string) {
    const slide = this.slide;
    if (!slide || slide.done || slide.fromTab === active) return;
    this.gesture = null;
    this.finish(slide, false);
  }

  /** Слушать касания. Возвращает отписку. */
  listen(): () => void {
    const options = { passive: true } as const;
    document.addEventListener('pointerdown', this.onDown, options);
    document.addEventListener('pointermove', this.onMove, options);
    document.addEventListener('pointerup', this.onUp, options);
    document.addEventListener('pointercancel', this.onCancel, options);
    document.addEventListener('click', this.onClick, true);
    return () => {
      document.removeEventListener('pointerdown', this.onDown);
      document.removeEventListener('pointermove', this.onMove);
      document.removeEventListener('pointerup', this.onUp);
      document.removeEventListener('pointercancel', this.onCancel);
      document.removeEventListener('click', this.onClick, true);
      this.gesture = null;
      if (this.slide) this.finish(this.slide, false);
    };
  }

  // ── Жест ────────────────────────────────────────────────────────────────

  /* Указатели, а не touch-события: их обработчики не задерживают прокрутку
     (touchmove без passive заставлял бы браузер ждать JS перед каждым
     вертикальным жестом). Вертикаль отдаёт браузеру `touch-action: pan-y` на
     колонке (index.css): начав прокрутку, он сам присылает pointercancel. */

  private onDown = (event: PointerEvent) => {
    const config = this.config;
    if (!config?.enabled || !event.isPrimary || this.gesture) return;
    const column = config.column.current;
    const target = event.target;
    if (!column || !(target instanceof Element) || !column.contains(target)) return;
    // Касание посреди проезда доводит его сразу: человек жмёт то, что уже
    // почти приехало, и нажатие должно попасть в эту страницу. Цель тапа
    // браузер ищет после отпускания пальца — к тому времени она уже текущая.
    if (this.slide) this.finish(this.slide, this.slide.completing);
    if (event.pointerType === 'mouse' || target.closest(NO_SWIPE)) return;
    if (config.order.length < 2 || !config.order.includes(config.active)) return;
    this.gesture = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      locked: false,
      samples: [{ x: event.clientX, t: event.timeStamp }],
    };
  };

  private onMove = (event: PointerEvent) => {
    const gesture = this.gesture;
    if (!gesture || event.pointerId !== gesture.id || !this.config) return;

    if (!gesture.locked) {
      const dx = event.clientX - gesture.x;
      const dy = event.clientY - gesture.y;
      if (Math.abs(dx) < SWIPE_SLOP_PX && Math.abs(dy) < SWIPE_SLOP_PX) return;
      // Вертикаль — прокрутка, она браузера.
      if (Math.abs(dx) < Math.abs(dy) * SWIPE_AXIS_RATIO) {
        this.gesture = null;
        return;
      }
      // Проезд, начатый уже после касания (тап по меню другим пальцем), —
      // довести: жест ведёт раздел, на который он приехал.
      if (this.slide) this.finish(this.slide, this.slide.completing);
      const { active } = this.config;
      const pane = this.pane(active);
      const slide = pane ? this.begin(pane, active) : null;
      if (!slide) {
        this.gesture = null;
        return;
      }
      gesture.locked = true;
      // Ход — от точки, где жест признан горизонтальным: иначе страница
      // прыгнула бы на величину порога.
      gesture.x = event.clientX;
      this.grab(slide);
    }

    const slide = this.slide;
    if (!slide) return;
    const dx = event.clientX - gesture.x;
    const side = dx < 0 ? 1 : dx > 0 ? -1 : slide.side;
    if (side !== 0 && side !== slide.side) this.aim(slide, side);
    // За крайним разделом — резинка, к соседу — ровно за пальцем, но не дальше него.
    this.follow(slide, slide.to ? Math.max(-slide.width, Math.min(slide.width, dx)) : rubberBand(dx, slide.width));

    gesture.samples.push({ x: event.clientX, t: event.timeStamp });
    if (gesture.samples.length > 12) gesture.samples.shift();
  };

  private onUp = (event: PointerEvent) => {
    const gesture = this.gesture;
    if (!gesture || event.pointerId !== gesture.id) return;
    this.gesture = null;
    const slide = this.slide;
    if (!gesture.locked || !slide || slide.done) return;

    this.clickGuardUntil = event.timeStamp + CLICK_GUARD_MS;
    const velocity = velocityOf(gesture.samples, event.timeStamp);
    const side = slide.side || 1;
    // Пройденная доля пути к соседу и скорость пальца к нему.
    const toward = slide.to ? (-slide.offset / slide.width) * side : 0;
    const speed = -velocity * side;
    const complete = slide.to !== null && shouldComplete(toward, speed);
    this.settle(slide, complete, complete ? speed : -speed);
  };

  private onCancel = (event: PointerEvent) => {
    const gesture = this.gesture;
    if (!gesture || event.pointerId !== gesture.id) return;
    this.gesture = null;
    if (gesture.locked && this.slide && !this.slide.done) this.settle(this.slide, false, 0);
  };

  private onClick = (event: MouseEvent) => {
    if (event.timeStamp > this.clickGuardUntil) return;
    const column = this.config?.column.current;
    if (column && event.target instanceof Node && column.contains(event.target)) {
      event.preventDefault();
      event.stopPropagation();
    }
  };

  // ── Лента ───────────────────────────────────────────────────────────────

  private pane(tab: string): HTMLElement | null {
    return this.config?.column.current?.querySelector<HTMLElement>(`:scope > .tab-pane[data-tab="${tab}"]`) ?? null;
  }

  private begin(from: HTMLElement, fromTab: string): Slide | null {
    const column = this.config?.column.current;
    if (!column) return null;
    const slide: Slide = {
      fromTab,
      from,
      toTab: null,
      to: null,
      side: 0,
      width: column.clientWidth,
      top: this.config?.scroller.current?.scrollTop ?? 0,
      offset: 0,
      animations: [],
      scrubs: new Map(),
      lens: [],
      completing: false,
      done: false,
    };
    from.setAttribute('data-sliding', '');
    this.slide = slide;
    return slide;
  }

  /** Жест признан горизонтальным: страница и линза переходят под палец. */
  private grab(slide: Slide) {
    const { width } = slide;
    slide.scrubs.set(slide.from, scrubber(slide.from, tx(-width), tx(width), 2 * width));
    const dock = this.config?.dock.current;
    if (!dock || !this.config) return;
    // Без перехода на время жеста (index.css): переход стиля перекрыл бы
    // анимации линзы — в каскаде он старше.
    dock.setAttribute('data-dragging', '');
    slide.lens = [...dock.querySelectorAll<HTMLElement>('.dock-lens, .dock-lens-row')];
    const index = this.config.order.indexOf(slide.fromTab);
    const count = this.config.order.length;
    const [before, after] = [lensShift(index - 1, count), lensShift(index + 1, count)];
    slide.lens.forEach((node, i) => slide.scrubs.set(node, scrubber(node, before[i], after[i], 2 * LENS_SCRUB_MS)));
  }

  /** Палец сдвинул ленту на `offset`: перемотать страницы и линзу. */
  private follow(slide: Slide, offset: number) {
    slide.offset = offset;
    const at = offset + slide.width;
    const fromScrub = slide.scrubs.get(slide.from);
    if (fromScrub) fromScrub.currentTime = at;
    const toScrub = slide.to && slide.scrubs.get(slide.to);
    if (toScrub) toScrub.currentTime = at;
    // Линза — на долю пути к соседу; у края ленты стоит.
    const share = slide.to ? -offset / slide.width : 0;
    for (const node of slide.lens) {
      const scrub = slide.scrubs.get(node);
      if (scrub) scrub.currentTime = (share + 1) * LENS_SCRUB_MS;
    }
  }

  /** Поставить соседа с нужной стороны (жест может сменить направление на
   *  ходу). Без `tab` — ближайший раздел меню; у края ленты соседа нет. */
  private aim(slide: Slide, side: 1 | -1, tab?: string): boolean {
    if (!this.config) return false;
    if (slide.to) this.unpeek(slide, slide.to);
    slide.side = side;
    const { order } = this.config;
    const next = tab ?? order[order.indexOf(slide.fromTab) + side] ?? null;
    let pane = next ? this.pane(next) : null;
    if (next && !pane) {
      // Раздел ещё не собран (первые секунды после входа, App собирает их
      // заранее по одному) — собрать сейчас: ехать без страницы нельзя.
      this.config.mount(next);
      pane = this.pane(next);
    }
    slide.toTab = pane ? next : null;
    slide.to = pane;
    if (!pane) return false;
    // Место — до показа: первый же кадр соседа — уже на своей позиции.
    const shift = side * slide.width;
    pane.style.transform = tx(slide.offset + shift);
    if (slide.scrubs.has(slide.from)) {
      const scrub = scrubber(pane, tx(-slide.width + shift), tx(slide.width + shift), 2 * slide.width);
      scrub.currentTime = slide.offset + slide.width;
      slide.scrubs.set(pane, scrub);
    }
    pane.style.setProperty('--peek-top', `${slide.top}px`);
    pane.setAttribute('data-sliding', '');
    pane.setAttribute('data-peek', '');
    return true;
  }

  private unpeek(slide: Slide, pane: HTMLElement) {
    slide.scrubs.get(pane)?.cancel();
    slide.scrubs.delete(pane);
    pane.removeAttribute('data-peek');
    pane.removeAttribute('data-sliding');
    pane.style.removeProperty('--peek-top');
    pane.style.removeProperty('transform');
  }

  /** Палец отпущен: довести до соседа или вернуть. Линза доезжает тем же
   *  ходом, что и страница, — своей анимацией, без React. */
  private settle(slide: Slide, complete: boolean, speed: number) {
    const config = this.config;
    if (!config) return;
    slide.completing = complete && slide.toTab !== null;
    const target = slide.completing ? -slide.side * slide.width : 0;
    const duration = releaseDuration(Math.abs(target - slide.offset), Math.max(0, speed));

    // Перемотка кончилась: дальше — анимации от того места, где отпустили.
    // Отмена и старт — в одной задаче, кадра между ними нет.
    const index = config.order.indexOf(slide.fromTab);
    const count = config.order.length;
    const from = lensShift(index + (slide.to ? -slide.offset / slide.width : 0), count);
    const to = lensShift(slide.completing ? index + slide.side : index, count);
    for (const scrub of slide.scrubs.values()) scrub.cancel();
    slide.scrubs.clear();
    slide.lens.forEach((node, i) => {
      node.style.transform = to[i];
      if (duration > 0) slide.animations.push(node.animate([{ transform: from[i] }, { transform: to[i] }], { duration, easing: RELEASE_EASE }));
    });
    this.run(slide, target, duration, RELEASE_EASE);

    if (slide.completing && slide.toTab) {
      config.onSelect(slide.toTab);
      // Меню (`aria-current`, капля линзы) — кадром позже: перерисовка React
      // в кадре отпускания задержала бы старт доводки, а линза уже едет сама.
      const next = { from: slide.fromTab, to: slide.toTab };
      requestAnimationFrame(() => {
        if (!slide.done) this.onTarget(next);
      });
    }
  }

  /** Доехать до `target` на видеокарте. Конечное место пишется сразу в стиль:
   *  анимация идёт поверх него, а закончившись, оставляет страницу там же. */
  private run(slide: Slide, target: number, duration: number, easing: string) {
    const start = slide.offset;
    slide.offset = target;
    slide.from.style.transform = tx(target);
    if (slide.to) slide.to.style.transform = tx(target + slide.side * slide.width);
    const frames = (shift: number) => [{ transform: tx(start + shift) }, { transform: tx(target + shift) }];
    if (duration > 0 && start !== target) {
      slide.animations.push(slide.from.animate(frames(0), { duration, easing }));
      if (slide.to) slide.animations.push(slide.to.animate(frames(slide.side * slide.width), { duration, easing }));
    }
    Promise.all(slide.animations.map((animation) => animation.finished)).then(
      () => this.finish(slide, slide.completing),
      // Отменена — значит, `finish` уже позвали (новый жест, смена раздела).
      () => {},
    );
  }

  /** Конец проезда. Доехали — раздел становится текущим одним кадром: сосед
   *  встаёт в поток, прокрутка — наверх, и он оказывается ровно там, где был. */
  private finish(slide: Slide, commit: boolean) {
    if (slide.done) return;
    slide.done = true;
    if (this.slide === slide) this.slide = null;
    for (const animation of slide.animations) animation.cancel();
    for (const scrub of slide.scrubs.values()) scrub.cancel();
    slide.scrubs.clear();
    const config = this.config;
    const toTab = commit ? slide.toTab : null;

    if (toTab && config) {
      flushSync(() => {
        this.onTarget(null);
        config.onCommit(toTab);
      });
    } else if (slide.completing) {
      // Меню уже показало соседа, а проезд брошен — вернуть его.
      this.onTarget(null);
    }

    slide.from.removeAttribute('data-sliding');
    slide.from.style.removeProperty('transform');
    if (slide.to) this.unpeek(slide, slide.to);
    // Линза возвращается под стиль капсулы: `--dock-i` к этому моменту —
    // тот же раздел, на котором она стоит, и перехода не возникает.
    for (const node of slide.lens) node.style.removeProperty('transform');
    config?.dock.current?.removeAttribute('data-dragging');
    // Последним: прокрутка спрашивает раскладку, и она должна быть уже итоговой.
    if (toTab) config?.scroller.current?.scrollTo({ top: 0, behavior: 'instant' });
  }
}
