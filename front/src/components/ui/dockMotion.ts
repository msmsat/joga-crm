import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';

/**
 * Движение нижнего дока (MobileNav) — целиком на компоновщике.
 *
 * Раньше бусину и капсулы двигали layout-анимации framer-motion, и док
 * подтормаживал по двум причинам сразу (замер при CPU ×4, 09.10.2026):
 *   • на каждый тап framer мерил всё дерево своих проекций — 140 мс до первого
 *     кадра на вкладке и почти секунда на «Ещё», где он заставлял браузер тут же
 *     раскладывать только что вставленную панель;
 *   • кадры анимации считались в JS, и пока раскладывалась новая страница,
 *     бусина стояла, а потом прыгала на сотню пикселей.
 * Здесь двигаются только transform и opacity через Web Animations — их ведёт
 * поток компоновщика, и главному потоку, занятому страницей, плавность больше
 * не принадлежит. Web Animations, а не CSS-переходы: переход шлёт события
 * transitionrun/start/end, и каждое проходит через корневой слушатель React —
 * десяток переходов на тап стоил заметную долю кадра.
 *
 *   • Содержимое вкладок (.mnav-group) — FLIP: раскладка меняется сразу,
 *     а каждая группа ВИЗУАЛЬНО едет со старого места на новое. Старое место —
 *     то, где группа была в момент тапа, с учётом недоигранного переезда:
 *     второй тап посреди движения подхватывает его без рывка.
 *   • Бусина — слои под вкладками: две половинки-торца и середина между ними
 *     плюс ореол. Торцы только сдвигаются, середина сдвигается и растягивается
 *     (scaleX) — растяжение прячется под торцами, поэтому концы не сплющиваются,
 *     как у растянутой целиком капсулы, и от круга «Ещё» до широкой капсулы с
 *     подписью бусина остаётся капсулой. Конечное место пишется в инлайновый
 *     transform, анимация едет к нему с того места, где слой сейчас.
 *   • Сначала всё читается (раскладка, текущие сдвиги), потом всё пишется:
 *     чтение после записи заставляло браузер пересчитывать стили по разу на
 *     каждую вкладку.
 *   • Одна пружина на всё — CSS-переменные --mnav-spring (linear()) и
 *     --mnav-move в App.css; переходы подписи и иконок берут их оттуда же.
 */

const FALLBACK_EASING = 'cubic-bezier(0.2, 0.9, 0.25, 1)';
// Ширина, от которой растягивается середина (её width в App.css).
const BASE_W = 100;
const BEAD_PARTS = ['glow', 'mid', 'cap-l', 'cap-r'] as const;

interface DockState {
  /** Левый край группы каждой вкладки в раскладке (без transform), px окна. */
  lefts: Map<string, number>;
  anims: Map<string, Animation>;
  bead: { l: number; w: number } | null;
  beadAnims: Animation[];
  glint: Animation | null;
  key: string;
}

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Время из CSS — с единицами: сборка сжимает «720ms» в «.72s», и голый
// parseFloat давал анимацию длиной в 0,72 мс.
function ms(value: string) {
  const v = value.trim();
  const n = parseFloat(v);
  if (!Number.isFinite(n)) return null;
  return v.endsWith('ms') ? n : v.endsWith('s') ? n * 1000 : n;
}

function timing(dock: HTMLElement) {
  const cs = getComputedStyle(dock);
  const easing = cs.getPropertyValue('--mnav-spring').trim() || FALLBACK_EASING;
  const duration = ms(cs.getPropertyValue('--mnav-move')) || 700;
  return { easing, duration };
}

const matrixOf = (el: HTMLElement) => {
  const t = getComputedStyle(el).transform;
  return !t || t === 'none' ? null : new DOMMatrixReadOnly(t);
};

const px = (n: number) => `${Math.round(n * 100) / 100}px`;
const tf = (x: number, sx?: number) => `translateX(${px(x)})${sx === undefined ? '' : ` scaleX(${sx.toFixed(4)})`}`;

