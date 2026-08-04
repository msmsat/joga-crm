import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Sheet } from '../ui/Sheet';
import { studioState, STATE_COLOR } from '../../lib/studio-status';
import type { Studio, StudioService } from '../../api/studio';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  studio: Studio | null;
  /** Все услуги студии — связи «услуга ↔ филиал» в модели нет, список общий. */
  services: StudioService[];
  isLiked: boolean;
  onToggleLike: () => void;
  onServicePick: (service: StudioService) => void;
};

/**
 * Студия целиком: что это за место и что в нём можно взять.
 *
 * Услуга здесь — вход в расписание, а не карточка товара, поэтому у строки
 * ровно три числа: длительность, уровень и цена. Всё остальное клиент увидит,
 * когда выберет время.
 */
export default function StudioSheet({
  isOpen,
  onClose,
  studio,
  services,
  isLiked,
  onToggleLike,
  onServicePick,
}: Props) {
  const { t } = useTranslation();

  if (!studio) return null;

  const state = studioState(studio.opens, studio.closes);

  return (
    <Sheet
      isOpen={isOpen}
      onClose={onClose}
      kicker={studio.city ?? undefined}
      title={studio.name}
      subtitle={studio.address ?? undefined}
    >
      <div className="flex items-center gap-2">
        <span className="flex items-center gap-2 rounded-full bg-background px-3 py-2">
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: STATE_COLOR[state] }} />
          <span className="text-[11.5px] font-bold text-foreground">{t(`studio.${state}`)}</span>
        </span>

        <span className="flex items-center gap-1.5 rounded-full bg-background px-3 py-2">
          <svg viewBox="0 0 24 24" fill="none" stroke="var(--v-muted-foreground)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3">
            <circle cx="12" cy="12" r="9" />
            <polyline points="12 7 12 12 15 14" />
          </svg>
          <span className="text-[11.5px] font-bold tabular-nums text-foreground">
            {studio.opens} — {studio.closes}
          </span>
        </span>

        <motion.button
          type="button"
          onClick={onToggleLike}
          whileTap={{ scale: 0.85 }}
          animate={isLiked ? { scale: [1, 1.22, 1] } : { scale: 1 }}
          transition={{ type: 'spring', stiffness: 420, damping: 18 }}
          aria-pressed={isLiked}
          aria-label={t('studio.like')}
          className={`ml-auto flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
            isLiked ? 'bg-brand/14' : 'bg-background'
          }`}
        >
          <svg
            viewBox="0 0 24 24"
            fill={isLiked ? 'var(--v-brand)' : 'none'}
            stroke={isLiked ? 'var(--v-brand)' : 'var(--v-muted-foreground)'}
            strokeWidth="1.9"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-[17px] w-[17px]"
          >
            <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
          </svg>
        </motion.button>
      </div>

      <div className="flex items-baseline justify-between pb-3 pt-7">
        <span className="text-[10px] font-extrabold uppercase tracking-[0.22em] text-muted-foreground">
          {t('studio.services')}
        </span>
        <span className="text-[10px] font-bold tabular-nums tracking-[0.14em] text-muted-foreground/70">
          {services.length}
        </span>
      </div>

      <div className="flex flex-col gap-2">
        {services.map((service, i) => (
          <motion.button
            key={service.id}
            type="button"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.34, delay: i * 0.04, ease: [0.16, 1, 0.3, 1] }}
            whileTap={{ scale: 0.985 }}
            onClick={() => onServicePick(service)}
            className="flex items-center gap-3 rounded-[20px] bg-background px-4 py-4 text-left"
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-extrabold tracking-[-0.02em] text-foreground">
                {t(`lesson.name.${service.name}`, { defaultValue: service.name })}
              </span>
              <span className="mt-1 block text-[11.5px] font-medium text-muted-foreground">
                {service.duration_min} {t('common.minutes')}
              </span>
            </span>

            <span className="shrink-0 text-[14px] font-extrabold tabular-nums tracking-[-0.02em] text-foreground">
              {service.price_str}
            </span>

            <svg viewBox="0 0 24 24" fill="none" stroke="var(--v-brand)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </motion.button>
        ))}
      </div>
    </Sheet>
  );
}
