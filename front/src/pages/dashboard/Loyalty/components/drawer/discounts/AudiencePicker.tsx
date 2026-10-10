import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { FieldLabel } from '../../../../../../components/ui/index';
import { loyaltyApi } from '../../../../../../api/loyalty/loyalty.api';
import { queryKeys } from '../../../../../../api/queryKeys';
import type { DiscountSegment } from '../../../../../../api/loyalty/loyalty.types';
import { ResourceClientPicker } from '../../../../Journal/components/modals/ResourceClientPicker';
import s from './Discounts.module.css';
import { SEGMENTS, type DiscountDraft } from './discountModel';
import {
  IconCake, IconCheck, IconGem, IconLayers, IconMoon, IconPulse, IconSprout, IconTicket,
  IconUserCheck, IconUsers, IconX,
} from './DiscountIcons';

interface Props {
  draft: DiscountDraft;
  onChange: (patch: Partial<DiscountDraft>) => void;
  done: boolean;
  attempted: boolean;
}

const SEGMENT_ICON: Record<DiscountSegment, React.ReactNode> = {
  new: <IconSprout />,
  birthday: <IconCake />,
  vip: <IconGem />,
  active: <IconPulse />,
  inactive: <IconMoon />,
  has_subscription: <IconTicket />,
};

const MODES = [
  { value: 'all', icon: <IconUsers /> },
  { value: 'segments', icon: <IconLayers /> },
  { value: 'clients', icon: <IconUserCheck /> },
] as const;

const BIRTHDAY_MAX = 30;

/** «Кому»: всем, группам клиентов (те же, что фильтры страницы Клиентов, и
 *  именинники с окном до и после дня рождения) или отдельным людям. Под
 *  плитками — сколько клиентов сейчас попадает под условие: выбирают по нему. */
