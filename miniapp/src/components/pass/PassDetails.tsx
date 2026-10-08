import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import type { SubscriptionPackageInfo } from '../../api/studio';
import { money } from '../../lib/money';
import RollingText from './RollingText';

const ease = [0.16, 1, 0.3, 1] as const;

/**
 * Что выбрано в витрине — простым набором, без плашек: карта над ним уже
 * предмет, второй предмет рядом спорил бы с ней. Цена прокручивается
 * посимвольно в сторону листания, название въезжает оттуда же.
 *
 * Цена визита считается здесь: сервер её не присылает, а без неё пакеты
 * разного размера не сравнить — «5 за 2 900» и «3 за 1 890» человек в уме
 * не делит.
 */
export default function PassDetails({ plan, name, dir, currency, reduce }: {
  plan: SubscriptionPackageInfo;
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
      <div className="relative min-h-[22px] overflow-hidden">
        <AnimatePresence mode="popLayout" initial={false} custom={dir}>
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
            className="truncate text-[16px] font-extrabold tracking-[-0.025em] text-card-foreground"
          >
            {name}
          </motion.h3>
        </AnimatePresence>
      </div>

      <div className="mt-1 flex flex-wrap items-baseline gap-x-3">
        <RollingText
          text={plan.final_price_str}
          dir={dir}
          reduce={reduce}
          className="text-[length:var(--pass-price-size)] font-extrabold leading-none tabular-nums tracking-[-0.05em] text-card-foreground"
        />
        {plan.discount_label && plan.price_str !== plan.final_price_str && (
          <span className="text-[13px] font-semibold tabular-nums text-muted-foreground line-through">{plan.price_str}</span>
        )}
      </div>

      <div className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1 text-[12.5px] font-semibold text-muted-foreground">
        {visitStr && <span>{t('buyModal.per_visit', { price: visitStr })}</span>}
        <span>{t('buyModal.duration', { count: plan.duration_days })}</span>
      </div>
    </div>
  );
}
