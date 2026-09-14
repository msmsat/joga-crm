import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import DayStrip from './DayStrip';
import { EmptyState } from '../ui/EmptyState';
import { firstDayWithSlots, formatDay, groupByPart, relativeDay, timeOf, upperFirst } from '../../lib/slots';
import type { useResourceBooking } from '../../hooks/useResourceBooking';

type Flow = ReturnType<typeof useResourceBooking>;

const clockIcon = (
  <>
    <circle cx="12" cy="12" r="9" />
    <polyline points="12 7 12 12 15 14" />
  </>
);

/**
 * Выбор дня и времени — одним экраном листа.
 *
 * Сверху лента дней, под ней время выбранного дня тремя группами (утро, день,
 * вечер): длинный список часов читается кусками, а не сплошной сеткой в сорок
 * кнопок. Четыре колонки — кнопка 48px в высоту и не уже 62px даже на 320px.
 *
 * Пустоты без объяснения здесь нет: нет времени в дне — называем ближайший
 * свободный; нет в загруженных днях — предлагаем следующие; нет до горизонта
 * студии — предлагаем другого мастера.
 */
export default function TimeStep({ flow, onOtherMaster }: { flow: Flow; onOtherMaster?: () => void }) {
  const { t, i18n } = useTranslation();

  const when = (day: string) => {
    const relative = relativeDay(day, flow.today);
    return relative ? t(`booking.${relative}`) : formatDay(day, i18n.language, { weekday: 'short', day: 'numeric', month: 'short' });
  };

  if (flow.loadError) {
    return (
      <div className="flex flex-col items-center">
        <EmptyState size="sm" title={t('resource.loadError')} icon={clockIcon} />
        <InlineAction onClick={flow.retryLoad}>{t('booking.retry')}</InlineAction>
      </div>
    );
  }

  if (flow.isFirstLoad) {
    return (
      <div aria-busy="true">
        <div className="mb-3 h-4 w-28 animate-pulse rounded-full bg-muted" />
        <div className="flex gap-2 overflow-hidden">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="h-[70px] w-[54px] shrink-0 animate-pulse rounded-[16px] bg-background" />
          ))}
        </div>
        <div className="mt-7 grid grid-cols-4 gap-2">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="h-12 animate-pulse rounded-2xl bg-background" style={{ animationDelay: `${i * 60}ms` }} />
          ))}
        </div>
      </div>
    );
  }

  // Сервер отказал всему диапазону по причине, которую день не исправит.
  const blocked = flow.byDay.size === 0 ? flow.reason : null;
  if (blocked && !flow.hasMore) {
    return (
      <div className="flex flex-col items-center">
        <EmptyState
          size="sm"
          icon={clockIcon}
          title={t(`booking.reason.${blocked}`, { defaultValue: t('resource.noSlotsWindow') })}
        />
        {onOtherMaster && <InlineAction onClick={onOtherMaster}>{t('resource.otherMaster')}</InlineAction>}
      </div>
    );
  }

  const next = flow.day ? firstDayWithSlots(flow.days, flow.byDay, flow.day) : null;

  return (
    <div>
      {flow.notice && (
        <motion.div
          role="alert"
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-4 rounded-2xl bg-danger/12 px-4 py-3 text-[13px] font-semibold leading-snug text-foreground"
        >
          {t(`resource.errors.${flow.notice.code}`, { defaultValue: t('resource.bookError') })}
        </motion.div>
      )}

      <DayStrip
        days={flow.days}
        selected={flow.day}
        today={flow.today}
        byDay={flow.byDay}
        onPick={flow.pickDay}
        hasMore={flow.hasMore}
        loadingMore={flow.isLoading}
        onMore={flow.loadMore}
      />

      {flow.day === null ? (
        // Во всех загруженных днях пусто.
        <div className="flex flex-col items-center pt-2">
          <EmptyState
            size="sm"
            icon={clockIcon}
            title={flow.hasMore || flow.isLoading ? t('resource.noSlotsRange') : t('resource.noSlotsWindow')}
            hint={flow.hasMore || flow.isLoading ? undefined : t('resource.noSlotsWindowHint')}
          />
          {flow.hasMore ? (
            <InlineAction onClick={flow.loadMore}>{t('resource.showMoreDays')}</InlineAction>
          ) : (
            !flow.isLoading && onOtherMaster && <InlineAction onClick={onOtherMaster}>{t('resource.otherMaster')}</InlineAction>
          )}
        </div>
      ) : flow.slotsOfDay.length === 0 ? (
        <div className="flex flex-col items-center pt-2">
          <EmptyState size="sm" icon={clockIcon} title={t('resource.noSlotsDay')} />
          {next ? (
            <InlineAction onClick={() => flow.pickDay(next)}>
              {t('resource.nextFree', { when: when(next) })}
            </InlineAction>
          ) : flow.hasMore ? (
            <InlineAction onClick={flow.loadMore}>{t('resource.showMoreDays')}</InlineAction>
          ) : null}
        </div>
      ) : (
        <div className="pt-6">
          <div className="text-[15px] font-extrabold tracking-[-0.015em] text-card-foreground">
            {upperFirst(formatDay(flow.day, i18n.language, { weekday: 'long', day: 'numeric', month: 'long' }))}
          </div>
          {groupByPart(flow.slotsOfDay).map((group) => (
            <section key={group.part} className="pt-4">
              <div className="pb-2.5 text-[10px] font-extrabold uppercase tracking-[0.22em] text-muted-foreground">
                {t(`resource.parts.${group.part}`)}
              </div>
              <div className="grid grid-cols-4 gap-2">
                {group.slots.map((slot) => (
                  <motion.button
                    key={slot.starts_at}
                    type="button"
                    onClick={() => void flow.requestQuote(slot)}
                    whileTap={{ scale: 0.94 }}
                    transition={{ type: 'spring', stiffness: 420, damping: 30 }}
                    className="flex h-12 items-center justify-center rounded-2xl bg-background text-[15px] font-bold tabular-nums text-foreground"
                  >
                    {timeOf(slot.local_start)}
                  </motion.button>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function InlineAction({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileTap={{ scale: 0.96 }}
      className="-mt-2 min-h-11 rounded-full bg-brand/12 px-5 text-[13.5px] font-extrabold text-foreground"
    >
      {children}
    </motion.button>
  );
}
