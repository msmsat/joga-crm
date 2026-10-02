import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import type { StudioCatalog } from '../../api/studio';
import type { BookingWizardFlow } from '../../hooks/useBookingWizard';
import { useBusinessTerms } from '../../hooks/useBusinessTerms';
import { useWizardWords } from '../../hooks/useWizardWords';
import { branchChoices, type WizardStep } from '../../lib/wizard';
import { cn } from '../../lib/utils';
import { STEP_ICONS } from './stepIcons';

/** Строка итога: что выбрано в разделе и переход в него. Общая с групповым итогом. */
export function SummaryRow({ step, label, value, onChange }: {
  step: WizardStep; label: string; value: string | null; onChange: () => void;
}) {
  const { t } = useTranslation();
  return (
    <motion.button
      type="button"
      onClick={onChange}
      whileTap={{ scale: 0.985 }}
      className="flex w-full items-center gap-3.5 rounded-[20px] bg-background px-4 py-3.5 text-left"
    >
      <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-full p-2.5',
        value ? 'bg-card text-brand shadow-soft' : 'bg-muted text-muted-foreground')}>
        {STEP_ICONS[step]}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[11px] font-extrabold uppercase tracking-[0.14em] text-muted-foreground">{label}</span>
        <span className={cn('mt-0.5 block truncate text-[15px] font-extrabold tracking-[-0.015em]',
          value ? 'text-card-foreground' : 'text-muted-foreground')}>
          {value ?? t('wizard.notChosen')}
        </span>
      </span>
      <span className="shrink-0 text-[12.5px] font-extrabold text-brand">
        {value ? t('wizard.change') : t('wizard.choose')}
      </span>
    </motion.button>
  );
}

/** Ошибка сервера после попытки записаться — над итогом. */
export function WizardNotice({ flow }: { flow: BookingWizardFlow }) {
  const { t } = useTranslation();
  if (!flow.notice) return null;
  return (
    <div role="status" className="rounded-2xl bg-brand/12 px-4 py-3 text-[13px] font-semibold leading-snug text-foreground">
      {t(`resource.errors.${flow.notice}`, { defaultValue: t('resource.bookError') })}
    </div>
  );
}

/** Филиал — чипами, когда окно есть в нескольких. Один — выбирать нечего.
 *  Выбран на главной — тоже: человек уже ответил, куда идёт, и время ему
 *  показано только там. */
export function WizardBranches({ flow, catalog }: { flow: BookingWizardFlow; catalog: StudioCatalog | null }) {
  const { t } = useTranslation();
  const branches = flow.rows ? branchChoices(flow.rows, flow.pick) : [];
  const branchList = (catalog?.branches ?? []).filter((branch) => branches.includes(branch.id));
  if (flow.scope !== null || branchList.length < 2) return null;

  return (
    <div>
      <div className="pb-2 text-[11px] font-extrabold uppercase tracking-[0.14em] text-muted-foreground">{t('resource.branch')}</div>
      <div data-noswipe className="-mx-6 flex gap-2 overflow-x-auto px-6 dt:mx-0 dt:flex-wrap dt:px-0">
        {branchList.map((branch) => {
          const active = flow.branchId === branch.id;
          return (
            <motion.button
              key={branch.id}
              type="button"
              whileTap={{ scale: 0.95 }}
              aria-pressed={active}
              onClick={() => flow.pickBranch(branch.id)}
              className={cn('shrink-0 rounded-full px-4 py-2.5 text-[13.5px] font-extrabold transition-colors',
                active ? 'bg-foreground text-background' : 'bg-background text-foreground dt:hover:bg-muted')}
            >
              {branch.name}
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Итог записи: всё выбранное строками, у каждой — переход в свой раздел.
 * Филиал выбирается прямо здесь, когда окно есть в нескольких. Цена и мастер
 * «любого» — из quote сервера, пока его нет — витринная цена услуги.
 * Записывает кнопка в подвале листа (BookingWizardSheet).
 */
export default function WizardSummary({ flow, catalog }: { flow: BookingWizardFlow; catalog: StudioCatalog | null }) {
  const { t } = useTranslation();
  const terms = useBusinessTerms('resource', flow.service?.terminology_profile ?? null);
  const words = useWizardWords(flow);
  const { pick, quote } = flow;

  return (
    <div className="flex flex-col gap-2.5">
      <WizardNotice flow={flow} />

      <SummaryRow step="time" label={t('wizard.tabs.time')} value={words.when(pick)} onChange={() => flow.goTo('time')} />
      <SummaryRow step="service" label={t('wizard.tabs.service')} value={words.service(pick)} onChange={() => flow.goTo('service')} />
      <SummaryRow step="master" label={terms.staff?.singular ?? t('wizard.tabs.master')} value={words.master(pick)} onChange={() => flow.goTo('master')} />

      <div className="pt-2 empty:hidden">
        <WizardBranches flow={flow} catalog={catalog} />
      </div>

      {flow.service && (
        <div className="mt-2 rounded-[20px] bg-background px-4 py-4">
          <div className="flex items-center justify-between gap-4">
            <span className="text-[12.5px] font-semibold text-muted-foreground">{t('resource.duration')}</span>
            <span className="text-[14px] font-bold text-card-foreground">{words.duration(pick)}</span>
          </div>
          <div className="my-3 border-t border-dashed border-foreground/12" />
          <div className="flex items-center justify-between gap-4">
            <span className="text-[13px] font-bold text-foreground">{t('resource.price')}</span>
            <span className={cn('text-[21px] font-extrabold tabular-nums tracking-[-0.03em] text-foreground', flow.quoting && 'animate-pulse')}>
              {words.price(pick)}
            </span>
          </div>
          {quote?.next_action === 'wait_approval' && (
            <div className="mt-3 text-[12.5px] font-medium text-muted-foreground">{t('resource.next.wait_approval')}</div>
          )}
        </div>
      )}
    </div>
  );
}
