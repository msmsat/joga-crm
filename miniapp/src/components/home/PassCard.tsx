import { motion, useReducedMotion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import type { SubscriptionPackageInfo } from '../../api/studio';
import type { UserSubscription } from '../../api/user';
import { cn } from '../../lib/utils';
import { PassEmblem } from '../profile/SubscriptionPurchaseButton';

type Props = {
  active: UserSubscription | null;
  loading: boolean;
  packages: SubscriptionPackageInfo[];
  canPayOnline: boolean;
  onOpen: () => void;
  onBuy: () => void;
};

const MAX_SEGMENTS = 16;
const ON = 'text-background dark:text-foreground';

/** Клубная карта: баланс действующего абонемента или вход в выбор пакета. */
export default function PassCard({ active, loading, packages, canPayOnline, onOpen, onBuy }: Props) {
  const { t, i18n } = useTranslation();
  const reduce = useReducedMotion();
  if (loading) {
    return <div aria-busy="true" className="min-h-[var(--home-pass-h)] rounded-[24px] bg-card shadow-soft motion-safe:animate-pulse" />;
  }

  const cheapest = [...packages].sort((a, b) => a.final_price - b.final_price)[0];
  if (!active && !cheapest && canPayOnline) return null;
  const name = active ? t(`subscription.${active.type}.name`, { defaultValue: active.type }) : '';
  const total = Math.max(0, active?.total_classes ?? 0);
  const left = Math.max(0, Math.min(active?.classes_left ?? 0, total));
  const date = active ? new Date(active.expires_at).toLocaleDateString(i18n.language, { day: 'numeric', month: 'long' }) : '';

  return (
    <motion.button
      type="button"
      onClick={active ? onOpen : onBuy}
      whileTap={reduce ? undefined : { scale: 0.985 }}
      className={cn(
        'group relative flex min-h-[var(--home-pass-h)] w-full flex-col gap-4 overflow-hidden rounded-[24px] p-5 text-left shadow-lift transition-shadow hover:shadow-hover focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand dt:p-6',
        active ? 'bg-foreground dark:bg-muted' : 'bg-card',
      )}
    >
      {active ? (
        <>
          <span className="flex items-center justify-between gap-3">
            <span className={cn('text-[13px] font-semibold opacity-70', ON)}>{t('pass.kicker')}</span>
            <span className="rounded-full bg-brand px-3 py-1 text-[11px] font-bold text-brand-foreground">{t(active.is_frozen ? 'profile.frozen' : 'profile.expires', { date })}</span>
          </span>
          <span className="flex items-end justify-between gap-4">
            <span className="min-w-0">
              <span className={cn('block truncate text-[16px] font-extrabold tracking-[-0.025em]', ON)}>{name}</span>
              <span className={cn('mt-1 block text-[12px] font-medium opacity-65', ON)}>{t('pass.details')}</span>
            </span>
            <span className={cn('shrink-0 text-[38px] font-extrabold leading-none tabular-nums tracking-[-0.06em]', ON)}>
              {left}<span className="ml-1 text-[16px] font-semibold opacity-55">/ {total}</span>
            </span>
          </span>
          <Meter left={left} total={total} />
        </>
      ) : (
        <>
          <span className="flex items-center gap-4">
            <PassEmblem />
            <span className="min-w-0 flex-1">
              <span className="block text-[18px] font-extrabold leading-tight tracking-[-0.035em] text-foreground">{t('pass.kicker')}</span>
              {cheapest && (
                <span className="mt-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[12px] font-semibold text-muted-foreground">
                  <span>{cheapest.class_count} {t('common.classes_count')}</span>
                  <span className="font-extrabold tabular-nums text-foreground">{packages.length > 1 ? t('pass.from', { price: cheapest.final_price_str }) : cheapest.final_price_str}</span>
                  {cheapest.discount_label && <span className="rounded-full bg-background px-2 py-0.5 text-[10px] font-bold text-foreground">{cheapest.discount_label}</span>}
                </span>
              )}
            </span>
          </span>
          {!canPayOnline && <span className="block text-[12px] font-medium leading-relaxed text-muted-foreground">{t('buyModal.pay_in_studio')}</span>}
          <span className="flex min-h-11 items-center justify-between gap-3 rounded-[14px] bg-brand px-4 py-3 text-[13px] font-extrabold text-brand-foreground">
            {t(canPayOnline ? 'pass.choose' : 'pass.view')}
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0"><path d="M5 12h14m-6-6 6 6-6 6" /></svg>
          </span>
        </>
      )}
    </motion.button>
  );
}

function Meter({ left, total }: { left: number; total: number }) {
  if (total <= 0) return null;
  return total > MAX_SEGMENTS ? (
    <span className="block h-1.5 overflow-hidden rounded-full bg-white/[0.15]">
      <span className="block h-full rounded-full bg-brand" style={{ width: `${(left / total) * 100}%` }} />
    </span>
  ) : (
    <span className="flex gap-1.5">
      {Array.from({ length: total }, (_, index) => <span key={index} className={cn('h-1.5 flex-1 rounded-full', index < left ? 'bg-brand' : 'bg-white/[0.15]')} />)}
    </span>
  );
}
