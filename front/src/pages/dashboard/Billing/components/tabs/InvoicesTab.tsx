import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HistoryIcon, DownloadIcon } from '../ui/BillingIcons';

import { billingApi } from '../../../../../api/billing/billing.api';
import { formatMoney } from '../../../../../lib/money';
import type { Invoice } from '../../types';

function fmtDate(iso: string | null, noData: string): string {
  if (!iso) return noData;
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
}

// Четыре статуса счёта из БД (schemas/settings/billing.py) — цвета из палитры CLAUDE.md §6.
const STATUS_META: Record<string, { key: string; color: string; bg: string }> = {
  paid:     { key: 'status.paid',     color: '#2A6B35', bg: 'rgba(163,201,168,0.18)' },
  pending:  { key: 'status.pending',  color: '#8A6D1A', bg: 'rgba(252,174,145,0.16)' },
  failed:   { key: 'status.failed',   color: '#B4535F', bg: 'rgba(216,140,154,0.16)' },
  refunded: { key: 'status.refunded', color: '#666666', bg: 'rgba(102,102,102,0.10)' },
};

function StatusBadge({ status }: { status: string }) {
  const { t } = useTranslation('billing');
  const m = STATUS_META[status] ?? STATUS_META.pending;
  return (
    <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: '20px', background: m.bg, color: m.color, fontSize: '11px', fontWeight: 700 }}>
      {t(m.key)}
    </span>
  );
}

interface Props {
  currency?: string;
}

export default function InvoicesTab({ currency }: Props) {
  const { t } = useTranslation('billing');
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    billingApi.getInvoices()
      .then(setInvoices)
      .catch(() => { /* пустой список остаётся — не роняем страницу */ })
      .finally(() => setLoaded(true));
  }, []);

  const total = invoices.filter(i => i.status === 'paid').reduce((s, i) => s + i.amount, 0);
  const statusLabel = (status: string) => t(STATUS_META[status]?.key ?? status);

  return (
    <div style={{ padding: '0 32px' }}>
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '20px', boxShadow: 'var(--shadow)', overflow: 'hidden' }}>
        <div style={{ padding: '20px 28px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <HistoryIcon />
            <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--onyx)' }}>{t('invoices.title')}</span>
            {total > 0 && (
              <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--muted)', marginLeft: '4px' }}>
                · {t('invoices.totalPaid', { amount: formatMoney(total, currency) })}
              </span>
            )}
          </div>
          {invoices.length > 0 && (
            <button
              onClick={() => {
                const headers = [t('table.date'), t('table.description'), t('table.amount'), t('table.status')];
                const rows = invoices.map(inv => [fmtDate(inv.paid_at, t('empty.noData')), inv.plan_name, formatMoney(inv.amount, currency), statusLabel(inv.status)]);
                const csv = '﻿' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
                const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url; a.download = 'velora_invoices.csv';
                document.body.appendChild(a); a.click(); document.body.removeChild(a);
                URL.revokeObjectURL(url);
              }}
              style={{ padding: '8px 16px', borderRadius: '10px', border: '1.5px solid var(--border)', background: 'transparent', color: 'var(--muted)', fontSize: '12px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '6px', transition: 'all 0.2s ease' }}>
              <DownloadIcon />{t('invoices.exportCsv')}
            </button>
          )}
        </div>

        {invoices.length === 0 ? (
          <div style={{ padding: '56px 28px', textAlign: 'center', fontSize: '13px', color: 'var(--muted)' }}>
            {loaded ? t('empty.noInvoices') : t('common:loading')}
          </div>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 1fr 1fr 1fr', padding: '12px 28px', borderBottom: '1px solid var(--border)', background: 'rgba(102,102,102,0.03)' }}>
              {[t('table.date'), t('table.description'), t('table.amount'), t('table.status'), t('table.receipt')].map(h => (
                <div key={h} style={{ fontSize: '11px', fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.5px', textTransform: 'uppercase' }}>{h}</div>
              ))}
            </div>

            {invoices.map((inv, i) => (
              <div
                key={inv.id}
                style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 1fr 1fr 1fr', padding: '16px 28px', borderBottom: i < invoices.length - 1 ? '1px solid var(--border)' : 'none', alignItems: 'center', transition: 'background 0.15s ease' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(252,174,145,0.03)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <div style={{ fontSize: '13px', color: 'var(--muted)' }}>{fmtDate(inv.paid_at, t('empty.noData'))}</div>
                <div style={{ fontSize: '13px', color: 'var(--onyx)', fontWeight: 500 }}>{inv.plan_name}</div>
                <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--onyx)' }}>{formatMoney(inv.amount, currency)}</div>
                <div><StatusBadge status={inv.status} /></div>
                <div>
                  {inv.pdf_url ? (
                    <a
                      href={inv.pdf_url} target="_blank" rel="noopener noreferrer"
                      style={{ padding: '5px 12px', borderRadius: '8px', border: '1.5px solid var(--border)', background: 'transparent', color: 'var(--muted)', fontSize: '11px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: '4px', textDecoration: 'none' }}>
                      <DownloadIcon />PDF
                    </a>
                  ) : (
                    <span style={{ fontSize: '12px', color: 'var(--muted)', opacity: 0.5 }}>{t('empty.noData')}</span>
                  )}
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