function sync(dock: HTMLElement, s: DockState, move: boolean) {
  const bead = dock.querySelector<HTMLElement>('.mnav-bead');
  const parts = BEAD_PARTS.map(n => bead?.querySelector<HTMLElement>(`.mnav-bead-${n}`) ?? null);
  const shine = bead?.querySelector<HTMLElement>('.mnav-bead-glint') ?? null;
  const active = dock.querySelector<HTMLElement>('.mnav-item.is-on');
  const prev = s.key ? dock.querySelector<HTMLElement>(`[data-key="${s.key}"]`) : null;
  const t = move ? timing(dock) : null;

  // ── Чтение ──
  // Подпись и тёмная копия иконки: у новой вкладки проступают, у прежней
  // гаснут. Прерванное проявление продолжается с той прозрачности, где его
  // застал тап, а не с нуля или единицы.
  const fades = t && active && prev && prev !== active
    ? ([[active, true], [prev, false]] as const).flatMap(([item, on]) =>
      [...item.querySelectorAll<HTMLElement>('.mnav-label, .mnav-ink.is-lit')].map(el => ({
        el,
        on,
        label: el.classList.contains('mnav-label'),
        from: el.getAnimations().length ? +getComputedStyle(el).opacity : on ? 0 : 1,
      })))
    : [];
  const groups = [...dock.querySelectorAll<HTMLElement>('[data-key]')].map(item => {
    const group = item.querySelector<HTMLElement>('.mnav-group')!;
    const key = item.dataset.key!;
    const shift = s.anims.has(key) ? matrixOf(group)?.m41 ?? 0 : 0;
    return { key, group, shift, left: group.getBoundingClientRect().left - shift };
  });
  const d = dock.getBoundingClientRect();
  const r = active?.getBoundingClientRect();
  const cap = bead ? bead.offsetHeight / 2 : 0;
  const target = r ? { l: r.left - d.left, w: r.width } : null;
  // Цель бусины не сдвинулась — её не трогаем: идущий переезд доиграет сам.
  const beadMoves = !!target && !(s.bead && Math.abs(s.bead.l - target.l) < 0.5 && Math.abs(s.bead.w - target.w) < 0.5);
  const beadNow = beadMoves && t ? parts.map(p => (p ? matrixOf(p) : null)) : [];

  // ── Запись: вкладки ──
  for (const g of groups) {
    const was = s.lefts.get(g.key);
    s.lefts.set(g.key, g.left);
    if (!t || was === undefined) continue;
    const from = was + g.shift - g.left;
    if (Math.abs(from) <= 0.5) continue;
    s.anims.get(g.key)?.cancel();
    const anim = g.group.animate([{ transform: tf(from) }, { transform: 'translateX(0)' }], t);
    s.anims.set(g.key, anim);
    anim.onfinish = () => { if (s.anims.get(g.key) === anim) s.anims.delete(g.key); };
  }

  // ── Запись: подписи и иконки ──
  // Конечное состояние задаёт класс .is-on (App.css), здесь — только путь к
  // нему. Подпись проявляется, когда бусина уже подъехала, а не раньше.
  for (const f of fades) {
    f.el.getAnimations().forEach(a => a.cancel());
    if (f.on) {
      f.el.animate([{ opacity: f.from }, { opacity: 1 }], {
        duration: f.label ? 260 : 220, delay: f.label ? 100 : 80, easing: 'ease', fill: 'backwards',
      });
      if (f.label) f.el.animate([{ transform: 'translateX(-6px)' }, { transform: 'none' }], { ...t, delay: 60, fill: 'backwards' });
    } else {
      f.el.animate([{ opacity: f.from }, { opacity: 0 }], { duration: f.label ? 120 : 140, easing: 'ease' });
    }
  }

  // ── Запись: бусина ──
  if (!beadMoves || !target || !shine || parts.some(p => !p)) return;
  const { l, w } = target;
  s.bead = target;
  const ends = [
    // Ореол растягивается из круга: растянутый круг — эллипс, и он целиком
    // внутри капсулы. Растянутая «таблетка» шириной BASE_W на узкой бусине
    // («Ещё») сжималась, и её углы торчали из-под круга квадратным силуэтом.
    tf(l, w / (2 * cap)),
    // Середина заходит под торцы на пиксель — на стыке не светится шов.
    tf(l + cap - 1, Math.max(0.001, (w - 2 * cap + 2) / BASE_W)),
    tf(l),
    tf(l + w - cap),
  ];
  s.beadAnims.forEach(a => a.cancel());
  s.beadAnims = [];
  parts.forEach((p, i) => {
    p!.style.transform = ends[i];
    const now = beadNow[i];
    if (!t || !now) return;
    // С того места, где слой сейчас (в том числе посреди прежнего переезда).
    const from = i < 2 ? tf(now.m41, now.m11) : tf(now.m41);
    s.beadAnims.push(p!.animate([{ transform: from }, { transform: ends[i] }], t));
  });

  // Блик живёт уже на месте посадки и пробегает, когда бусина доехала.
  shine.style.transform = tf(l);
  shine.style.width = px(w);
  if ((t || !s.key) && !reducedMotion()) {
    s.glint?.cancel();
    s.glint = shine.firstElementChild?.animate(
      [
        { transform: 'translateX(-140%) skewX(-14deg)', opacity: 0 },
        { opacity: 1, offset: 0.25 },
        { transform: 'translateX(240%) skewX(-14deg)', opacity: 0 },
      ],
      { duration: 850, delay: t ? 300 : 220, easing: 'cubic-bezier(0.3, 0.55, 0.2, 1)', fill: 'backwards' },
    ) ?? null;
  }
}

