import { motion, useReducedMotion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/utils';

export function PassEmblem({ className = '' }: { className?: string }) {
  return (
    <span aria-hidden="true" className={cn('relative flex h-14 w-14 shrink-0 items-center justify-center rounded-[18px] bg-background shadow-button', className)}>
      <svg viewBox="0 0 40 40" fill="none" className="h-10 w-10">
        <rect x="8" y="6" width="23" height="29" rx="6" transform="rotate(-12 8 6)" fill="var(--v-brand)" />
        <rect x="10" y="7" width="24" height="29" rx="6" fill="var(--v-card)" stroke="var(--v-foreground)" strokeOpacity=".16" />
        <path d="M16 16h12M16 21h7" stroke="var(--v-foreground)" strokeWidth="1.8" strokeLinecap="round" />
        <circle cx="27" cy="28" r="3" fill="var(--v-brand)" />
      </svg>
    </span>
  );
}

export default function SubscriptionPurchaseButton({ canPayOnline, onClick }: { canPayOnline: boolean; onClick: () => void }) {
  const { t } = useTranslation();
  const reduce = useReducedMotion();
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileTap={reduce ? undefined : { scale: 0.985 }}
      className="group flex w-full items-center gap-4 rounded-[24px] bg-card p-5 text-left shadow-soft transition-shadow hover:shadow-lift focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand"
    >
      <PassEmblem />
      <span className="min-w-0 flex-1">
        <span className="block text-[16px] font-extrabold leading-snug tracking-[-0.025em] text-foreground">{t(canPayOnline ? 'profile.buy_btn' : 'pass.view')}</span>
        <span className="mt-1.5 block text-[12px] font-medium leading-relaxed text-muted-foreground">{t(canPayOnline ? 'pass.choose_hint' : 'buyModal.pay_in_studio')}</span>
      </span>
      <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand text-brand-foreground">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><path d="m9 5 7 7-7 7" /></svg>
      </span>
    </motion.button>
  );
}
