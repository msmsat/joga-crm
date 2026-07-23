import { useTranslation } from 'react-i18next';
import styles from '../../../Loyalty.module.css';
import type { ReferralConfig as ReferralConfigType } from '../../../../../../api/loyalty/loyalty.types';
import { useStudioCurrency } from '../../../../../../hooks/useStudioCurrency';
import { getCurrencySymbol } from '../../../../../../components/UI';
import type { ConfigErrors } from '../../../hooks/validateConfig';

interface Props {
  value: ReferralConfigType | null;
  onChange: (patch: Partial<ReferralConfigType>) => void;
  errors?: ConfigErrors;
}

const CONDITION_KEYS = ['first_visit', 'first_payment', 'registration'] as const;
const BONUS_TYPE_KEYS = ['points', 'deposit', 'discount'] as const;

export default function ReferralConfig({ value, onChange, errors = {} }: Props) {
  const { t } = useTranslation('loyalty');
  const currency = getCurrencySymbol(useStudioCurrency());
  const referrerBonus = value?.referrer_bonus ?? 500;
  const newClientDiscount = value?.new_client_discount ?? 15;
  const condition = value?.trigger_condition ?? 'first_visit';
  const bonusType = value?.bonus_type ?? 'deposit';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
      <div>
        <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '16px' }}>{t('config.referrerBonusTitle')}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div>
            <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text2)', display: 'block', marginBottom: '6px' }}>{t('config.referrerBonus', { currency })}</label>
            <input type="number" value={referrerBonus} onChange={e => onChange({ referrer_bonus: Number(e.target.value) })} style={{ width: '100%', padding: '10px 14px', borderRadius: 'var(--radius-sm)', border: `1px solid ${errors.referrer_bonus ? '#D88C9A' : 'var(--border)'}`, background: 'var(--bg)', color: 'var(--text)', fontSize: '14px', boxSizing: 'border-box' }} />
            {errors.referrer_bonus && <div style={{ fontSize: '11.5px', color: '#D88C9A', fontWeight: 600, marginTop: '6px' }}>{errors.referrer_bonus}</div>}
          </div>
          <div>
            <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text2)', display: 'block', marginBottom: '6px' }}>{t('config.newClientDiscount')}</label>
            <input type="number" value={newClientDiscount} onChange={e => onChange({ new_client_discount: Number(e.target.value) })} style={{ width: '100%', padding: '10px 14px', borderRadius: 'var(--radius-sm)', border: `1px solid ${errors.new_client_discount ? '#D88C9A' : 'var(--border)'}`, background: 'var(--bg)', color: 'var(--text)', fontSize: '14px', boxSizing: 'border-box' }} />
            {errors.new_client_discount && <div style={{ fontSize: '11.5px', color: '#D88C9A', fontWeight: 600, marginTop: '6px' }}>{errors.new_client_discount}</div>}
          </div>
        </div>
      </div>

      <div>
        <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '16px' }}>{t('config.triggerCondition')}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {CONDITION_KEYS.map((key) => {
            const isActive = condition === key;
            return (
              <label
                key={key}
                onClick={() => onChange({ trigger_condition: key })}
                style={{
                  display: 'flex', alignItems: 'center', gap: '10px',
                  padding: '10px 12px', borderRadius: 'var(--radius-sm)',
                  border: `1px solid ${isActive ? 'rgba(252,174,145,0.4)' : 'var(--border)'}`,
                  background: isActive ? 'rgba(252,174,145,0.06)' : 'var(--bg)',
                  cursor: 'pointer', userSelect: 'none',
                  transition: 'border-color 0.15s, background 0.15s',
                }}
              >
                <div style={{
                  width: '16px', height: '16px', borderRadius: '50%',
                  border: `2px solid ${isActive ? '#FCAE91' : 'var(--border)'}`,
                  background: isActive ? '#FCAE91' : 'transparent',
                  flexShrink: 0,
                  transition: 'background 0.15s, border-color 0.15s',
                }} />
                <span style={{ fontSize: '13px', fontWeight: 500 }}>{t(`config.triggerConditions.${key}`)}</span>
              </label>
            );
          })}
        </div>
      </div>

      <div>
        <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '16px' }}>{t('config.bonusAccrual')}</div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {BONUS_TYPE_KEYS.map(key => (
            <button
              key={key}
              onClick={() => onChange({ bonus_type: key })}
              className={styles.btnOption}
              style={{
                padding: '8px 14px',
                border: `1px solid ${bonusType === key ? 'rgba(252,174,145,0.4)' : 'var(--border)'}`,
                background: bonusType === key ? 'rgba(252,174,145,0.12)' : 'var(--bg)',
                color: bonusType === key ? '#FCAE91' : 'var(--text2)',
              }}
            >
              {t(`config.bonusTypes.${key}`)}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
