import { useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { motion, useMotionValueEvent, useScroll, useTransform, type MotionValue } from 'framer-motion';
import type { SubscriptionPackageInfo } from '../../api/studio';
import { cn } from '../../lib/utils';
import type { PassMaterial } from './material';

type Props = {
  packages: SubscriptionPackageInfo[];
  /** С какой карты открыть витрину. Дальше выбор — положение прокрутки. */
  initialIndex: number;
  onIndex: (index: number) => void;
  materials: Map<number, PassMaterial>;
  /** Карта по номеру: витрина держит положение, рисунок — PassArt. */
  renderCard: (plan: SubscriptionPackageInfo, index: number, offset: MotionValue<number>) => ReactNode;
  nameOf: (plan: SubscriptionPackageInfo) => string;
  label: string;
  prevLabel: string;
  nextLabel: string;
  reduce: boolean;
};

const spring = { type: 'spring', stiffness: 260, damping: 26, mass: 0.9 } as const;

/**
 * Витрина абонементов: карты листаются пальцем, центральная — выбранная.
 *
 * Листает браузер, а не JS: обычная горизонтальная прокрутка с прилипанием
 * (`scroll-snap`) — с инерцией пальца, колесом, тачпадом и «доводкой» к карте
 * ровно так, как человек привык. Всё объёмное — поворот, масштаб, свет на
 * фольге — производное от положения прокрутки (`useScroll`), поэтому идёт за
 * пальцем кадр в кадр и не спорит с ним. Выбранной считается карта у центра:
 * отдельного состояния «выбрано», способного разойтись с тем, что видно, нет.
 */
export default function PassCarousel({
  packages, initialIndex, onIndex, materials, renderCard, nameOf, label, prevLabel, nextLabel, reduce,
}: Props) {
  const track = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState(0);
  const [current, setCurrent] = useState(initialIndex);
  const currentRef = useRef(initialIndex);
  const placed = useRef(false);
  const dotId = useId();
  const { scrollX } = useScroll({ container: track, axis: 'x' });

  // Шаг — расстояние между центрами соседних карт; его задаёт CSS (размер
  // карты тянется от высоты экрана), поэтому меряется, а не дублируется числом.
  useLayoutEffect(() => {
    const element = track.current;
    if (!element) return;
    const measure = () => {
      const slides = element.querySelectorAll<HTMLElement>('[data-slide]');
      if (slides.length > 1) setStep(slides[1].offsetLeft - slides[0].offsetLeft);
      else if (slides[0]) setStep(slides[0].offsetWidth);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [packages.length]);

  // Первая расстановка — без анимации: витрина открывается уже на нужной карте.
  useLayoutEffect(() => {
    if (!step || !track.current) return;
    if (!placed.current) {
      placed.current = true;
      track.current.scrollLeft = currentRef.current * step;
    }
  }, [step]);

  useMotionValueEvent(scrollX, 'change', (value) => {
    if (!step) return;
    const next = Math.max(0, Math.min(packages.length - 1, Math.round(value / step)));
    if (next === currentRef.current) return;
    currentRef.current = next;
    setCurrent(next);
    onIndex(next);
  });

  const go = (index: number) => {
    const element = track.current;
    if (!element || !step) return;
    const target = Math.max(0, Math.min(packages.length - 1, index));
    element.scrollTo({ left: target * step, behavior: reduce ? 'auto' : 'smooth' });
  };

  const onKey = (event: KeyboardEvent) => {
    if (event.key === 'ArrowRight') { event.preventDefault(); go(currentRef.current + 1); }
    if (event.key === 'ArrowLeft') { event.preventDefault(); go(currentRef.current - 1); }
  };

  const material = materials.get(packages[current]?.id ?? -1) ?? 'onyx';

  return (
    <div className="pass-stage relative -mx-6">
      {/* Свет сцены — цвета материала выбранной карты; слои сменяют друг
          друга прозрачностью, цвет из color-mix анимировать нечем. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        {(['pearl', 'brand', 'smoke', 'onyx'] as const).map((tone) => (
          <span key={tone} data-material={tone} className={cn('pass-stage-glow', tone === material && 'is-on')} />
        ))}
      </div>

      <div
        ref={track}
        role="group"
        aria-roledescription="carousel"
        aria-label={label}
        tabIndex={0}
        onKeyDown={onKey}
        className="pass-track relative flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain focus-visible:outline-none"
      >
        <span aria-hidden="true" className="pass-track-edge shrink-0" />
        {packages.map((plan, index) => (
          <Slide
            key={plan.id}
            index={index}
            step={step}
            scrollX={scrollX}
            selected={index === current}
            // Карты «раздаются» от выбранной к краям — одна постановка на открытие.
            delay={0.08 + Math.abs(index - initialIndex) * 0.07}
            fanFrom={index - initialIndex}
            reduce={reduce}
            name={nameOf(plan)}
            onPick={() => go(index)}
          >
            {(offset) => renderCard(plan, index, offset)}
          </Slide>
        ))}
        <span aria-hidden="true" className="pass-track-edge shrink-0" />
      </div>

      {/* Стрелки — мыши: пальцу хватает свайпа, а на тачпаде листают и так. */}
      {packages.length > 1 && (
        <>
          <Arrow side="left" label={prevLabel} disabled={current === 0} onClick={() => go(current - 1)} />
          <Arrow side="right" label={nextLabel} disabled={current === packages.length - 1} onClick={() => go(current + 1)} />
        </>
      )}

      {packages.length > 1 && (
        <div className="relative flex justify-center gap-1.5 pb-1">
          {packages.map((plan, index) => (
            <button
              key={plan.id}
              type="button"
              aria-label={nameOf(plan)}
              aria-current={index === current || undefined}
              onClick={() => go(index)}
              className="relative flex h-6 items-center justify-center px-0.5"
            >
              <span className={cn('block h-1.5 rounded-full bg-foreground/15 transition-[width] duration-300', index === current ? 'w-6' : 'w-1.5')} />
              {index === current && (
                <motion.span layoutId={`pass-dot-${dotId}`} transition={spring} className="absolute inset-x-0.5 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-foreground" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Slide({ index, step, scrollX, selected, delay, fanFrom, reduce, name, onPick, children }: {
  index: number;
  step: number;
  scrollX: MotionValue<number>;
  selected: boolean;
  delay: number;
  fanFrom: number;
  reduce: boolean;
  name: string;
  onPick: () => void;
  children: (offset: MotionValue<number>) => ReactNode;
}) {
  // > 0 — карта левее центра, < 0 — правее, 0 — в центре.
  const offset = useTransform(scrollX, (value) => (step ? (value - index * step) / step : 0));
  const rotateY = useTransform(offset, [-2, -1, 0, 1, 2], [-38, -26, 0, 26, 38]);
  const scale = useTransform(offset, [-1.5, 0, 1.5], [0.78, 1, 0.78]);
  // Соседние карты подтянуты к центру и уходят под выбранную — колода, а не ряд.
  const x = useTransform(offset, [-2, -1, 0, 1, 2], ['-34%', '-16%', '0%', '16%', '34%']);
  const zIndex = useTransform(offset, (value) => 100 - Math.round(Math.abs(value) * 10));
  const dim = useTransform(offset, [-1.6, -1, 0, 1, 1.6], [0.55, 0.35, 0, 0.35, 0.55]);

  return (
    <motion.button
      type="button"
      data-slide
      aria-label={name}
      aria-current={selected || undefined}
      tabIndex={-1}
      onClick={onPick}
      style={{ zIndex }}
      initial={reduce ? false : { opacity: 0, y: 80, rotate: fanFrom * 6 }}
      animate={{ opacity: 1, y: 0, rotate: 0 }}
      transition={{ ...spring, delay }}
      className="pass-slide relative shrink-0 snap-center focus-visible:outline-none"
    >
      <motion.div
        style={reduce ? undefined : { rotateY, scale, x, transformPerspective: 1100 }}
        className={cn('pass-card relative h-full w-full will-change-transform', selected && 'is-selected')}
      >
        {children(offset)}
        {/* Глубина соседей — затемнением, а не прозрачностью: сквозь
            полупрозрачную карту просвечивала бы соседняя. */}
        {!reduce && <motion.span aria-hidden="true" style={{ opacity: dim }} className="pointer-events-none absolute inset-0 rounded-[22px] bg-[#0f0f0f]" />}
      </motion.div>
    </motion.button>
  );
}

function Arrow({ side, label, disabled, onClick }: { side: 'left' | 'right'; label: string; disabled: boolean; onClick: () => void }) {
  return (
    <motion.button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      whileTap={{ scale: 0.92 }}
      className={cn(
        'absolute top-[calc(50%-14px)] z-[120] hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-card text-foreground shadow-lift transition-opacity disabled:pointer-events-none disabled:opacity-0 dt:flex',
        side === 'left' ? 'left-4' : 'right-4',
      )}
    >
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
        {side === 'left' ? <polyline points="15 18 9 12 15 6" /> : <polyline points="9 18 15 12 9 6" />}
      </svg>
    </motion.button>
  );
}
