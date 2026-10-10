import { useLayoutEffect, useRef, type RefObject } from 'react';

/**
 * Вход и уход панели «Ещё» (MobileMore) — Web Animations, а не CSS-анимации
 * по классу фазы.
 *
 * Панель смонтирована заранее и закрытой спрятана `content-visibility: hidden`:
 * браузер хранит её стили и раскладку готовыми, и показ стоит ~1 мс. Класс фазы
 * на слое не задевает ни одного правила потомков — иначе смена класса
 * пересчитывала стили всей панели (≈100 узлов, 60–80 мс при CPU ×4: каждый
 * узел здесь дорог из-за общих правил Tailwind на `*`), и именно это палец
 * ждал после тапа. Анимации запускаются на готовых узлах и идут на компоновщике
 * (только transform и opacity).
 *
 * Открытие ничего не читает из стилей — только пишет: чтение после записей
 * соседних эффектов (док двигает бусину в том же кадре) заставляло браузер
 * пересчитывать стили лишний раз прямо в обработчике тапа.
 *
 * Вход — БЕЗ заливки вперёд (fill: forwards/both): залитая анимация перебивает
 * инлайновый transform, и свайп (drawerSwipe.ts) перестаёт двигать панель.
 * Стережёт `npm run check:mobile`.
 */

// Пружина: быстрый выезд с едва заметным перелётом и мягкой посадкой. Без
// поддержки linear() — обычная кривая без перелёта.
const SPRING = typeof CSS !== 'undefined' && CSS.supports?.('animation-timing-function', 'linear(0, 1)')
  ? 'linear(0, 0.057, 0.188, 0.344, 0.498, 0.635, 0.749, 0.837, 0.903, 0.949, 0.98, 0.999, 1.009, 1.014, 1.015, 1.014, 1.012, 1.01, 1.008, 1.005, 1.004, 1.002, 1.001, 1.001, 1)'
  : 'cubic-bezier(0.22, 1, 0.36, 1)';
export const PANEL_IN: KeyframeAnimationOptions = { duration: 620, easing: SPRING, fill: 'none' };
const PANEL_OUT: KeyframeAnimationOptions = { duration: 300, easing: 'cubic-bezier(0.4, 0, 0.9, 0.35)', fill: 'forwards' };
const OFFSTAGE = 'translateX(calc(100% + 28px))';
// Строки въезжают вслед за панелью одна за другой (--i — номер в каскаде,
// ставит MobileMore): одно движение, а не девять одновременных.
const CASCADE = '.mdrawer-head, .mdrawer-gtitle, .mdrawer-tile, .mdrawer-row, .mdrawer-account';

type Phase = 'closed' | 'open' | 'leaving';

/**
 * Чем панель отличается от «Ещё»: класс затемнения-соседа и что въезжает
 * каскадом. По умолчанию — «Ещё» (MobileMore); SidePanel передаёт свои.
 */
export interface DrawerMotionParts {
  scrim?: string;
  cascade?: string;
}

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function useDrawerMotion(
  layerRef: RefObject<HTMLElement | null>,
  panelRef: RefObject<HTMLElement | null>,
  phase: Phase,
  onClosed: () => void,
  { scrim: scrimClass = '.mdrawer-scrim', cascade = CASCADE }: DrawerMotionParts = {},
) {
  const closedRef = useRef(onClosed);
  useLayoutEffect(() => { closedRef.current = onClosed; });
  // Свои анимации панели и затемнения — чтобы снимать их без getAnimations()
  // (тот пересчитывает стили).
  const running = useRef<Animation[]>([]);
  const leaving = useRef<Animation | null>(null);

  useLayoutEffect(() => {
    const layer = layerRef.current;
    const panel = panelRef.current;
    const scrim = layer?.querySelector<HTMLElement>(`:scope > ${scrimClass}`);
    if (!layer || !panel || !scrim || phase === 'closed') return;
    const reduce = reducedMotion();

    if (phase === 'open') {
      // Открыли посреди ухода — панель возвращается с того места, где была.
      const from = leaving.current?.playState === 'running' ? getComputedStyle(panel).transform : null;
      running.current.forEach(a => a.cancel());
      leaving.current = null;
      if (reduce) {
        running.current = [panel, scrim].map(el => el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 180, easing: 'ease' }));
        return;
      }
      running.current = [
        panel.animate([{ transform: from && from !== 'none' ? from : `${OFFSTAGE} scale(0.96)` }, { transform: 'none' }], PANEL_IN),
        scrim.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 340, easing: 'ease' }),
      ];
      layer.querySelectorAll<HTMLElement>(cascade).forEach(el => {
        const i = parseFloat(el.style.getPropertyValue('--i')) || 0;
        const delay = el.classList.contains('mdrawer-head') ? 70 : 120 + i * 26;
        el.animate(
          [{ opacity: 0, transform: 'translateX(28px)' }, { opacity: 1, transform: 'none' }],
          { duration: 520, delay, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)', fill: 'backwards' },
        );
      });
      return;
    }

    // Уход — туда же, откуда пришла, и с того места, где её отпустил палец
    // (--swipe-x оставляет свайп на панели). Затемнение гаснет с той
    // прозрачности, до которой его довёл палец (--swipe на нём самом).
    const swipeX = parseFloat(panel.style.getPropertyValue('--swipe-x')) || 0;
    const dim = 1 - (parseFloat(scrim.style.getPropertyValue('--swipe')) || 0);
    running.current.forEach(a => a.cancel());
    const out = reduce
      ? panel.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 160, easing: 'ease', fill: 'forwards' })
      : panel.animate([{ transform: `translateX(${swipeX}px)` }, { transform: OFFSTAGE }], PANEL_OUT);
    running.current = [
      out,
      scrim.animate([{ opacity: dim }, { opacity: 0 }], { duration: reduce ? 160 : 300, easing: 'ease', fill: 'forwards' }),
    ];
    leaving.current = out;
    out.onfinish = () => closedRef.current();
  }, [layerRef, panelRef, phase, scrimClass, cascade]);
}
