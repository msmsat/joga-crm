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
import { submitOnEnter } from '../../../../../../lib/submitOnEnter';
import { ResourceClientPicker } from '../../../../Journal/components/modals/ResourceClientPicker';

const STATUS_COLOR: Record<'active' | 'scheduled' | 'expired' | 'exhausted' | 'disabled', string> = {
  active: '#5BAB72',
  scheduled: 'var(--text2)',
  expired: '#D88C9A',
  exhausted: '#D88C9A',
  disabled: 'var(--text3)',
};

const labelStyle: React.CSSProperties = { fontSize: '11px', fontWeight: 600, color: 'var(--text3)', display: 'block', marginBottom: '6px' };
const fieldStyle: React.CSSProperties = { width: '100%', padding: '10px 14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: '14px', boxSizing: 'border-box' };
const dateStyle: React.CSSProperties = { ...fieldStyle, padding: '9px 14px', fontSize: '13px' };

export default function PromoCodesConfig() {
  const { t, i18n } = useTranslation('loyalty');
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
  // Промокод лично для одного клиента; null — для всех.
  const [clientId, setClientId] = useState<number | null>(null);
  // Период «с … по …»: обе даты включительно, любую можно не задавать.
  const [validFrom, setValidFrom] = useState('');
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
      client_id: clientId,
      valid_from: validFrom || null,
      valid_until: validUntil || null,
      usage_limit: usageLimit ? Number(usageLimit) : null,
    }),
    onSuccess: () => {
      invalidate();
      toast.success(t('toasts.saved'));
      setCode('');
      setValue('25');
      setClientId(null);
      setValidFrom('');
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

  const today = new Date().toISOString().slice(0, 10);
  const statusOf = (c: typeof codes[number]): keyof typeof STATUS_COLOR => {
    if (!c.is_active) return 'disabled';
    if (c.valid_until && c.valid_until < today) return 'expired';
    if (c.usage_limit !== null && c.used_count >= c.usage_limit) return 'exhausted';
    if (c.valid_from && c.valid_from > today) return 'scheduled';
    return 'active';
  };
  // Год — только у дат не этого года: «с 24 сент. · до 24 окт.» помещается в
  // строку узкой панели, а с годами строка кода разъезжалась на три этажа.
  const thisYear = new Date().getFullYear();
  const day = (iso: string) => {
    const date = new Date(`${iso}T12:00:00`);
    return date.toLocaleDateString(i18n.language, {
      day: 'numeric', month: 'short', ...(date.getFullYear() !== thisYear ? { year: 'numeric' as const } : {}),
    });
  };

  // «С 10-го по 5-е» — код, который не действует ни дня: сервер такой отклонит.
  const periodInvalid = !!validFrom && !!validUntil && validFrom > validUntil;
  const canSubmit = code.trim().length > 0 && Number(value) > 0 && !periodInvalid && !createMut.isPending;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
      {isError && <div style={{ fontSize: '12px', color: '#D88C9A' }}>{t('toasts.loadFailed')}</div>}

      <div>
        <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '16px' }}>{t('config.promoCreate')}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }} onKeyDown={submitOnEnter(canSubmit ? () => createMut.mutate() : null)}>
          <input
            type="text"
            value={code}
            onChange={e => setCode(e.target.value)}
            placeholder={t('config.promoCodePlaceholder')}
            style={{ ...fieldStyle, fontWeight: 700, textTransform: 'uppercase' }}
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
          {/* Клиент — из списка с поиском; нет в базе — «+ Новый клиент», и
              заведённый сразу выбран. Пусто — промокод для всех. */}
          <ResourceClientPicker
            value={clientId}
            onChange={setClientId}
            onClear={() => setClientId(null)}
            label={t('config.promoClient')}
            placeholder={t('config.promoAllClients')}
            clearLabel={t('config.promoAllClients')}
            labelClass={styles.fieldLabel}
            disabled={createMut.isPending}
          />
          <div>
            <label style={labelStyle}>{t('config.discountSize')}</label>
            <input type="number" min="1" value={value} onChange={e => setValue(e.target.value)} style={fieldStyle} />
          </div>
          <div>
            {/* minmax(0, 1fr): у поля даты широкая собственная ширина, и в
                узкой панели вторая колонка иначе вылезала за её край. */}
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '10px' }}>
              <div>
                <label style={labelStyle}>{t('config.promoValidFrom')}</label>
                <input type="date" value={validFrom} max={validUntil || undefined} onChange={e => setValidFrom(e.target.value)}
                       style={{ ...dateStyle, borderColor: periodInvalid ? '#D88C9A' : 'var(--border)' }} />
              </div>
              <div>
                <label style={labelStyle}>{t('config.promoValidUntil')}</label>
                <input type="date" value={validUntil} min={validFrom || undefined} onChange={e => setValidUntil(e.target.value)}
                       style={{ ...dateStyle, borderColor: periodInvalid ? '#D88C9A' : 'var(--border)' }} />
              </div>
            </div>
            {periodInvalid && (
              <div role="alert" style={{ fontSize: '11.5px', fontWeight: 600, color: '#D88C9A', marginTop: '6px' }}>{t('config.promoPeriodInvalid')}</div>
            )}
          </div>
          {/* Во всю ширину: в полколонки узкой панели «Без ограничений» не помещалось. */}
          <div>
            <label style={labelStyle}>{t('config.promoUsageLimit')}</label>
            <input type="number" min="1" value={usageLimit} onChange={e => setUsageLimit(e.target.value)} placeholder={t('config.noLimit')} style={fieldStyle} />
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
                // Два этажа: код, клиент и статус — сверху, условия и «Выключить» —
                // снизу. В одну строку в узкой панели имя клиента сжималось до
                // одной буквы, а условия разъезжались на три строки.
                <div key={c.id} style={{ display: 'flex', flexDirection: 'column', gap: '4px', padding: '12px 14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--bg)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                      <span style={{ fontSize: '13px', fontWeight: 800, letterSpacing: '0.03em', flexShrink: 0 }}>{c.code}</span>
                      {c.client_name && <span className={styles.promoClient} title={c.client_name}>{c.client_name}</span>}
                    </div>
                    <span style={{ fontSize: '11px', fontWeight: 700, color: STATUS_COLOR[status], flexShrink: 0 }}>{t(`config.promoStatus.${status}`)}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '10px' }}>
                    <span style={{ fontSize: '11px', color: 'var(--text3)', minWidth: 0 }}>
                      {c.discount_type === 'percent' ? `${c.value}%` : `${currency}${c.value}`}
                      {c.usage_limit !== null && ` · ${c.used_count}/${c.usage_limit}`}
                      {c.valid_from && ` · ${t('config.promoFrom')} ${day(c.valid_from)}`}
                      {c.valid_until && ` · ${t('config.promoUntil')} ${day(c.valid_until)}`}
                    </span>
                    {(status === 'active' || status === 'scheduled') && (
                      <button
                        onClick={() => disableMut.mutate(c.id)}
                        style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--text3)', fontSize: '11px', fontWeight: 600, textDecoration: 'underline', flexShrink: 0 }}
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