export default function AudiencePicker({ draft, onChange, done, attempted }: Props) {
  const { t } = useTranslation(['loyalty', 'common']);
  const grouped = draft.audience === 'segments';
  const segmentsKey = [...draft.segments].sort().join(',');

  const { data: reach } = useQuery({
    queryKey: queryKeys.loyaltyDiscountReach(segmentsKey, draft.birthday_window_days),
    queryFn: () => loyaltyApi.getDiscountReach(draft.segments, draft.birthday_window_days),
    enabled: grouped,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });

  const toggleSegment = (key: DiscountSegment) => onChange({
    segments: draft.segments.includes(key) ? draft.segments.filter(k => k !== key) : [...draft.segments, key],
  });
  const share = reach && reach.clients > 0 ? Math.min(1, reach.total / reach.clients) : 0;
  const days = draft.birthday_window_days;

  return (
    <section className={s.section}>
      <FieldLabel id="discount-audience" label={t('loyalty:discounts.editor.audience')}
                  required={t('common:fields.required')} done={done} />
      <div className={s.modes} role="radiogroup" aria-labelledby="discount-audience">
        {MODES.map(mode => {
          const on = draft.audience === mode.value;
          return (
            <button key={mode.value} type="button" role="radio" aria-checked={on}
                    className={`${s.mode}${on ? ` ${s.modeOn}` : ''}`}
                    onClick={() => onChange({ audience: mode.value })}>
              <span className={s.modeIcon}>{mode.icon}</span>
              <span className={s.modeTitle}>{t(`loyalty:discounts.audience.${mode.value}`)}</span>
              <span className={s.modeSub}>{t(`loyalty:discounts.audience.${mode.value}Hint`)}</span>
            </button>
          );
        })}
      </div>

      <AnimatePresence initial={false} mode="wait">
        {grouped && (
          <motion.div key="segments" className={s.reveal}
                      initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.26, ease: [0.2, 0.8, 0.2, 1] }}>
            <div className={s.segments}>
              {SEGMENTS.map(key => {
                const on = draft.segments.includes(key);
                const count = reach?.segments[key];
                return (
                  <button key={key} type="button" aria-pressed={on}
                          className={`${s.segment}${on ? ` ${s.segmentOn}` : ''}`}
                          onClick={() => toggleSegment(key)}>
                    <span className={s.segmentIcon}>{SEGMENT_ICON[key]}</span>
                    <span className={s.segmentCheck} aria-hidden="true">{on && <IconCheck size={10} />}</span>
                    <span className={s.segmentTitle}>{t(`loyalty:discounts.segments.${key}.title`)}</span>
                    <span className={s.segmentSub}>{t(`loyalty:discounts.segments.${key}.hint`)}</span>
                    <span className={s.segmentCount}>
                      {count === undefined ? '—' : t('loyalty:discounts.audience.people', { count })}
                    </span>
                  </button>
                );
              })}
            </div>

            <AnimatePresence initial={false}>
              {draft.segments.includes('birthday') && (
                <motion.div className={s.birthdayRow}
                            initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}>
                  <span className={s.birthdayIcon}><IconCake size={16} /></span>
                  <span className={s.birthdayText}>
                    {days > 0
                      ? t('loyalty:discounts.audience.birthdayWindow', { count: days })
                      : t('loyalty:discounts.audience.birthdayExact')}
                  </span>
                  <div className={s.stepper}>
                    <button type="button" aria-label={t('loyalty:discounts.audience.less')}
                            disabled={days <= 0}
                            onClick={() => onChange({ birthday_window_days: Math.max(0, days - 1) })}>−</button>
                    <span className={s.stepperValue}>{days}</span>
                    <button type="button" aria-label={t('loyalty:discounts.audience.more')}
                            disabled={days >= BIRTHDAY_MAX}
                            onClick={() => onChange({ birthday_window_days: Math.min(BIRTHDAY_MAX, days + 1) })}>+</button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className={s.reach}>
              <div className={s.reachText}>
                {draft.segments.length === 0
                  ? t('loyalty:discounts.audience.pickGroups')
                  : t('loyalty:discounts.audience.reach', { count: reach?.total ?? 0, total: reach?.clients ?? 0 })}
              </div>
              <div className={s.meter} aria-hidden="true">
                <motion.span className={s.meterFill} animate={{ scaleX: draft.segments.length ? share : 0 }}
                             initial={false} transition={{ type: 'spring', stiffness: 180, damping: 26 }} />
              </div>
            </div>
            {attempted && !done && <div className={s.error} role="alert">{t('loyalty:discounts.errors.segments')}</div>}
          </motion.div>
        )}

        {draft.audience === 'clients' && (
          <motion.div key="clients" className={s.reveal}
                      initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.26, ease: [0.2, 0.8, 0.2, 1] }}>
            <div className={s.clientPicker}>
              <ResourceClientPicker
                value={null}
                label={t('loyalty:discounts.audience.addClient')}
                placeholder={t('loyalty:discounts.audience.searchClient')}
                labelClass={s.pickerLabel}
                onChange={(id, label) => {
                  if (draft.clients.some(c => c.id === id)) return;
                  onChange({ clients: [...draft.clients, { id, name: label || `#${id}` }] });
                }}
              />
            </div>
            {draft.clients.length > 0 ? (
              <div className={s.people}>
                <AnimatePresence initial={false}>
                  {draft.clients.map(client => (
                    <motion.span key={client.id} layout className={s.person}
                                 initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}
                                 exit={{ opacity: 0, scale: 0.8 }}>
                      <span className={s.personAvatar}>{client.name.trim().charAt(0).toUpperCase() || '·'}</span>
                      <span className={s.personName}>{client.name}</span>
                      <button type="button" className={s.personRemove}
                              aria-label={t('loyalty:discounts.audience.removeClient', { name: client.name })}
                              onClick={() => onChange({ clients: draft.clients.filter(c => c.id !== client.id) })}>
                        <IconX size={10} />
                      </button>
                    </motion.span>
                  ))}
                </AnimatePresence>
              </div>
            ) : (
              <p className={s.hint}>{t('loyalty:discounts.audience.noClients')}</p>
            )}
            {attempted && !done && <div className={s.error} role="alert">{t('loyalty:discounts.errors.clients')}</div>}
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
