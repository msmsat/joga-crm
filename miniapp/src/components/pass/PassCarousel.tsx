import { memo, useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { motion, useMotionValueEvent, useScroll, useSpring, useTransform, type MotionValue } from 'framer-motion';
import type { SubscriptionPackageInfo } from '../../api/studio';
import { cn } from '../../lib/utils';
import type { PassMaterial } from './material';
import type { Selection } from './selection';

type Props = {
  packages: SubscriptionPackageInfo[];
  /** Выбор витрины: открывается на нём, дальше его задаёт положение прокрутки. */
  selection: Selection;
  /** Карта сменилась — отклик пальцу (вибрация). */
  onPicked: () => void;
  materials: Map<number, PassMaterial>;
  /** Карта по номеру: витрина держит положение, рисунок — PassArt. */
  /**
   * `opening` — карта, с которой открылась витрина: только на ней цифра
   * досчитывает. `tick` — номер открытия: собранная заранее витрина
   * открывается много раз, и постановка повторяется на каждом.
   */
  renderCard: (plan: SubscriptionPackageInfo, offset: MotionValue<number>, opening: boolean, tick: number) => ReactNode;
  /** Лист открыт. Витрина может быть собрана заранее и стоять закрытой. */
  open: boolean;
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
  packages, selection, onPicked, materials, renderCard, nameOf, label, prevLabel, nextLabel, reduce, open,
}: Props) {
  const initialIndex = Math.min(selection.get().index, Math.max(packages.length - 1, 0));
  const track = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState(0);
  const stepRef = useRef(0);
  const [current, setCurrent] = useState(initialIndex);
  // Постановка открытия: от какой карты «раздаются» остальные и на какой
  // досчитывает цифра. Привязана к открытию, а не к монтированию: на главной
  // витрина собрана заранее и открывается готовой (BuyModalHost).
  const [session, setSession] = useState({ open: false, at: initialIndex, tick: 0 });
  if (open !== session.open) {
    setSession({ open, at: open ? current : session.at, tick: open ? session.tick + 1 : session.tick });
  }
  const currentRef = useRef(initialIndex);
  const placed = useRef(false);
  const { scrollX } = useScroll({ container: track, axis: 'x' });

  // Шаг — расстояние между центрами соседних карт; его задаёт CSS (размер
  // карты тянется от высоты экрана), поэтому меряется, а не дублируется числом.
  // Меряет ResizeObserver — после раскладки, которую браузер и так делает в
  // кадре. Замер прямо в эффекте заставлял считать раскладку всего листа
  // посреди тапа, второй раз за кадр: ~130 мс при CPU ×4. Кадр без шага не
  // виден — карты в нём ещё прозрачны, они только начинают «раздаваться».
  useEffect(() => {
    const element = track.current;
    if (!element) return;
    const observer = new ResizeObserver(() => {
      const slides = element.querySelectorAll<HTMLElement>('[data-slide]');
      const next = slides.length > 1 ? slides[1].offsetLeft - slides[0].offsetLeft : slides[0]?.offsetWidth ?? 0;
      stepRef.current = next;
      setStep(next);
      // Первая расстановка — без анимации: витрина открывается уже на нужной карте.
      if (!placed.current && next) {
        placed.current = true;
        element.scrollLeft = currentRef.current * next;
      }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [packages.length]);

  useMotionValueEvent(scrollX, 'change', (value) => {
    if (!step) return;
    const next = Math.max(0, Math.min(packages.length - 1, Math.round(value / step)));
    if (next === currentRef.current) return;
    currentRef.current = next;
    setCurrent(next);
    selection.set(next);
    onPicked();
  });

  // Стабильная ссылка: карты мемоизированы, и новая функция на каждый шаг
  // листания перерисовывала бы все шесть — ~200 мс при CPU ×4 на каждой смене.
  const go = useCallback((index: number) => {
    const element = track.current;
    const size = stepRef.current;
    if (!element || !size) return;
    const target = Math.max(0, Math.min(packages.length - 1, index));
    element.scrollTo({ left: target * size, behavior: reduce ? 'auto' : 'smooth' });
  }, [packages.length, reduce]);

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
            delay={0.08 + Math.abs(index - session.at) * 0.07}
            fanFrom={index - session.at}
            open={session.open}
            tick={session.tick}
            reduce={reduce}
            name={nameOf(plan)}
            onPick={go}
            plan={plan}
            opening={index === session.at}
            renderCard={renderCard}
          />
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
              {/* Без общего layoutId: «переезд» пилюли заставлял framer мерить
                  раскладку на каждом шаге; ширина и цвет переходят CSS. */}
              <span className={cn(
                'block h-1.5 rounded-full transition-[width,background-color] duration-300 ease-out',
                index === current ? 'w-6 bg-foreground' : 'w-1.5 bg-foreground/15',
              )} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const Slide = memo(function Slide({ index, step, scrollX, selected, delay, fanFrom, open, tick, reduce, name, onPick, plan, opening, renderCard }: {
  index: number;
  step: number;
  scrollX: MotionValue<number>;
  selected: boolean;
  delay: number;
  fanFrom: number;
  open: boolean;
  tick: number;
  reduce: boolean;
  name: string;
  onPick: (index: number) => void;
  plan: SubscriptionPackageInfo;
  opening: boolean;
  renderCard: Props['renderCard'];
}) {
  // > 0 — карта левее центра, < 0 — правее, 0 — в центре.
  const offset = useTransform(scrollX, (value) => (step ? (value - index * step) / step : 0));
  const turn = useTransform(offset, [-2, -1, 0, 1, 2], [-38, -26, 0, 26, 38]);
  // Мышь наклоняет выбранную карту к себе, и свет на фольге едет вместе с
  // наклоном. Палец — нет: у него свайп, и наклон под ним спорил бы с листанием.
  const tiltX = useSpring(0, { stiffness: 220, damping: 22 });
  const tiltY = useSpring(0, { stiffness: 220, damping: 22 });
  const rotateY = useTransform([turn, tiltY], ([scroll, tilt]: number[]) => scroll + tilt);
  const light = useTransform([offset, tiltY], ([place, tilt]: number[]) => place - tilt / 24);
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
      onClick={() => onPick(index)}
      onPointerMove={(event: PointerEvent<HTMLButtonElement>) => {
        if (event.pointerType !== 'mouse' || !selected || reduce) return;
        const box = event.currentTarget.getBoundingClientRect();
        tiltY.set(((event.clientX - box.left) / box.width - 0.5) * 16);
        tiltX.set(-((event.clientY - box.top) / box.height - 0.5) * 12);
      }}
      onPointerLeave={() => {
        tiltX.set(0);
        tiltY.set(0);
      }}
      style={{ zIndex }}
      // Закрытая витрина возвращает карты в колоду не сразу, а когда лист
      // уже уехал за край: иначе они разлетались бы у него на глазах.
      variants={{
        out: { opacity: 0, y: 80, rotate: fanFrom * 6, transition: { duration: 0, delay: 0.3 } },
        in: { opacity: 1, y: 0, rotate: 0, transition: { ...spring, delay } },
      }}
      initial={reduce ? false : 'out'}
      animate={reduce || open ? 'in' : 'out'}
      className="pass-slide relative shrink-0 snap-center focus-visible:outline-none"
    >
      <motion.div
        style={reduce ? undefined : { rotateY, rotateX: tiltX, scale, x, transformPerspective: 1100 }}
        className={cn('pass-card relative h-full w-full will-change-transform', selected && 'is-selected')}
      >
        {renderCard(plan, light, opening, tick)}
        {/* Глубина соседей — затемнением, а не прозрачностью: сквозь
            полупрозрачную карту просвечивала бы соседняя. */}
        {!reduce && <motion.span aria-hidden="true" style={{ opacity: dim }} className="pointer-events-none absolute inset-0 rounded-[22px] bg-[#0f0f0f]" />}
      </motion.div>
    </motion.button>
  );
});

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
