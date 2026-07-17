import styles from '../../../Loyalty.module.css';
import type { ReferralConfig as ReferralConfigType } from '../../../../../../api/loyalty/loyalty.types';

interface Props {
  value: ReferralConfigType | null;
  onChange: (patch: Partial<ReferralConfigType>) => void;
}

const CONDITIONS = ['После первого визита', 'После первой оплаты', 'Сразу при регистрации'];
const BONUS_TYPES = ['Баллами', 'На депозит', 'Скидкой'];

export default function ReferralConfig({ value, onChange }: Props) {
  const referrerBonus = value?.referrer_bonus ?? 500;
  const newClientDiscount = value?.new_client_discount ?? 15;
  const condition = value?.trigger_condition ?? 'После первого визита';
  const bonusType = value?.bonus_type ?? 'На депозит';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
      <div>
        <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '16px' }}>Бонус за реферала</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div>
            <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text2)', display: 'block', marginBottom: '6px' }}>Бонус рефереру (₽)</label>
            <input type="number" value={referrerBonus} onChange={e => onChange({ referrer_bonus: Number(e.target.value) })} style={{ width: '100%', padding: '10px 14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: '14px', boxSizing: 'border-box' }} />
          </div>
          <div>
            <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text2)', display: 'block', marginBottom: '6px' }}>Скидка новому клиенту (%)</label>
            <input type="number" value={newClientDiscount} onChange={e => onChange({ new_client_discount: Number(e.target.value) })} style={{ width: '100%', padding: '10px 14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: '14px', boxSizing: 'border-box' }} />
          </div>
        </div>
      </div>

      <div>
        <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '16px' }}>Условие начисления</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {CONDITIONS.map((opt) => {
            const isActive = condition === opt;
            return (
              <label
                key={opt}
                onClick={() => onChange({ trigger_condition: opt })}
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
                <span style={{ fontSize: '13px', fontWeight: 500 }}>{opt}</span>
              </label>
            );
          })}
        </div>
      </div>

      <div>
        <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '16px' }}>Начисление бонуса</div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {BONUS_TYPES.map(t => (
            <button
              key={t}
              onClick={() => onChange({ bonus_type: t })}
              className={styles.btnOption}
              style={{
                padding: '8px 14px',
                border: `1px solid ${bonusType === t ? 'rgba(252,174,145,0.4)' : 'var(--border)'}`,
                background: bonusType === t ? 'rgba(252,174,145,0.12)' : 'var(--bg)',
                color: bonusType === t ? '#FCAE91' : 'var(--text2)',
              }}
            >
              {t}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
