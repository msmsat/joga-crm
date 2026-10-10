import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FieldLabel, Input, Switch, cascade } from '../../../../../../components/ui/index';
import { Segmented } from '../../../../../../components/ui/modal';
import s from './Discounts.module.css';
import CouponPreview from './CouponPreview';
import RangeCalendar from './RangeCalendar';
import ScopePicker from './ScopePicker';
import AudiencePicker from './AudiencePicker';
import { useDiscountFormat } from './useDiscountFormat';
import { useDiscountCatalog } from './useDiscountCatalog';
import {
  TEMPLATES, daysBetween, fromTemplate, presetOf, presetRange,
  type DiscountDraft, type DraftChecks, type PeriodPreset,
} from './discountModel';
import { IconCalendar, TemplateIcon } from './DiscountIcons';

interface Props {
  draft: DiscountDraft;
  onChange: (patch: Partial<DiscountDraft>) => void;
  checks: DraftChecks;
  attempted: boolean;
  /** Новая и ещё нетронутая — показываем шаблоны. */
  pristine: boolean;
  onTemplate: (draft: DiscountDraft) => void;
}

const QUICK_PERCENT = [5, 10, 15, 20, 30, 50];
const PRESETS: PeriodPreset[] = ['none', 'week', 'month', 'days30', 'custom'];

/** Редактор скидки. Сверху — купон, каким его увидят; дальше вопросы по
 *  порядку, в каком их задаёт себе владелец: как назвать, сколько, когда, на
 *  что, кому. У каждого — пометка «Обязательно» или «Необязательно». */
