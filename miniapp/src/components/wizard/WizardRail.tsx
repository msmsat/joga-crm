import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import type { StudioCatalog } from '../../api/studio';
import type { BookingWizardFlow } from '../../hooks/useBookingWizard';
import { useBusinessTerms } from '../../hooks/useBusinessTerms';
import { useWizardWords } from '../../hooks/useWizardWords';
import { freeTimes, isChosen, masterChoices, serviceChoices, type WizardPick } from '../../lib/wizard';
import { cn } from '../../lib/utils';
import { STEP_ICONS } from './stepIcons';

const CHOICES = ['time', 'service', 'master'] as const;
type Choice = (typeof CHOICES)[number];

const spring = { type: 'spring', stiffness: 420, damping: 34 } as const;

/** Значение сменилось — старое уходит вверх, новое поднимается снизу. */
function Swap({ id, className, children }: { id: string; className: string; children: React.ReactNode }) {
  return (
    <AnimatePresence mode="popLayout" initial={false}>
      <motion.span
        key={id}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -6 }}
        transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
        className={className}
      >
        {children}
      </motion.span>
    </AnimatePresence>
  );
}

type Props = {
  flow: BookingWizardFlow;
  catalog: StudioCatalog | null;
  /** Выбор, который мышь примеряет прямо сейчас; `null` — примерки нет. */
  preview: WizardPick | null;
};

/**
 * Левая колонка консоли записи (десктоп): шаги со сделанным выбором вместо
 * вкладок, внизу — длительность и цена.
 *
 * Главное здесь — ПРИМЕРКА. Пока мышь над вариантом справа, колонка уже
 * показывает выбор так, будто по нему кликнули: значение проступает акцентом,
 * у невыбранных шагов пересчитано, сколько вариантов останется, цена — уже
 * та, что будет. Последствия видны ДО клика — на телефоне наведения нет, и
 * там остаются вкладки. Сбросить сделанный выбор примерка не может: разделы
 * предлагают только совместимое с ним (`lib/wizard`).
 */
