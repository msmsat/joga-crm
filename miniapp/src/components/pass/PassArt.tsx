import { memo, useEffect, useMemo } from 'react';
import { animate, motion, useMotionValue, useTransform, type MotionValue } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import type { SubscriptionPackageInfo } from '../../api/studio';
import { cn } from '../../lib/utils';
import { ART_H, ART_W, guilloche } from './guilloche';
import type { PassMaterial } from './material';

type Props = {
  plan: SubscriptionPackageInfo;
  name: string;
  material: PassMaterial;
  studioName: string;
  /** Положение карты относительно центра витрины: 0 — в центре, ±1 — соседняя.
   *  `null` — блик и фольгу ведёт браузер от прокрутки (кадры `pass-sd-sheen`,
   *  `pass-sd-foil` в index.css), JS на кадр листания здесь не нужен. */
  offset: MotionValue<number> | null;
  /** Досчитать число визитов с нуля — у карты, с которой открылась витрина. */
  countUp: boolean;
  /** Номер открытия витрины: постановка повторяется на каждом. */
  tick: number;
  reduce: boolean;
};

/**
 * Карта абонемента как предмет: материал, гравировка и фольга.
 *
 * Фольга (цифра и блик поверх карты) привязана к положению карты в витрине,
 * а не к таймеру: свет едет ровно настолько, насколько человек сдвинул
 * пальцем, — карта поворачивается под ним, как настоящая.
 *
 * Блик и цифра — каждый своим слоем (`will-change` в index.css). Двигайся они
 * внутри общего слоя карты, браузер на каждом кадре листания перерисовывал бы
 * всю карту — гравировку из сотен отрезков и её отражение — у всех шести карт.
 *
 * Размер задаёт витрина (`--pass-card-h`), всё внутри — доли от него, чтобы
 * карта одинаково держала пропорции на телефоне и в консоли на десктопе.
 */
export default memo(function PassArt({ plan, name, material, studioName, offset, countUp, tick, reduce }: Props) {
  const { t } = useTranslation();
  // Вся гравировка — одним контуром: десятки отдельных <path> на каждой
  // карте удлиняли сборку листа в кадре открытия, а рисунок от этого не меняется.
  const engraving = useMemo(() => guilloche(plan.id).join(''), [plan.id]);
  // Карта, с которой открылась витрина, ловит свет при приземлении: блик
  // проходит по ней один раз и встаёт туда, где его держит положение карты.
  const sweep = useMotionValue(0);
  // Проход блика — внешним слоем, положение карты — внутренним: два движения
  // складываются, и браузерный путь не теряет прохода на открытии.
  const sweepX = useTransform(sweep, [-1.5, 1.5], ['-70%', '70%']);
  const light = useTransform(() => (offset ? offset.get() : 0) + sweep.get());
  const sheen = useTransform(offset ?? sweep, [-1.5, 1.5], ['-70%', '70%']);
  const foil = useTransform(light, [-1.5, 1.5], ['0% 50%', '100% 50%']);

  const count = useMotionValue(plan.class_count);
  const shown = useTransform(count, (value) => Math.round(value));
  useEffect(() => {
    if (!countUp || reduce || tick === 0) return;
    // Карта в этот кадр ещё прозрачна — сброс в ноль не мелькает.
    count.set(0);
    sweep.set(-1.8);
    const runs = [
      animate(count, plan.class_count, { duration: 1.1, delay: 0.35, ease: [0.16, 1, 0.3, 1] }),
      animate(sweep, 0, { duration: 1.5, delay: 0.4, ease: [0.22, 1, 0.36, 1] }),
    ];
    return () => {
      runs.forEach((run) => run.stop());
      // Прерванная постановка не оставляет на карте недосчитанную цифру.
      count.set(plan.class_count);
      sweep.set(0);
    };
  }, [tick, countUp, reduce, count, sweep, plan.class_count]);

  return (
    <div data-material={material} className="pass-art relative h-full w-full overflow-hidden rounded-[22px]">
      <svg aria-hidden="true" viewBox={`0 0 ${ART_W} ${ART_H}`} preserveAspectRatio="xMidYMid slice" className="pass-art-engrave absolute inset-0 h-full w-full">
        <path d={engraving} />
      </svg>
      {!reduce && (
        <motion.span aria-hidden="true" style={{ x: sweepX }} className="pass-art-layer absolute inset-y-[-20%] left-[-30%] w-[160%]">
          <motion.span
            style={offset ? { x: sheen } : undefined}
            className={offset ? 'pass-art-sheen pass-art-layer absolute inset-0' : 'pass-art-sheen pass-sd-sheen absolute inset-0'}
          />
        </motion.span>
      )}

      <div className="relative flex h-full flex-col p-[calc(var(--pass-card-h)*0.07)]">
        <div className="flex items-start justify-between gap-2">
          <span className="pass-art-muted min-w-0 truncate text-[length:calc(var(--pass-card-h)*0.042)] font-bold tracking-[0.02em]">{studioName}</span>
          {plan.discount_label && (
            <span className="pass-art-sticker flex shrink-0 items-center justify-center rounded-full font-extrabold tabular-nums">
              {plan.discount_label}
            </span>
          )}
        </div>

        <div className="mt-auto">
          <motion.span
            style={reduce || !offset ? undefined : { backgroundPosition: foil }}
            className={cn('pass-art-numeral block font-extrabold leading-[0.82] tabular-nums tracking-[-0.07em]', !reduce && !offset && 'pass-sd-foil')}
          >
            {reduce ? plan.class_count : <motion.span>{shown}</motion.span>}
          </motion.span>
          <span className="pass-art-muted mt-[calc(var(--pass-card-h)*0.025)] block text-[length:calc(var(--pass-card-h)*0.045)] font-bold">
            {t('buyModal.visits_label')}
          </span>
          <span className="mt-[calc(var(--pass-card-h)*0.05)] line-clamp-2 block text-[length:calc(var(--pass-card-h)*0.056)] font-extrabold leading-[1.15] tracking-[-0.02em] [overflow-wrap:anywhere]">
            {name}
          </span>
        </div>
      </div>
    </div>
  );
});
