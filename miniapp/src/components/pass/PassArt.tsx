import { useEffect, useMemo } from 'react';
import { animate, motion, useMotionValue, useTransform, type MotionValue } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import type { SubscriptionPackageInfo } from '../../api/studio';
import { ART_H, ART_W, guilloche } from './guilloche';
import type { PassMaterial } from './material';

type Props = {
  plan: SubscriptionPackageInfo;
  name: string;
  material: PassMaterial;
  studioName: string;
  /** Положение карты относительно центра витрины: 0 — в центре, ±1 — соседняя. */
  offset: MotionValue<number>;
  /** Досчитать число визитов с нуля — один раз, у карты, с которой открылась витрина. */
  countUp: boolean;
  reduce: boolean;
};

/**
 * Карта абонемента как предмет: материал, гравировка и фольга.
 *
 * Фольга (цифра и блик поверх карты) привязана к положению карты в витрине,
 * а не к таймеру: свет едет ровно настолько, насколько человек сдвинул
 * пальцем, — карта поворачивается под ним, как настоящая.
 *
 * Размер задаёт витрина (`--pass-card-h`), всё внутри — доли от него, чтобы
 * карта одинаково держала пропорции на телефоне и в консоли на десктопе.
 */
export default function PassArt({ plan, name, material, studioName, offset, countUp, reduce }: Props) {
  const { t } = useTranslation();
  const paths = useMemo(() => guilloche(plan.id), [plan.id]);
  const sheen = useTransform(offset, [-1.5, 1.5], ['-70%', '70%']);
  const foil = useTransform(offset, [-1.5, 1.5], ['0% 50%', '100% 50%']);

  const count = useMotionValue(countUp && !reduce ? 0 : plan.class_count);
  const shown = useTransform(count, (value) => Math.round(value));
  useEffect(() => {
    if (!countUp || reduce) return;
    const run = animate(count, plan.class_count, { duration: 1.1, delay: 0.35, ease: [0.16, 1, 0.3, 1] });
    return () => run.stop();
  }, [countUp, reduce, count, plan.class_count]);

  return (
    <div data-material={material} className="pass-art relative h-full w-full overflow-hidden rounded-[22px]">
      <svg aria-hidden="true" viewBox={`0 0 ${ART_W} ${ART_H}`} preserveAspectRatio="xMidYMid slice" className="pass-art-engrave absolute inset-0 h-full w-full">
        {paths.map((d, index) => <path key={index} d={d} />)}
      </svg>
      {!reduce && <motion.span aria-hidden="true" style={{ x: sheen }} className="pass-art-sheen absolute inset-y-[-20%] left-[-30%] w-[160%]" />}

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
            style={reduce ? undefined : { backgroundPosition: foil }}
            className="pass-art-numeral block font-extrabold leading-[0.82] tabular-nums tracking-[-0.07em]"
          >
            {countUp && !reduce ? <motion.span>{shown}</motion.span> : plan.class_count}
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
}
