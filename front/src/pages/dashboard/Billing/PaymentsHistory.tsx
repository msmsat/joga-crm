import { useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { billingApi } from '../../../api/billing/billing.api';
import { queryKeys } from '../../../api/queryKeys';
import { useStudioCurrency } from '../../../hooks/useStudioCurrency';
import { formatMoney } from '../../../lib/money';
import { Button, useToast } from '../../../components/ui/index';
import { HistoryIcon, DownloadIcon } from './components/ui/BillingIcons';

const PAGE_SIZE = 12;

const STATUS_META: Record<string, { key: string; color: string; bg: string }> = {
  paid:     { key: 'status.paid',     color: '#2A6B35', bg: 'rgba(163,201,168,0.18)' },
  pending:  { key: 'status.pending',  color: '#8A6D1A', bg: 'rgba(252,174,145,0.16)' },
  failed:   { key: 'status.failed',   color: '#B4535F', bg: 'rgba(216,140,154,0.16)' },
  refunded: { key: 'status.refunded', color: '#666666', bg: 'rgba(102,102,102,0.10)' },
};

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
}

const dateInputStyle: React.CSSProperties = {
  padding: '7px 10px', borderRadius: '8px', border: '1px solid var(--border)',
  fontSize: '12.5px', fontFamily: 'inherit', color: 'var(--onyx)', background: 'var(--bg-card)',
};

export default function PaymentsHistory() {
  const { t } = useTranslation('billing');
  const navigate = useNavigate();
  const toast = useToast();
  const currency = useStudioCurrency();
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [isExporting, setIsExporting] = useState(false);

  const { data, isLoading, isFetchingNextPage, hasNextPage, fetchNextPage } = useInfiniteQuery({
    queryKey: queryKeys.billingInvoicesHistory(dateFrom, dateTo),
    queryFn: ({ pageParam }) => billingApi.getInvoices({
      offset: pageParam, limit: PAGE_SIZE,
      date_from: dateFrom || undefined, date_to: dateTo || undefined,
    }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, pages) => {
      const loaded = pages.reduce((sum, p) => sum + p.items.length, 0);
      return loaded < lastPage.total ? loaded : undefined;
    },
  });

  const items = (data?.pages ?? []).flatMap(p => p.items);

  const onExport = async () => {
    setIsExporting(true);
    try {
      await billingApi.exportInvoicesCsv({ date_from: dateFrom || undefined, date_to: dateTo || undefined });
    } catch {
      toast.error(t('invoices.exportError'));
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div style={{ padding: '0 32px 60px', maxWidth: '960px', margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '28px 0 20px' }}>
        <button
          onClick={() => navigate('/dashboard/billing')}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '32px', height: '32px', borderRadius: '50%', background: 'var(--bg-card)', border: '1px solid var(--border)', cursor: 'pointer', color: 'var(--onyx)', flexShrink: 0 }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></svg>
        </button>
        <div>
          <div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--onyx)', letterSpacing: '-0.3px' }}>{t('paymentsHistory.title')}</div>
          <div style={{ fontSize: '12.5px', color: 'var(--muted)', marginTop: '2px' }}>{t('paymentsHistory.subtitle')}</div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={dateInputStyle} />
          <span style={{ color: 'var(--muted)', fontSize: '12px' }}>—</span>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={dateInputStyle} />
          {(dateFrom || dateTo) && (
            <button
              onClick={() => { setDateFrom(''); setDateTo(''); }}
              style={{ padding: '7px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--muted)', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
            >
              {t('paymentsHistory.clearFilter')}
            </button>
          )}
        </div>
        <Button size="sm" loading={isExporting} disabled={items.length === 0} onClick={onExport} icon={<DownloadIcon />}>
          {t('invoices.exportCsv')}
        </Button>
      </div>

      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '20px', boxShadow: 'var(--shadow)', overflow: 'hidden' }}>
        <div style={{ padding: '18px 28px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <HistoryIcon />
          <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--onyx)' }}>{t('invoices.title')}</span>
        </div>

        {isLoading ? (
          <div style={{ padding: '56px 28px', textAlign: 'center', fontSize: '13px', color: 'var(--muted)' }}>{t('common:loading')}</div>
        ) : items.length === 0 ? (
          <div style={{ padding: '56px 28px', textAlign: 'center', fontSize: '13px', color: 'var(--muted)' }}>{t('empty.noInvoices')}</div>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 1fr 1fr', padding: '12px 28px', borderBottom: '1px solid var(--border)', background: 'rgba(102,102,102,0.03)' }}>
              {[t('table.date'), t('table.description'), t('table.amount'), t('table.status')].map(h => (
                <div key={h} style={{ fontSize: '11px', fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.5px', textTransform: 'uppercase' }}>{h}</div>
              ))}
            </div>
            {items.map((inv, i) => {
              const meta = STATUS_META[inv.status] ?? STATUS_META.pending;
              return (
                <div
                  key={inv.id}
                  style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 1fr 1fr', padding: '16px 28px', borderBottom: i < items.length - 1 ? '1px solid var(--border)' : 'none', alignItems: 'center' }}
                >
                  <div style={{ fontSize: '13px', color: 'var(--muted)' }}>{fmtDate(inv.paid_at)}</div>
                  <div style={{ fontSize: '13px', color: 'var(--onyx)', fontWeight: 500 }}>
                    {t(`planNames.${inv.plan_name}`)}
                    <span style={{ color: 'var(--muted)', fontWeight: 400 }}> · {t('upgrade.periodValue', { count: inv.period_months })}</span>
                  </div>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--onyx)' }}>{formatMoney(inv.amount / 100, currency)}</div>
                  <div>
                    <span style={{ display: 'inline-flex', alignItems: 'center', padding: '3px 10px', borderRadius: '20px', background: meta.bg, color: meta.color, fontSize: '11px', fontWeight: 700 }}>
                      {t(meta.key)}
                    </span>
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>

      {hasNextPage && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '20px 0' }}>
          <button
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
            style={{
              padding: '10px 24px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '10px',
              fontSize: '13px', fontWeight: 600, color: 'var(--onyx)', fontFamily: 'inherit',
              cursor: isFetchingNextPage ? 'default' : 'pointer', opacity: isFetchingNextPage ? 0.6 : 1,
            }}
          >
            {isFetchingNextPage ? t('common:loading') : t('paymentsHistory.loadMore')}
          </button>
        </div>
      )}
    </div>
  );
}
