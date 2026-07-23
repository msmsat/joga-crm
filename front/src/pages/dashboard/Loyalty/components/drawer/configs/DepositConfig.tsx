import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { loyaltyApi } from '../../../../../../api/loyalty/loyalty.api';
import { queryKeys } from '../../../../../../api/queryKeys';
import { useStudioCurrency } from '../../../../../../hooks/useStudioCurrency';
import { getCurrencySymbol } from '../../../../../../components/UI';

export default function DepositConfig() {
  const { t } = useTranslation('loyalty');
  const currency = getCurrencySymbol(useStudioCurrency());
  const fmt = (n: number) => `${currency}${n.toLocaleString('ru-RU')}`;

  const { data: stats, isError } = useQuery({
    queryKey: queryKeys.loyaltyDepositStats,
    queryFn: () => loyaltyApi.getDepositStats(),
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
      {isError && <div style={{ fontSize: '12px', color: '#D88C9A' }}>{t('toasts.loadFailed')}</div>}

      <div>
        <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '16px' }}>{t('config.depositTotal')}</div>
        <div style={{ padding: '16px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--bg)' }}>
          <div style={{ fontSize: '26px', fontWeight: 800, color: '#FCAE91' }}>{fmt(stats?.total_balance ?? 0)}</div>
          <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '2px' }}>{t('config.depositTotalSub')}</div>
        </div>
      </div>

      <div>
        <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '16px' }}>{t('config.depositTopClients')}</div>
        {!stats?.top_clients.length ? (
          <div style={{ fontSize: '12px', color: 'var(--text3)' }}>{t('config.depositEmpty')}</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {stats.top_clients.map(c => (
              <div key={c.client_id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--bg)' }}>
                <span style={{ fontSize: '13px', fontWeight: 600 }}>{c.client_name}</span>
                <span style={{ fontSize: '13px', fontWeight: 800, color: '#FCAE91' }}>{fmt(c.deposit_balance)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ fontSize: '11.5px', color: 'var(--text3)', lineHeight: 1.5 }}>
        {t('config.depositHint')}
      </div>
    </div>
  );
}
