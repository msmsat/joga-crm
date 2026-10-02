import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { addDays, formatDay, upperFirst } from '../../lib/slots';
import { freeTimes, groupMinutes, hhmm } from '../../lib/wizard';
import { cn } from '../../lib/utils';
import type { BookingWizardFlow } from '../../hooks/useBookingWizard';
import { WizardEmpty } from './WizardRow';
import type { Preview } from './WizardChoices';
import DayStrip from './DayStrip';

/**
 * Раздел «Время»: лента дней и свободные часы выбранного дня по частям дня.
 *
 * Часы — объединение окон всех услуг и мастеров, пока они не выбраны, и только
 * их окна, когда выбраны (`lib/wizard.freeTimes`). Тап по часу выбирает его и
 * ведёт в следующий невыбранный раздел. На широкой колонке консоли часы идут
 * в шесть рядов вместо четырёх: день целиком помещается без прокрутки.
 */
export default function WizardTime({ flow, onPreview }: { flow: BookingWizardFlow; onPreview?: Preview }) {
  const { t, i18n } = useTranslation();
  const { pick } = flow;

  const times = flow.rows ? freeTimes(flow.rows, pick) : [];
  const groups = groupMinutes(times);
  const lastDay = flow.days[flow.days.length - 1];
  const nextDay = pick.day < lastDay ? addDays(pick.day, 1) : null;

  return (
    <div>
      <DayStrip days={flow.days} today={flow.today} value={pick.day} onPick={flow.pickDay} />

      <div className="pt-5 text-[15px] font-extrabold tracking-[-0.015em] text-card-foreground">
        {upperFirst(formatDay(pick.day, i18n.language, { weekday: 'long', day: 'numeric', month: 'long' }))}
      </div>

      {flow.dayError ? (
        <div className="pt-4">
          <WizardEmpty title={t('wizard.loadError')} action={t('booking.retry')} onAction={flow.retryDay} />
        </div>
      ) : flow.dayLoading ? (
        <div aria-busy="true" className="grid grid-cols-4 gap-2 pt-4 @xl:grid-cols-6">
          {Array.from({ length: 12 }, (_, i) => (
            <div key={i} className="h-12 animate-pulse rounded-2xl bg-background" style={{ animationDelay: `${i * 50}ms` }} />
          ))}
        </div>
      ) : groups.length === 0 ? (
        <div className="pt-4">
          <WizardEmpty
            title={t('resource.noSlotsDay')}
            action={nextDay ? t('wizard.nextDay') : undefined}
            onAction={nextDay ? () => flow.pickDay(nextDay) : undefined}
          />
        </div>
      ) : (
        // key — новый день въезжает целиком, а не перерисовывается на месте.
        <motion.div
          key={pick.day}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
          onPointerLeave={onPreview ? () => onPreview(null) : undefined}
        >
          {groups.map((group) => (
            <section key={group.part} className="pt-4">
              <div className="pb-2.5 text-[10px] font-extrabold uppercase tracking-[0.22em] text-muted-foreground">
                {t(`resource.parts.${group.part}`)}
              </div>
              <div className="grid grid-cols-4 gap-2 @xl:grid-cols-6">
                {group.times.map((minute) => {
                  const active = minute === pick.time;
                  return (
                    <motion.button
                      key={minute}
                      type="button"
                      onClick={() => flow.pickTime(minute)}
                      onPointerEnter={onPreview ? (event) => { if (event.pointerType === 'mouse') onPreview({ ...pick, time: minute }); } : undefined}
                      whileTap={{ scale: 0.94 }}
                      aria-pressed={active}
                      className={cn(
                        'flex h-12 items-center justify-center rounded-2xl text-[15px] font-bold tabular-nums transition-colors duration-200',
                        active ? 'bg-brand text-brand-foreground shadow-brand' : 'bg-background text-foreground dt:hover:bg-brand/16',
                      )}
                    >
                      {hhmm(minute)}
                    </motion.button>
                  );
                })}
              </div>
            </section>
          ))}
        </motion.div>
      )}
    </div>
  );
}
