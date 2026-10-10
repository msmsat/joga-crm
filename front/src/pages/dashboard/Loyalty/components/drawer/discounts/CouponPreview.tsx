import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import s from './Discounts.module.css';
import { daysBetween, type DiscountDraft } from './discountModel';
import { useDiscountFormat } from './useDiscountFormat';
import { useDiscountSummary } from './useDiscountCatalog';
import { IconCalendar, IconCoins, IconTarget, IconUsers } from './DiscountIcons';

// Скидка, какой её увидят: купон с отрывным корешком. Живёт над формой и
// меняется с каждым нажатием — размер прокручивается, строки условий
// переписываются. Это ответ на «что я сейчас создаю», который иначе пришлось
// бы собирать в голове из шести полей.

export default function CouponPreview({ draft }: { draft: DiscountDraft }) {
  const { t } = useTranslation('loyalty');
  const reduce = useReducedMotion();
  const f = useDiscountFormat();
  const summary = useDiscountSummary();
  const valueText = f.value(draft.discount_type, draft.value);
  const length = draft.valid_from && draft.valid_until ? daysBetween(draft.valid_from, draft.valid_until) + 1 : null;
  const minimum = Number(draft.min_purchase_amount);

  const facts = [
    {
      key: 'period', icon: <IconCalendar size={14} />,
      text: f.period(draft.valid_from, draft.valid_until),
      tail: length ? t('discounts.preview.days', { count: length }) : null,
    },
    { key: 'scope', icon: <IconTarget size={14} />, text: summary.scope(draft), tail: null },
    { key: 'audience', icon: <IconUsers size={14} />, text: summary.audience(draft), tail: null },
    ...(minimum > 0 ? [{
      key: 'minimum', icon: <IconCoins size={14} />,
      text: t('discounts.preview.minimum', { amount: f.money(minimum) }), tail: null,
    }] : []),
  ];

  return (
    <div className={s.coupon} data-paused={!draft.is_active || undefined} aria-live="polite">
      <div className={s.couponStub}>
        {/* Длинная сумма («−1 500 Kč») мельче, чтобы не вылезти за корешок. */}
        <div className={s.couponValueWrap} data-long={valueText.length > 9 ? '2' : valueText.length > 6 ? '1' : undefined}
             data-empty={draft.value.trim() === '' || undefined}>
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={valueText}
              className={s.couponValue}
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: 18, filter: 'blur(4px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, y: -18, filter: 'blur(4px)' }}
              transition={{ type: 'spring', stiffness: 420, damping: 32 }}
            >
              {valueText}
            </motion.span>
          </AnimatePresence>
        </div>
        <span className={s.couponKind}>
          {draft.discount_type === 'percent' ? t('discounts.preview.percentKind') : t('discounts.preview.amountKind')}
        </span>
      </div>
      <div className={s.couponPerf} aria-hidden="true" />
      <div className={s.couponBody}>
        <div className={`${s.couponName}${draft.name.trim() ? '' : ` ${s.couponNameEmpty}`}`}>
          {draft.name.trim() || t('discounts.preview.untitled')}
        </div>
        <ul className={s.couponFacts}>
          {facts.map(fact => (
            <li key={fact.key}>
              <span className={s.couponFactIcon}>{fact.icon}</span>
              <AnimatePresence mode="wait" initial={false}>
                <motion.span
                  key={fact.text + (fact.tail ?? '')}
                  className={s.couponFactText}
                  initial={{ opacity: 0, x: reduce ? 0 : 6 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.18 }}
                >
                  {fact.text}
                  {fact.tail && <span className={s.couponFactTail}>{fact.tail}</span>}
                </motion.span>
              </AnimatePresence>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
