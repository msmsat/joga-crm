import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import type { SubscriptionPackageInfo } from '../../api/studio';
import { fractionOf, money } from '../../lib/money';
import PriceRoll from './PriceRoll';

const ease = [0.16, 1, 0.3, 1] as const;

/**
 * Что выбрано в витрине — простым набором, без плашек: карта над ним уже
 * предмет, второй предмет рядом спорил бы с ней. Цена крутится барабанами по
 * разрядам (PriceRoll), название въезжает со стороны листания.
 *
 * Цена визита считается здесь: сервер её не присылает, а без неё пакеты
 * разного размера не сравнить — «5 за 2 900» и «3 за 1 890» человек в уме
 * не делит.
 */
export default function PassDetails({ plan, prices, name, dir, currency, reduce }: {
  plan: SubscriptionPackageInfo;
  /** Цены всех пакетов витрины: барабанов цены — под самую длинную. */
  prices: number[];
  name: string;
  dir: number;
  currency: string;
  reduce: boolean;
}) {
  const { t, i18n } = useTranslation();
  const visit = plan.class_count > 0 ? plan.final_price / plan.class_count : null;
  const visitStr = visit === null ? '' : `${Number.isInteger(visit) ? '' : '≈ '}${money(visit, currency, i18n.language)}`;

  return (
    <div aria-live="polite" className="pass-details relative">
      <div className="grid overflow-hidden">
        <AnimatePresence initial={false} custom={dir}>
          <motion.h3
            key={plan.id}
            custom={dir}
            variants={{
              enter: (d: number) => ({ x: d >= 0 ? 28 : -28, opacity: 0 }),
              center: { x: 0, opacity: 1 },
              leave: (d: number) => ({ x: d >= 0 ? -28 : 28, opacity: 0 }),
            }}
            initial={reduce ? false : 'enter'}
            animate="center"
            exit="leave"
            transition={{ duration: 0.38, ease }}
            className="truncate [grid-area:1/1] text-[length:var(--pass-name-size)] font-extrabold leading-tight tracking-[-0.025em] text-card-foreground dt:line-clamp-2 dt:whitespace-normal"
          >
            {name}
          </motion.h3>
        </AnimatePresence>
      </div>

      <div className="mt-1 flex flex-wrap items-baseline gap-x-3">
        <PriceRoll
          value={plan.final_price}
          set={prices}
          currency={currency}
          locale={i18n.language}
          reduce={reduce}
          className="text-[length:var(--pass-price-size)] font-extrabold leading-none tabular-nums tracking-[-0.05em] text-card-foreground"
        />
        {/* Прежняя цена — тем же форматом, что и новая рядом: строка сервера
            набрана языком студии, и на английском встала бы «€64» рядом с
            зачёркнутым «70 €». */}
        {plan.discount_label && plan.price !== plan.final_price && (
          <span className="text-[13px] font-semibold tabular-nums text-muted-foreground line-through">
            {money(plan.price, currency, i18n.language, fractionOf([plan.price, ...prices]))}
          </span>
        )}
      </div>

      <div className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1 text-[12.5px] font-semibold text-muted-foreground">
        {visitStr && <span>{t('buyModal.per_visit', { price: visitStr })}</span>}
        <span>{t('buyModal.duration', { count: plan.duration_days })}</span>
      </div>
    </div>
  );
}
