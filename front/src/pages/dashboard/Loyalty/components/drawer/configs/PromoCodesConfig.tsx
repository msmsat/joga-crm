import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import styles from '../../../Loyalty.module.css';
import { loyaltyApi } from '../../../../../../api/loyalty/loyalty.api';
import { queryKeys } from '../../../../../../api/queryKeys';
import { errorMessage } from '../../../../../../api/errorMessage';
import { useToast } from '../../../../../../components/ui/Toast';
import { useStudioCurrency } from '../../../../../../hooks/useStudioCurrency';
import { getCurrencySymbol } from '../../../../../../components/UI';

const STATUS_COLOR: Record<'active' | 'expired' | 'exhausted' | 'disabled', string> = {
  active: '#5BAB72',
  expired: '#D88C9A',
  exhausted: '#D88C9A',
  disabled: 'var(--text3)',
};

export default function PromoCodesConfig() {
  const { t } = useTranslation('loyalty');
  const toast = useToast();
  const qc = useQueryClient();
  const currency = getCurrencySymbol(useStudioCurrency());

  const { data: codes = [], isError } = useQuery({
    queryKey: queryKeys.loyaltyPromoCodes,
    queryFn: () => loyaltyApi.getPromoCodes(),
  });

  const [code, setCode] = useState('');
  const [discountType, setDiscountType] = useState<'percent' | 'amount'>('percent');
  const [value, setValue] = useState('25');
  const [validUntil, setValidUntil] = useState('');
  const [usageLimit, setUsageLimit] = useState('');

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: queryKeys.loyaltyPromoCodes });
    qc.invalidateQueries({ queryKey: queryKeys.loyaltyStats });
  };

  const createMut = useMutation({
    mutationFn: () => loyaltyApi.createPromoCode({
      code,
      discount_type: discountType,
      value: Number(value),
      valid_until: validUntil || null,
      usage_limit: usageLimit ? Number(usageLimit) : null,
    }),
    onSuccess: () => {
      invalidate();
      toast.success(t('toasts.saved'));
      setCode('');
      setValue('25');
      setValidUntil('');
      setUsageLimit('');
    },
    onError: (err) => toast.error(errorMessage(err, t)),
  });

  const disableMut = useMutation({
    mutationFn: (id: number) => loyaltyApi.disablePromoCode(id),
    onSuccess: invalidate,
    onError: (err) => toast.error(errorMessage(err, t)),
  });

  const statusOf = (c: typeof codes[number]): keyof typeof STATUS_COLOR => {
    if (!c.is_active) return 'disabled';
    if (c.valid_until && c.valid_until < new Date().toISOString().slice(0, 10)) return 'expired';
    if (c.usage_limit !== null && c.used_count >= c.usage_limit) return 'exhausted';
    return 'active';
  };

  const canSubmit = code.trim().length > 0 && Number(value) > 0 && !createMut.isPending;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
      {isError && <div style={{ fontSize: '12px', color: '#D88C9A' }}>{t('toasts.loadFailed')}</div>}

      <div>
        <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '16px' }}>{t('config.promoCreate')}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <input
            type="text"
            value={code}
            onChange={e => setCode(e.target.value)}
            placeholder={t('config.promoCodePlaceholder')}
            style={{ width: '100%', padding: '10px 14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: '14px', fontWeight: 700, textTransform: 'uppercase', boxSizing: 'border-box' }}
          />
          <div style={{ display: 'flex', gap: '8px' }}>
            {(['percent', 'amount'] as const).map(type => (
              <button
                key={type}
                onClick={() => setDiscountType(type)}
                className={styles.btnOption}
                style={{
                  padding: '8px 14px',
                  border: `1px solid ${discountType === type ? 'rgba(91,171,114,0.4)' : 'var(--border)'}`,
                  background: discountType === type ? 'rgba(91,171,114,0.1)' : 'var(--bg)',
                  color: discountType === type ? '#5BAB72' : 'var(--text2)',
                }}
              >
                {t(`config.discountTypes.${type === 'percent' ? 'percentage' : 'fixed'}`, { currency })}
              </button>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div>
              <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text3)', display: 'block', marginBottom: '6px' }}>{t('config.discountSize')}</label>
              <input type="number" min="1" value={value} onChange={e => setValue(e.target.value)} style={{ width: '100%', padding: '10px 14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: '14px', boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text3)', display: 'block', marginBottom: '6px' }}>{t('config.promoValidUntil')}</label>
              <input type="date" value={validUntil} onChange={e => setValidUntil(e.target.value)} style={{ width: '100%', padding: '9px 14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: '13px', boxSizing: 'border-box' }} />
            </div>
          </div>
          <div>
            <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text3)', display: 'block', marginBottom: '6px' }}>{t('config.promoUsageLimit')}</label>
            <input type="number" min="1" value={usageLimit} onChange={e => setUsageLimit(e.target.value)} placeholder={t('config.noLimit')} style={{ width: '100%', padding: '10px 14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: '14px', boxSizing: 'border-box' }} />
          </div>
          <button
            onClick={() => createMut.mutate()}
            disabled={!canSubmit}
            className={styles.configureBtn}
            style={{ background: canSubmit ? '#5BAB72' : 'var(--border)', color: canSubmit ? 'white' : 'var(--text3)', justifyContent: 'center', width: '100%' }}
          >
            {createMut.isPending ? t('drawer.saving') : t('config.promoAdd')}
          </button>
        </div>
      </div>

      <div>
        <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '16px' }}>{t('config.promoList')}</div>
        {codes.length === 0 ? (
          <div style={{ fontSize: '12px', color: 'var(--text3)' }}>{t('config.promoEmpty')}</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {codes.map(c => {
              const status = statusOf(c);
              return (
                <div key={c.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--bg)' }}>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 800, letterSpacing: '0.03em' }}>{c.code}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '2px' }}>
                      {c.discount_type === 'percent' ? `${c.value}%` : `${currency}${c.value}`}
                      {c.usage_limit !== null && ` · ${c.used_count}/${c.usage_limit}`}
                      {c.valid_until && ` · ${t('config.promoUntil')} ${c.valid_until}`}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontSize: '11px', fontWeight: 700, color: STATUS_COLOR[status] }}>{t(`config.promoStatus.${status}`)}</span>
                    {status === 'active' && (
                      <button
                        onClick={() => disableMut.mutate(c.id)}
                        style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--text3)', fontSize: '11px', fontWeight: 600, textDecoration: 'underline' }}
                      >
                        {t('card.disable')}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
