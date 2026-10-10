import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { FieldLabel } from '../../../../../../components/ui/index';
import { Segmented } from '../../../../../../components/ui/modal';
import s from './Discounts.module.css';
import type { DiscountDraft } from './discountModel';
import { useDiscountCatalog } from './useDiscountCatalog';
import { IconCheck, IconInfinity, IconTarget } from './DiscountIcons';

interface Props {
  draft: DiscountDraft;
  onChange: (patch: Partial<DiscountDraft>) => void;
  done: boolean;
  attempted: boolean;
}

interface ChipItem { id: number; label: string; hint?: string; color?: string | null }

function ChipGroup({ title, items, selected, onChange, empty }: {
  title: string; items: ChipItem[]; selected: number[]; onChange: (ids: number[]) => void; empty: string;
}) {
  const { t } = useTranslation('loyalty');
  const chosen = new Set(selected);
  const all = items.length > 0 && items.every(i => chosen.has(i.id));
  const toggle = (id: number) => onChange(chosen.has(id) ? selected.filter(x => x !== id) : [...selected, id]);
  return (
    <div className={s.chipGroup}>
      <div className={s.chipGroupHead}>
        <span className={s.chipGroupTitle}>{title}</span>
        {items.length > 0 && (
          <>
            <span className={s.chipGroupCount}>{t('discounts.scope.counter', { picked: chosen.size, total: items.length })}</span>
            <button type="button" className={s.textBtn}
                    onClick={() => onChange(all ? [] : items.map(i => i.id))}>
              {all ? t('discounts.scope.none') : t('discounts.scope.allOf')}
            </button>
          </>
        )}
      </div>
      {items.length === 0 ? (
        <div className={s.muted}>{empty}</div>
      ) : (
        <div className={s.chips}>
          {items.map(item => {
            const on = chosen.has(item.id);
            return (
              <button key={item.id} type="button" className={`${s.chip}${on ? ` ${s.chipOn}` : ''}`}
                      aria-pressed={on} onClick={() => toggle(item.id)}>
                <span className={s.chipMark}>
                  {on ? <IconCheck size={11} /> : <span className={s.chipDot} style={item.color ? { background: item.color } : undefined} />}
                </span>
                <span className={s.chipLabel}>{item.label}</span>
                {item.hint && <span className={s.chipHint}>{item.hint}</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** «На что действует»: на всё или на выбранные услуги (их занятия и разовые
 *  визиты) и абонементы. Снятый с продажи абонемент виден, только если уже выбран. */
export default function ScopePicker({ draft, onChange, done, attempted }: Props) {
  const { t } = useTranslation(['loyalty', 'common']);
  const { services, packages } = useDiscountCatalog();
  const packageItems = packages
    .filter(p => p.is_active || draft.package_ids.includes(p.id))
    .map(p => ({ id: p.id, label: p.name, hint: t('loyalty:discounts.scope.classes', { count: p.class_count }) }));

  return (
    <section className={s.section}>
      <FieldLabel id="discount-scope" label={t('loyalty:discounts.editor.scope')}
                  required={t('common:fields.required')} done={done} />
      <Segmented
        ariaLabel={t('loyalty:discounts.editor.scope')}
        value={draft.applies_to}
        onChange={value => onChange({ applies_to: value })}
        options={[
          { value: 'all', label: t('loyalty:discounts.scope.all'), icon: <IconInfinity size={15} /> },
          { value: 'selected', label: t('loyalty:discounts.scope.selected'), icon: <IconTarget size={15} /> },
        ]}
      />
      <AnimatePresence initial={false} mode="wait">
        {draft.applies_to === 'all' ? (
          <motion.p key="all" className={s.hint} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            {t('loyalty:discounts.scope.allHint')}
          </motion.p>
        ) : (
          <motion.div key="selected" className={s.reveal}
                      initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.24, ease: [0.2, 0.8, 0.2, 1] }}>
            <ChipGroup
              title={t('loyalty:discounts.scope.services')}
              items={services.map(svc => ({ id: svc.id, label: svc.name, color: svc.color }))}
              selected={draft.service_ids}
              onChange={ids => onChange({ service_ids: ids })}
              empty={t('loyalty:discounts.scope.noServices')}
            />
            <ChipGroup
              title={t('loyalty:discounts.scope.packages')}
              items={packageItems}
              selected={draft.package_ids}
              onChange={ids => onChange({ package_ids: ids })}
              empty={t('loyalty:discounts.scope.noPackages')}
            />
            {attempted && !done && <div className={s.error} role="alert">{t('loyalty:discounts.errors.scope')}</div>}
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
