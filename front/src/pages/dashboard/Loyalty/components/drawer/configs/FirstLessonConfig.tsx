import { useTranslation } from 'react-i18next';
import styles from '../../../Loyalty.module.css';
import type {
  FirstLessonConfig as FirstLessonConfigType,
  FirstLessonDiscountType,
} from '../../../../../../api/loyalty/loyalty.types';
import type { ConfigErrors } from '../../../hooks/validateConfig';
import { Segmented } from '../../../../../../components/ui/modal';
import { useStudioCurrency } from '../../../../../../hooks/useStudioCurrency';
import { getCurrencySymbol } from '../../../../../../components/UI';
import { formatMoney } from '../../../../../../lib/money';

interface Props {
  value: FirstLessonConfigType | null;
  onChange: (patch: Partial<FirstLessonConfigType>) => void;
  errors?: ConfigErrors;
}

// Быстрые варианты: подарок целиком и три ходовые скидки. Любой другой процент
// набирается в поле под ними.
const PRESETS = [100, 50, 30, 20] as const;

const sectionTitle: React.CSSProperties = {
  fontSize: '11px', fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase',
  letterSpacing: '0.06em', marginBottom: '16px',
};

const fieldLabel: React.CSSProperties = {
  fontSize: '12px', fontWeight: 600, color: 'var(--text2)', display: 'block', marginBottom: '6px',
};

const fieldSuffix: React.CSSProperties = {
  position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)',
  fontSize: '13px', fontWeight: 600, color: 'var(--text3)', pointerEvents: 'none',
};

const fieldInput = (invalid: boolean): React.CSSProperties => ({
  width: '100%', padding: '10px 36px 10px 14px', borderRadius: 'var(--radius-sm)',
  border: `1px solid ${invalid ? '#D88C9A' : 'var(--border)'}`,
  background: 'var(--bg)', color: 'var(--text)', fontSize: '14px', boxSizing: 'border-box',
});

/**
 * Скидка на первое занятие — процентом или суммой в валюте студии. Своей
 * таблицы у программы нет: это правило записи (вид, процент, сумма и тумблер
 * хранятся в настройках Онлайн-записи), поэтому она действует везде, где
 * клиент записывается, — в Журнале, мини-приложении и виджете. Сохранение —
 * общей кнопкой дровера «Сохранить и включить».
 */
export default function FirstLessonConfig({ value, onChange, errors = {} }: Props) {
  const { t } = useTranslation('loyalty');
  const currencyCode = useStudioCurrency();
  const currency = getCurrencySymbol(currencyCode);
  const type = value?.discount_type ?? 'percent';
  const percent = value?.discount_percent ?? 100;
  const amount = value?.discount_amount ?? null;
  const error = type === 'amount' ? errors.discount_amount : errors.discount_percent;

  const types: { value: FirstLessonDiscountType; label: string }[] = [
    { value: 'percent', label: t('config.discountTypes.percentage') },
    { value: 'amount', label: t('config.discountTypes.fixed', { currency }) },
  ];

  // Что увидит клиент — словами, а не числом: «бесплатно» и «платит 70 %
  // цены» читаются быстрее, чем «скидка 30 %» от незнакомой цены.
  const hint = type === 'amount'
    ? amount ? t('config.firstLesson.amountHint', { amount: formatMoney(amount, currencyCode) }) : null
    : percent >= 100 ? t('config.firstLesson.freeHint') : t('config.firstLesson.payHint', { rest: 100 - percent });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
      <div>
        <div style={sectionTitle}>{t('config.firstLesson.sizeTitle')}</div>
        <div style={{ marginBottom: '16px' }}>
          <Segmented value={type} options={types} onChange={next => onChange({ discount_type: next })} />
        </div>

        {type === 'percent' ? (
          <>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '16px' }}>
              {PRESETS.map(preset => {
                const active = percent === preset;
                return (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => onChange({ discount_percent: preset })}
                    className={styles.btnOption}
                    style={{
                      padding: '8px 14px',
                      border: `1px solid ${active ? 'rgba(252,174,145,0.4)' : 'var(--border)'}`,
                      background: active ? 'rgba(252,174,145,0.12)' : 'var(--bg)',
                      color: active ? '#F9A08B' : 'var(--text2)',
                    }}
                  >
                    {preset === 100 ? t('config.firstLesson.free') : `−${preset}%`}
                  </button>
                );
              })}
            </div>

            <label style={fieldLabel}>{t('config.firstLesson.percent')}</label>
            <div style={{ position: 'relative' }}>
              <input
                type="number"
                min={1}
                max={100}
                value={percent}
                onChange={e => onChange({ discount_percent: e.target.value === '' ? 0 : Number(e.target.value) })}
                style={fieldInput(!!errors.discount_percent)}
              />
              <span style={fieldSuffix}>%</span>
            </div>
          </>
        ) : (
          <>
            <label style={fieldLabel}>{t('config.firstLesson.amount', { currency })}</label>
            <div style={{ position: 'relative' }}>
              <input
                type="number"
                min={1}
                step={1}
                value={amount ?? ''}
                onChange={e => onChange({ discount_amount: e.target.value === '' ? null : Number(e.target.value) })}
                style={fieldInput(!!errors.discount_amount)}
              />
              <span style={fieldSuffix}>{currency}</span>
            </div>
          </>
        )}

        {error ? (
          <div style={{ fontSize: '11.5px', color: '#D88C9A', fontWeight: 600, marginTop: '6px' }}>{error}</div>
        ) : hint && (
          <div style={{ fontSize: '12px', color: 'var(--text3)', marginTop: '8px', lineHeight: 1.5 }}>{hint}</div>
        )}
      </div>

      <div>
        <div style={sectionTitle}>{t('config.firstLesson.howTitle')}</div>
        <ul style={{ margin: 0, paddingLeft: '18px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {(['who', 'stacking', 'journal', 'booking'] as const).map(key => (
            <li key={key} style={{ fontSize: '12.5px', color: 'var(--text2)', lineHeight: 1.5 }}>
              {t(`config.firstLesson.how.${key}`)}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