export default function DiscountEditor({ draft, onChange, checks, attempted, pristine, onTemplate }: Props) {
  const { t } = useTranslation(['loyalty', 'common']);
  const f = useDiscountFormat();
  const { packages } = useDiscountCatalog();
  const required = t('common:fields.required');
  const optional = t('common:fields.optional');
  // «Свой период» выбран, а дат ещё нет — подсветка остаётся на нём, пока
  // человек тыкает в календарь.
  const [custom, setCustom] = useState(false);
  const preset = custom ? 'custom' : presetOf(draft);
  const length = draft.valid_from && draft.valid_until ? daysBetween(draft.valid_from, draft.valid_until) + 1 : null;
  const valueTyped = draft.value.trim() !== '';

  const choosePreset = (next: PeriodPreset) => {
    if (next === 'custom') { setCustom(true); return; }
    setCustom(false);
    const [from, until] = presetRange(next);
    onChange({ valid_from: from, valid_until: until });
  };

  return (
    <div className={s.editor}>
      <div className="spanel-cascade" style={cascade(1)}>
        <CouponPreview draft={draft} />
      </div>

      {pristine && (
        <div className={s.templates}>
          <div className={s.templatesTitle}>{t('loyalty:discounts.templates.title')}</div>
          <div className={s.templateRow}>
            {TEMPLATES.map(key => (
              <button key={key} type="button" className={s.template}
                      onClick={() => onTemplate(fromTemplate(key, t(`loyalty:discounts.templates.${key}.name`), packages))}>
                <span className={s.templateIcon}><TemplateIcon name={key} size={17} /></span>
                <span className={s.templateName}>{t(`loyalty:discounts.templates.${key}.name`)}</span>
                <span className={s.templateSub}>{t(`loyalty:discounts.templates.${key}.hint`)}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <section className={s.section}>
        <Input
          label={t('loyalty:discounts.editor.name')}
          required={required}
          done={checks.name}
          value={draft.name}
          placeholder={t('loyalty:discounts.editor.namePlaceholder')}
          onChange={name => onChange({ name: name.slice(0, 80) })}
          error={attempted && !checks.name ? t('loyalty:discounts.errors.name') : undefined}
        />
      </section>

      <section className={s.section}>
        <FieldLabel id="discount-value" label={t('loyalty:discounts.editor.value')} required={required} done={checks.value} />
        <div className={s.valueRow}>
          <Segmented
            ariaLabel={t('loyalty:discounts.editor.value')}
            value={draft.discount_type}
            onChange={type => onChange({ discount_type: type })}
            options={[
              { value: 'percent', label: t('loyalty:discounts.editor.percent') },
              { value: 'amount', label: t('loyalty:discounts.editor.amount', { currency: f.symbol }) },
            ]}
          />
          <Input
            value={draft.value}
            inputMode="numeric"
            placeholder={draft.discount_type === 'percent' ? '15' : '300'}
            suffix={draft.discount_type === 'percent' ? '%' : f.symbol}
            onChange={value => onChange({ value: value.replace(/\D/g, '').slice(0, 7) })}
          />
        </div>
        {draft.discount_type === 'percent' && (
          <div className={s.quick}>
            {QUICK_PERCENT.map(v => (
              <button key={v} type="button" aria-pressed={draft.value === String(v)}
                      className={`${s.quickChip}${draft.value === String(v) ? ` ${s.quickOn}` : ''}`}
                      onClick={() => onChange({ value: String(v) })}>
                {f.value('percent', v)}
              </button>
            ))}
          </div>
        )}
        {((valueTyped && !checks.value) || (attempted && !checks.value)) && (
          <div className={s.error} role="alert">
            {draft.discount_type === 'percent' ? t('loyalty:validation.range1to100') : t('loyalty:validation.minOne')}
          </div>
        )}
      </section>

      <section className={s.section}>
        <FieldLabel id="discount-period" label={t('loyalty:discounts.editor.period')} optional={optional} />
        <div className={s.periodGrid}>
          <div className={s.presets} role="radiogroup" aria-labelledby="discount-period">
            {PRESETS.map(p => {
              const [from, until] = p === 'custom' ? [draft.valid_from, draft.valid_until] : presetRange(p);
              return (
                <button key={p} type="button" role="radio" aria-checked={preset === p}
                        className={`${s.preset}${preset === p ? ` ${s.presetOn}` : ''}`}
                        onClick={() => choosePreset(p)}>
                  <span className={s.presetName}>{t(`loyalty:discounts.presets.${p}`)}</span>
                  <span className={s.presetSub}>
                    {p === 'none' ? t('loyalty:discounts.presets.noneHint')
                      : p === 'custom' ? t('loyalty:discounts.presets.customHint')
                      : f.period(from, until)}
                  </span>
                </button>
              );
            })}
          </div>
          <RangeCalendar
            labelledBy="discount-period"
            from={draft.valid_from}
            until={draft.valid_until}
            onChange={(from, until) => { setCustom(true); onChange({ valid_from: from, valid_until: until }); }}
          />
        </div>
        <div className={s.periodSummary}>
          <IconCalendar size={14} />
          <span>{f.period(draft.valid_from, draft.valid_until)}</span>
          {length && <span className={s.periodDays}>{t('loyalty:discounts.preview.days', { count: length })}</span>}
          {draft.valid_from && (
            <button type="button" className={s.textBtn} onClick={() => choosePreset('none')}>
              {t('loyalty:discounts.presets.clear')}
            </button>
          )}
        </div>
      </section>

      <ScopePicker draft={draft} onChange={onChange} done={checks.scope} attempted={attempted} />
      <AudiencePicker draft={draft} onChange={onChange} done={checks.audience} attempted={attempted} />

      <section className={s.section}>
        <div className={s.extraGrid}>
          <Input
            label={t('loyalty:discounts.editor.minimum')}
            optional={optional}
            value={draft.min_purchase_amount}
            inputMode="numeric"
            suffix={f.symbol}
            placeholder={t('loyalty:discounts.editor.minimumPlaceholder')}
            onChange={value => onChange({ min_purchase_amount: value.replace(/\D/g, '').slice(0, 8) })}
          />
          <div>
            <FieldLabel id="discount-active" label={t('loyalty:discounts.editor.active')} optional={optional} />
            <div className={s.activeRow}>
              <span className={s.activeText}>
                {draft.is_active ? t('loyalty:discounts.editor.activeOn') : t('loyalty:discounts.editor.activeOff')}
              </span>
              <Switch checked={draft.is_active} onChange={is_active => onChange({ is_active })} />
            </div>
          </div>
        </div>
        <p className={s.hint}>{t('loyalty:discounts.editor.minimumHint')}</p>
      </section>
    </div>
  );
}