/**
 * activeKey — у какой вкладки бусина; layoutKey — всё прочее, что меняет
 * ширины (язык подписей): по нему док встаёт на место без анимации.
 */
export function useDockMotion(dockRef: RefObject<HTMLElement | null>, activeKey: string, layoutKey: string) {
  const state = useRef<DockState>({ lefts: new Map(), anims: new Map(), bead: null, beadAnims: [], glint: null, key: '' });

  useLayoutEffect(() => {
    const dock = dockRef.current;
    if (!dock) return;
    const s = state.current;
    sync(dock, s, s.key !== '' && s.key !== activeKey && !reducedMotion());
    s.key = activeKey;
  }, [dockRef, activeKey, layoutKey]);

  // Догрузился шрифт подписи, повернули экран, сменилась ширина окна —
  // встать на новое место без анимации. Срабатывает и на собственные смены
  // вкладки (вкладки меняют ширину), но там цель уже выставлена, и sync
  // ничего не трогает.
  useEffect(() => {
    const dock = dockRef.current;
    if (!dock || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => sync(dock, state.current, false));
    ro.observe(dock);
    dock.querySelectorAll('[data-key]').forEach(el => ro.observe(el));
    return () => ro.disconnect();
  }, [dockRef]);
}

/**
 * Три точки «Ещё» вздрагивают волной — ответ на тап, а не смена состояния.
 * Точек два ряда (приглушённый и тёмный, как копии иконок) — волна идёт по
 * обоим одинаково.
 */
export function waveDots(button: HTMLElement | null) {
  if (!button || reducedMotion()) return;
  button.querySelectorAll<HTMLElement>('.mnav-dot').forEach((dot, i) => {
    dot.animate(
      [
        { transform: 'none' },
        { transform: 'translateY(-3.5px) scale(1.22)', offset: 0.38 },
        { transform: 'none' },
      ],
      { duration: 520, delay: (i % 3) * 55, easing: 'cubic-bezier(0.3, 0.7, 0.3, 1)' },
    );
  });
}
