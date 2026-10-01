import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import type { StudioCatalog } from '../../api/studio';
import type { BookingWizardFlow } from '../../hooks/useBookingWizard';
import { useBusinessTerms } from '../../hooks/useBusinessTerms';
import { useWizardWords } from '../../hooks/useWizardWords';
import { formatDay, relativeDay, upperFirst } from '../../lib/slots';
import { hhmm } from '../../lib/wizard';
import { cn } from '../../lib/utils';
import { Avatar } from './WizardChoices';
import { WizardBranches, WizardNotice } from './WizardSummary';

/** Мелкая подпись над значением билета. */
const Caption = ({ children }: { children: React.ReactNode }) => (
  <div className="text-[10.5px] font-extrabold uppercase tracking-[0.18em] text-muted-foreground">{children}</div>
);

/**
 * Итог записи на десктопе — билет: время крупно, мастер с портретом, услуга и
 * цена под линией отрыва. Строк «Изменить» здесь нет: всё выбранное уже стоит
 * в колонке шагов слева, и каждая строка там ведёт в свой раздел.
 *
 * Время окончания — только из quote: длительность «любого» мастера до ответа
 * сервера неизвестна, и обещать «до 16:45» наугад нельзя.
 */
export default function WizardTicket({ flow, catalog }: { flow: BookingWizardFlow; catalog: StudioCatalog | null }) {
  const { t, i18n } = useTranslation();
  const words = useWizardWords(flow);
  const terms = useBusinessTerms('resource', flow.service?.terminology_profile ?? null);
  const { pick, quote } = flow;
  if (pick.time === null) return null;

  // «Любой» после quote — конкретный человек: показываем и его портрет.
  const member = words.memberOf(pick) ?? flow.staff.find((row) => row.teacher_id === quote?.terms.teacher_id) ?? null;
  const relative = relativeDay(pick.day, flow.today);
  const longDay = upperFirst(formatDay(pick.day, i18n.language, { weekday: 'long', day: 'numeric', month: 'long' }));
  const end = quote ? pick.time + quote.terms.duration_min : null;
  const branch = (catalog?.branches.length ?? 0) > 1
    ? catalog?.branches.find((row) => row.id === flow.branchId)?.name ?? null
    : null;

  return (
    <div className="flex flex-col gap-4">
      <WizardNotice flow={flow} />

      <motion.div
        initial={{ opacity: 0, y: 14, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="relative overflow-hidden rounded-[26px] bg-background"
      >
        <div aria-hidden="true" className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-brand/25 blur-3xl" />

        <div className="relative px-7 pb-6 pt-7">
          <div className="truncate text-[11px] font-extrabold uppercase tracking-[0.2em] text-brand">
            {relative ? `${t(`booking.${relative}`)} · ${longDay}` : longDay}
          </div>

          <div className="mt-2.5 flex items-end justify-between gap-6">
            <div className="shrink-0">
              <div className="text-[64px] font-extrabold leading-[0.88] tracking-[-0.055em] tabular-nums text-foreground">
                {hhmm(pick.time)}
              </div>
              <div className="mt-2.5 text-[13px] font-semibold text-muted-foreground">
                {end !== null ? t('wizard.until', { time: hhmm(end) }) : words.duration(pick)}
              </div>
            </div>

            <div className="flex min-w-0 items-center gap-3.5 text-right">
              <div className="min-w-0">
                <Caption>{terms.staff?.singular ?? t('wizard.tabs.master')}</Caption>
                <div className="mt-1 line-clamp-2 break-words text-[16px] font-extrabold leading-tight tracking-[-0.02em] text-foreground">{words.master(pick)}</div>
                {member?.department && <div className="truncate text-[12px] font-semibold text-muted-foreground">{member.department}</div>}
              </div>
              {member ? (
                <span className="shrink-0 rounded-full ring-4 ring-card"><Avatar member={member} size={56} /></span>
              ) : (
                <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-foreground text-background ring-4 ring-card">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
                    <circle cx="9" cy="8" r="3" /><path d="M3.5 19a5.5 5.5 0 0 1 11 0" /><circle cx="17" cy="9" r="2.4" /><path d="M15.5 14.2A4.5 4.5 0 0 1 21 18.5" />
                  </svg>
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Линия отрыва: пунктир и два выреза цветом листа по краям. */}
        <div aria-hidden="true" className="relative mx-7 border-t-2 border-dashed border-foreground/10">
          <span className="absolute -left-10 -top-[13px] h-6 w-6 rounded-full bg-card" />
          <span className="absolute -right-10 -top-[13px] h-6 w-6 rounded-full bg-card" />
        </div>

        <div className="relative flex flex-wrap items-end justify-between gap-x-6 gap-y-4 px-7 pb-7 pt-6">
          <div className="min-w-0">
            <Caption>{t('wizard.tabs.service')}</Caption>
            <div className="mt-1 text-[20px] font-extrabold leading-tight tracking-[-0.025em] text-foreground">{words.service(pick)}</div>
            {branch && <div className="mt-1 text-[13px] font-semibold text-muted-foreground">{branch}</div>}
          </div>
          <div className="text-right">
            <Caption>{t('resource.price')}</Caption>
            <div className={cn('mt-1 text-[30px] font-extrabold leading-none tabular-nums tracking-[-0.04em] text-foreground', flow.quoting && 'animate-pulse')}>
              {words.price(pick)}
            </div>
          </div>
        </div>
      </motion.div>

      <WizardBranches flow={flow} catalog={catalog} />

      {quote?.next_action === 'wait_approval' && (
        <div className="rounded-2xl bg-background px-4 py-3 text-[12.5px] font-medium text-muted-foreground">{t('resource.next.wait_approval')}</div>
      )}
    </div>
  );
}
