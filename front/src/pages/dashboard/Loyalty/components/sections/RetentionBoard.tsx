import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import styles from '../../Loyalty.module.css';
import { loyaltyApi } from '../../../../../api/loyalty/loyalty.api';
import { queryKeys } from '../../../../../api/queryKeys';

// "2026-07" → "июл" на языке интерфейса.
function monthLabel(key: string, locale: string): string {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(locale, { month: 'short' });
}

export default function RetentionBoard() {
  const { t, i18n } = useTranslation('loyalty');

  const { data, isError } = useQuery({
    queryKey: queryKeys.loyaltyRetention,
    queryFn: () => loyaltyApi.getRetention(),
  });

  const chartData = (data?.months ?? []).map(m => ({
    name: monthLabel(m.month, i18n.language),
    sold: m.sold,
    renewed: m.renewed,
  }));

  return (
    <div style={{ marginBottom: '28px' }}>
      <div style={{ marginBottom: '16px' }}>
        <div style={{ fontSize: '16px', fontWeight: 800 }}>{t('retention.title')}</div>
        <div style={{ fontSize: '12px', color: 'var(--text3)', marginTop: '2px' }}>{t('retention.subtitle')}</div>
      </div>

      {isError && <div style={{ fontSize: '12px', color: '#D88C9A', marginBottom: '12px' }}>{t('toasts.loadFailed')}</div>}

      <div className={styles.statCard} style={{ padding: '22px 24px' }}>
        {!data?.has_data ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '200px', gap: '8px', color: 'var(--text3)' }}>
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.35"><path d="M3 3v18h18" /><path d="m19 9-5 5-4-4-3 3" /></svg>
            <div style={{ fontSize: '13px', fontWeight: 700, opacity: 0.7 }}>{t('retention.empty')}</div>
            <div style={{ fontSize: '11px', opacity: 0.5 }}>{t('retention.emptySub')}</div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: '24px', alignItems: 'center' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' }}>{t('retention.renewalRate')}</div>
                <div style={{ fontSize: '30px', fontWeight: 900, color: '#5BAB72' }}>{data.renewal_rate}%</div>
              </div>
              <div>
                <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' }}>{t('retention.avgPackages')}</div>
                <div style={{ fontSize: '30px', fontWeight: 900, color: '#FCAE91' }}>{data.avg_packages_per_client}</div>
              </div>
            </div>
            <div style={{ height: '200px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--text3)' }} axisLine={false} tickLine={false} />
                  <Tooltip
                    cursor={{ fill: 'rgba(252,174,145,0.08)' }}
                    contentStyle={{ borderRadius: '12px', border: '1px solid var(--border)', fontSize: '12px', background: 'var(--bg-card)' }}
                  />
                  <Legend wrapperStyle={{ fontSize: '11px' }} />
                  <Bar dataKey="sold" name={t('retention.sold')} fill="#FCAE91" radius={[6, 6, 0, 0]} maxBarSize={28} />
                  <Bar dataKey="renewed" name={t('retention.renewed')} fill="#5BAB72" radius={[6, 6, 0, 0]} maxBarSize={28} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
