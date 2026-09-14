import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { EmptyState } from '../../../components/ui/EmptyState';
import type { Studio } from '../../../api/studio';

/**
 * Адрес — шаг листа, когда выбранный мастер (или «любой») принимает в
 * нескольких выбранных филиалах. Время и бронь считаются по одному адресу,
 * поэтому его спрашивают до календаря, а не угадывают.
 */
export default function BranchStep({ options, onPick }: { options: Studio[]; onPick: (branchId: number) => void }) {
  const { t } = useTranslation();

  if (options.length === 0) {
    return <EmptyState size="sm" title={t('booking.noStaffForService')} />;
  }

  return (
    <div className="flex flex-col gap-2">
      {options.map((branch, index) => {
        const where = [branch.city, branch.address].filter(Boolean).join(', ');
        return (
          <motion.button
            key={branch.id}
            type="button"
            onClick={() => onPick(branch.id)}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.28, delay: Math.min(index, 6) * 0.03, ease: [0.16, 1, 0.3, 1] }}
            whileTap={{ scale: 0.97 }}
            className="flex min-h-[66px] w-full items-center justify-between gap-3 rounded-[18px] bg-background px-4 py-3 text-left"
          >
            <span className="flex min-w-0 items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand/12">
                <svg viewBox="0 0 24 24" fill="none" stroke="var(--v-brand)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" />
                  <circle cx="12" cy="10" r="3" />
                </svg>
              </span>
              <span className="min-w-0">
                <span className="block break-words text-[15px] font-extrabold leading-snug tracking-[-0.015em] text-card-foreground">
                  {branch.name}
                </span>
                {where && (
                  <span className="mt-0.5 block truncate text-[12.5px] font-semibold text-muted-foreground">{where}</span>
                )}
              </span>
            </span>
            <svg viewBox="0 0 24 24" fill="none" stroke="var(--v-muted-foreground)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </motion.button>
        );
      })}
    </div>
  );
}
