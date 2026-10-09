import { memo, useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode, type RefObject } from 'react';
import { motion, useMotionValue, useMotionValueEvent, useScroll, useSpring, useTransform, type MotionValue } from 'framer-motion';
import type { SubscriptionPackageInfo } from '../../api/studio';
import { cn } from '../../lib/utils';
import type { PassMaterial } from './material';
import { passDim, passScale, passShift, passTurn, passZ, SCROLL_DRIVEN } from './pose';
import type { Selection } from './selection';

type Props = {
  packages: SubscriptionPackageInfo[];
  /** Выбор витрины: открывается на нём, дальше его задаёт положение прокрутки. */
  selection: Selection;
  /** Карта сменилась — отклик пальцу (вибрация). */
  onPicked: () => void;
  materials: Map<number, PassMaterial>;
  /** Карта по номеру: витрина держит положение, рисунок — PassArt.
   *  `offset` — положение карты для блика и фольги; `null` — их ведёт браузер
   *  от прокрутки (`SCROLL_DRIVEN`), и JS здесь не нужен. */
  /**
   * `opening` — карта, с которой открылась витрина: только на ней цифра
   * досчитывает. `tick` — номер открытия: собранная заранее витрина
   * открывается много раз, и постановка повторяется на каждом.
   */
  renderCard: (plan: SubscriptionPackageInfo, offset: MotionValue<number> | null, opening: boolean, tick: number) => ReactNode;
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
 * фольге — производное от положения прокрутки. Где браузер умеет анимации от
 * прокрутки, их ведёт он сам, в потоке прокрутки (`CssSlide`, кадры
 * `pass-sd-*`): поза карт не отстаёт от пальца ни на кадр и не встаёт, когда
 * главный поток занят. Иначе — JS от `useScroll` (`JsSlide`) по тем же кривым
 * (`pose.ts`). Выбранной считается карта у центра: отдельного состояния
 * «выбрано», способного разойтись с тем, что видно, нет.
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
  const scrollX = useLane(track);

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

  const pick = (next: number) => {
    if (next === currentRef.current) return;
    currentRef.current = next;
    setCurrent(next);
    selection.set(next);
    onPicked();
  };

  // JS-путь: выбранная — по положению ленты, которое и так считается на кадр.
  useMotionValueEvent(scrollX, 'change', (value) => {
    if (!step) return;
    pick(Math.max(0, Math.min(packages.length - 1, Math.round(value / step))));
  });

  // Браузерный путь: выбранная — та, что пересекает узкую полосу в центре
  // ленты. Наблюдатель пересечений считает это сам, вместе с отрисовкой кадра:
  // ни замера раскладки, ни JS на кадр листания. (`useScroll` framer на каждом
  // кадре читал размеры ленты и заставлял браузер пересчитывать раскладку
  // синхронно — ~440 мс за два свайпа при CPU ×4.)
  useEffect(() => {
    const element = track.current;
    if (!SCROLL_DRIVEN || !element) return;
    const slides = [...element.querySelectorAll<HTMLElement>('[data-slide]')];
    const observer = new IntersectionObserver((entries) => {
      // До первой расстановки лента стоит в нуле — это не выбор человека.
      if (!placed.current) return;
      for (const entry of entries) {
        const index = slides.indexOf(entry.target as HTMLElement);
        if (entry.isIntersecting && index >= 0) pick(index);
      }
    }, { root: element, rootMargin: '0px -49.5% 0px -49.5%', threshold: 0 });
    slides.forEach((slide) => observer.observe(slide));
    return () => observer.disconnect();
    // pick читает только рефы и стабильные сеттеры; пересоздавать наблюдатель
    // на каждый рендер незачем.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [packages.length]);

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
    <div className={cn('pass-stage relative -mx-6', SCROLL_DRIVEN && !reduce && 'pass-sd')}>
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
            depth={Math.abs(index - current)}
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

type SlideProps = {
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
  /** Сколько карт до выбранной: порядок наложения у браузерного пути. */
  depth: number;
  renderCard: Props['renderCard'];
};

/** Наклон к мыши: выбранная карта поворачивается к курсору. Палец — нет: у
 *  него свайп, и наклон под ним спорил бы с листанием. */
function useTilt(selected: boolean, reduce: boolean) {
  const tiltX = useSpring(0, { stiffness: 220, damping: 22 });
  const tiltY = useSpring(0, { stiffness: 220, damping: 22 });
  const handlers = {
    onPointerMove: (event: PointerEvent<HTMLButtonElement>) => {
      if (event.pointerType !== 'mouse' || !selected || reduce) return;
      const box = event.currentTarget.getBoundingClientRect();
      tiltY.set(((event.clientX - box.left) / box.width - 0.5) * 16);
      tiltX.set(-((event.clientY - box.top) / box.height - 0.5) * 12);
    },
    onPointerLeave: () => {
      tiltX.set(0);
      tiltY.set(0);
    },
  };
  return { tiltX, tiltY, handlers };
}

/** Раздача карт на открытии — одна постановка на оба пути. Закрытая витрина
 *  возвращает карты в колоду не сразу, а когда лист уже уехал за край: иначе
 *  они разлетались бы у него на глазах. */
const fan = (fanFrom: number, delay: number) => ({
  out: { opacity: 0, y: 80, rotate: fanFrom * 6, transition: { duration: 0, delay: 0.3 } },
  in: { opacity: 1, y: 0, rotate: 0, transition: { ...spring, delay } },
});

/**
 * Карта, позу которой ведёт браузер (`SCROLL_DRIVEN`): поворот, масштаб,
 * сдвиг и затемнение — кадры `pass-sd-*` в index.css от положения этой карты
 * в ленте. На кадр листания здесь не исполняется ни строчки JS; порядок
 * наложения меняется только со сменой выбранной карты.
 */
const CssSlide = memo(function CssSlide({ index, selected, delay, fanFrom, open, tick, reduce, name, onPick, plan, opening, depth, renderCard }: SlideProps) {
  const { tiltX, tiltY, handlers } = useTilt(selected, reduce);
  return (
    <motion.button
      type="button"
      data-slide
      aria-label={name}
      aria-current={selected || undefined}
      tabIndex={-1}
      onClick={() => onPick(index)}
      {...handlers}
      // Ближе к выбранной — выше; меняется на середине пути между картами.
      style={{ zIndex: 100 - depth * 10 }}
      variants={fan(fanFrom, delay)}
      initial={reduce ? false : 'out'}
      animate={reduce || open ? 'in' : 'out'}
      className="pass-slide relative shrink-0 snap-center focus-visible:outline-none"
    >
      <div className={cn('pass-card relative h-full w-full will-change-transform', selected && 'is-selected')}>
        <motion.div style={{ rotateX: tiltX, rotateY: tiltY, transformPerspective: 1100 }} className="h-full w-full">
          {renderCard(plan, null, opening, tick)}
        </motion.div>
        <span aria-hidden="true" className="pass-sd-dim pointer-events-none absolute inset-0 rounded-[22px] bg-[#0f0f0f]" />
      </div>
    </motion.button>
  );
});

/** Карта, позу которой считает JS от прокрутки, — там, где браузер не умеет
 *  анимации от неё (см. `SCROLL_DRIVEN`). Кривые — те же, что у кадров CSS. */
const JsSlide = memo(function JsSlide({ index, step, scrollX, selected, delay, fanFrom, open, tick, reduce, name, onPick, plan, opening, renderCard }: SlideProps) {
  // > 0 — карта левее центра, < 0 — правее, 0 — в центре.
  const offset = useTransform(scrollX, (value) => (step ? (value - index * step) / step : 0));
  const { tiltX, tiltY, handlers } = useTilt(selected, reduce);
  const rotateY = useTransform([offset, tiltY], ([place, tilt]: number[]) => passTurn(place) + tilt);
  // Свет на фольге едет вместе с наклоном мыши.
  const light = useTransform([offset, tiltY], ([place, tilt]: number[]) => place - tilt / 24);
  const scale = useTransform(offset, passScale);
  const x = useTransform(offset, (value) => `${passShift(value)}%`);
  const zIndex = useTransform(offset, passZ);
  const dim = useTransform(offset, passDim);

  return (
    <motion.button
      type="button"
      data-slide
      aria-label={name}
      aria-current={selected || undefined}
      tabIndex={-1}
      onClick={() => onPick(index)}
      {...handlers}
      style={{ zIndex }}
      variants={fan(fanFrom, delay)}
      initial={reduce ? false : 'out'}
      animate={reduce || open ? 'in' : 'out'}
      className="pass-slide relative shrink-0 snap-center focus-visible:outline-none"
    >
      <motion.div
        style={reduce ? undefined : { rotateY, rotateX: tiltX, scale, x, transformPerspective: 1100 }}
        className={cn('pass-card relative h-full w-full will-change-transform', selected && 'is-selected')}
      >
        {renderCard(plan, light, opening, tick)}
        {/* Своим слоем (will-change): прозрачность без него перерисовывала бы
            всю карту с гравировкой на каждом кадре листания. */}
        {!reduce && <motion.span aria-hidden="true" style={{ opacity: dim }} className="pointer-events-none absolute inset-0 rounded-[22px] bg-[#0f0f0f] will-change-[opacity]" />}
      </motion.div>
    </motion.button>
  );
});

const Slide = SCROLL_DRIVEN ? CssSlide : JsSlide;

/** Положение ленты для JS-пути. Браузерному оно не нужно: позу ведут кадры
 *  CSS, выбранную — наблюдатель пересечений, и `useScroll` с его замером
 *  раскладки на каждом кадре там не подключается вовсе. */
function useTrackScroll(track: RefObject<HTMLDivElement | null>) {
  return useScroll({ container: track, axis: 'x' }).scrollX;
}
function useStillLane() {
  return useMotionValue(0);
}
const useLane = SCROLL_DRIVEN ? useStillLane : useTrackScroll;

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