export default function WizardRail({ flow, catalog, preview }: Props) {
  const { t } = useTranslation();
  const words = useWizardWords(flow);
  const terms = useBusinessTerms('resource', flow.service?.terminology_profile ?? null);
  const [brokenLogo, setBrokenLogo] = useState(false);
  const view = preview ?? flow.pick;
  const studio = catalog?.studio;
  const logo = brokenLogo ? null : studio?.logo_url;
  const monogram = (studio?.name ?? '').split(/\s+/).filter(Boolean).map((word) => word[0]).join('').slice(0, 2).toUpperCase();
  const locked = flow.saving || flow.booking !== null;

  const valueOf = (pick: WizardPick, step: Choice) =>
    step === 'time' ? words.when(pick) : step === 'service' ? words.service(pick) : words.master(pick);

  /** Сколько вариантов останется у шага при выборе `pick`; `null` — данных ещё нет. */
  const leftOf = (pick: WizardPick, step: Choice): number | null => {
    if (step === 'time') return flow.rows ? freeTimes(flow.rows, { ...pick, time: null }).length : null;
    if (flow.staffLoading || (pick.time !== null && !flow.rows)) return null;
    return step === 'service'
      ? serviceChoices(flow.services.map((row) => row.id), flow.staff, flow.rows ?? [], pick).length
      : masterChoices(flow.staff, flow.rows ?? [], pick).length;
  };

  const label = (step: Choice) =>
    step === 'master' ? terms.staff?.singular ?? t('wizard.tabs.master') : t(`wizard.tabs.${step}`);

  // Мастер один — его шага нет: он подставлен сам и виден на билете итога.
  const choices = CHOICES.filter((step) => flow.steps.includes(step));
  const missing = choices.filter((step) => !isChosen(flow.pick, step)).length;
  const status = flow.booking ? t('wizard.doneTitle')
    : flow.complete ? t('wizard.ready')
    : missing > 0 ? t('wizard.remaining', { count: missing })
    : t('wizard.chooseBranch');

  const price = words.price(view);
  const duration = words.duration(view);
  const priceGhost = preview !== null && price !== words.price(flow.pick);
  const durationGhost = preview !== null && duration !== words.duration(flow.pick);

  return (
    <div className="flex min-h-full flex-col p-5">
      <div className="flex items-center gap-3 px-1 pt-1">
        {logo ? (
          <img src={logo} alt="" onError={() => setBrokenLogo(true)} className="h-11 w-11 shrink-0 rounded-full object-cover shadow-soft" />
        ) : (
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-foreground text-[13px] font-extrabold tracking-[-0.02em] text-background">
            {monogram || '•'}
          </span>
        )}
        <div className="min-w-0">
          <div className="truncate text-[10px] font-extrabold uppercase tracking-[0.2em] text-brand">{studio?.name}</div>
          <div className="mt-0.5 text-[22px] font-extrabold leading-none tracking-[-0.035em] text-foreground">{t('wizard.title')}</div>
        </div>
      </div>

      <nav className="mt-7 flex flex-col gap-1" aria-label={t('wizard.title')}>
        {choices.map((step) => {
          const real = valueOf(flow.pick, step);
          const shown = valueOf(view, step);
          const ghost = preview !== null && shown !== real;
          const left = shown === null ? leftOf(view, step) : null;
          const leftGhost = preview !== null && left !== leftOf(flow.pick, step);
          const active = flow.step === step && !flow.booking;
          return (
            <button
              key={step}
              type="button"
              disabled={locked}
              onClick={() => flow.goTo(step)}
              aria-current={active ? 'step' : undefined}
              className="group relative flex w-full items-center gap-3 rounded-[18px] px-3 py-3 text-left disabled:cursor-default"
            >
              {active ? (
                <motion.span layoutId="wizard-rail" transition={spring} className="absolute inset-0 rounded-[18px] bg-card shadow-soft" />
              ) : (
                <span className="absolute inset-0 rounded-[18px] transition-colors duration-200 group-enabled:group-hover:bg-card/70" />
              )}
              <span className={cn(
                'relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full p-2.5 transition-colors duration-300',
                ghost ? 'bg-brand/22 text-brand ring-1 ring-inset ring-brand/50'
                  : real ? 'bg-brand text-brand-foreground'
                  : active ? 'bg-brand/14 text-brand'
                  : 'bg-muted text-muted-foreground',
              )}>
                {STEP_ICONS[step]}
              </span>
              <span className="relative min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-[10px] font-extrabold uppercase tracking-[0.16em] text-muted-foreground">{label(step)}</span>
                  {left !== null && (
                    <Swap
                      id={`${step}-${left}`}
                      className={cn('shrink-0 text-[10.5px] font-bold tabular-nums', leftGhost ? 'text-brand' : 'text-muted-foreground')}
                    >
                      {t('wizard.available', { count: left })}
                    </Swap>
                  )}
                </span>
                <Swap
                  id={`${step}-${shown ?? 'none'}`}
                  className={cn(
                    'mt-0.5 line-clamp-2 break-words text-[14px] font-extrabold leading-snug tracking-[-0.015em]',
                    ghost ? 'text-brand' : shown ? 'text-card-foreground' : 'text-muted-foreground/70',
                  )}
                >
                  {shown ?? t('wizard.notChosen')}
                </Swap>
              </span>
            </button>
          );
        })}

        <button
          type="button"
          disabled={locked}
          onClick={() => flow.goTo('summary')}
          aria-current={flow.step === 'summary' && !flow.booking ? 'step' : undefined}
          className="group relative flex w-full items-center gap-3 rounded-[18px] px-3 py-3 text-left disabled:cursor-default"
        >
          {flow.step === 'summary' && !flow.booking ? (
            <motion.span layoutId="wizard-rail" transition={spring} className="absolute inset-0 rounded-[18px] bg-card shadow-soft" />
          ) : (
            <span className="absolute inset-0 rounded-[18px] transition-colors duration-200 group-enabled:group-hover:bg-card/70" />
          )}
          <span className={cn(
            'relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full p-2.5 transition-colors duration-300',
            flow.complete ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground',
          )}>
            {STEP_ICONS.summary}
          </span>
          <span className="relative min-w-0 flex-1">
            <span className="block truncate text-[10px] font-extrabold uppercase tracking-[0.16em] text-muted-foreground">{t('wizard.tabs.summary')}</span>
            <span className={cn('mt-0.5 block truncate text-[14px] font-extrabold tracking-[-0.015em]',
              flow.complete ? 'text-card-foreground' : 'text-muted-foreground/70')}>
              {status}
            </span>
          </span>
        </button>
      </nav>

      <div className="mt-auto pt-6">
        {price ? (
          <div className="rounded-[20px] bg-card p-4 shadow-soft">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[12px] font-semibold text-muted-foreground">{t('resource.duration')}</span>
              <Swap id={`d-${duration}`} className={cn('text-[13px] font-bold', durationGhost ? 'text-brand' : 'text-card-foreground')}>
                {duration}
              </Swap>
            </div>
            <div className="my-3 border-t border-dashed border-foreground/12" />
            <div className="flex items-end justify-between gap-3">
              <span className="pb-0.5 text-[12.5px] font-bold text-foreground">{t('resource.price')}</span>
              <Swap
                id={`p-${price}`}
                className={cn(
                  'text-right text-[22px] font-extrabold leading-none tabular-nums tracking-[-0.035em]',
                  priceGhost ? 'text-brand' : 'text-foreground',
                  flow.quoting && 'animate-pulse',
                )}
              >
                {price}
              </Swap>
            </div>
          </div>
        ) : (
          <p className="px-1 text-[12.5px] font-medium leading-relaxed text-muted-foreground">{t('wizard.hint')}</p>
        )}
      </div>
    </div>
  );
}
