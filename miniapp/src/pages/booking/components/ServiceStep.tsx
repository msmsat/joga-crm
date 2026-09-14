import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { EmptyState } from '../../../components/ui/EmptyState';
import type { StudioService } from '../../../api/studio';

/**
 * Услуги выбранного мастера — первый шаг листа, когда человек начал с мастера.
 *
 * Без услуги время не спросить: у неё своя длительность, цена и доступность.
 * Поэтому здесь только его услуги (у «любого» — все услуги филиала), и каждая
 * сразу с длительностью и ценой — выбирать вслепую не приходится.
 */
export default function ServiceStep({ options, onPick }: { options: StudioService[]; onPick: (service: StudioService) => void }) {
  const { t } = useTranslation();

  if (options.length === 0) {
    return <EmptyState size="sm" title={t('booking.noServicesForMaster')} />;
  }

  return (
    <div className="flex flex-col gap-2">
      {options.map((service, index) => (
        <motion.button
          key={service.id}
          type="button"
          onClick={() => onPick(service)}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28, delay: Math.min(index, 6) * 0.03, ease: [0.16, 1, 0.3, 1] }}
          whileTap={{ scale: 0.97 }}
          className="flex min-h-[66px] w-full items-center justify-between gap-3 rounded-[18px] bg-background px-4 py-3 text-left"
        >
          <span className="min-w-0">
            <span className="block break-words text-[15px] font-extrabold leading-snug tracking-[-0.015em] text-card-foreground">
              {t(`lesson.name.${service.name}`, { defaultValue: service.name })}
            </span>
            <span className="mt-0.5 block text-[12.5px] font-semibold tabular-nums text-muted-foreground">
              {t('booking.duration', { min: service.duration_min })} · {service.price_str}
            </span>
          </span>
          <svg viewBox="0 0 24 24" fill="none" stroke="var(--v-muted-foreground)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </motion.button>
      ))}
    </div>
  );
}
