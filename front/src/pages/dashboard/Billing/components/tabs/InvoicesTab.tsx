import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HistoryIcon, DownloadIcon, RefreshIcon } from '../ui/BillingIcons';

import { billingApi } from '../../../../../api/billing/billing.api';
import { formatMoney } from '../../../../../lib/money';
import { useToast } from '../../../../../components/ui/index';
import type { Invoice, PlanType } from '../../types';

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
  refunded: { key: 'status.refunded', color: 'var(--muted)', bg: 'rgba(102,102,102,0.10)' },
};

// paid/refunded — конечные, банк их уже не поменяет; остальные можно сверить.
const FINAL_STATUSES = ['paid', 'refunded'];

// Счета за комиссию приезжают с plan_name = видом счёта, а не тарифом, и в
// каталоге `plans` их нет — без этой карты в истории висел бы сырой ключ
// «offline_fee». Ключи те же, что kind на бэке (models/settings.py:BillingInvoice).
const FEE_KIND_KEYS: Record<string, string> = {
  offline_fee: 'invoices.kindOfflineFee',
  min_fee: 'invoices.kindMinFee',
  online_fee: 'invoices.kindOnlineFee',
};

interface StatusProps {
  status: string;
  busy: boolean;
  onSync?: () => void;
}

function StatusBadge({ status, busy, onSync }: StatusProps) {
  const { t } = useTranslation('billing');
  const m = STATUS_META[status] ?? STATUS_META.pending;
  const style = {
    display: 'inline-flex', alignItems: 'center', gap: '5px',
    padding: '3px 10px', borderRadius: '20px', background: m.bg, color: m.color,
    fontSize: '11px', fontWeight: 700, fontFamily: 'inherit',
  } as const;

  if (!onSync) return <span style={style}>{t(m.key)}</span>;

  return (
    <button
      onClick={onSync}
      disabled={busy}
      title={t('invoices.syncHint')}
      style={{ ...style, border: 'none', cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1, transition: 'opacity 0.2s ease' }}
    >
      {t(m.key)}
      <RefreshIcon />
    </button>
  );
}

interface Props {
  currency?: string;
  invoices: Invoice[];
  loaded: boolean;
  plans: Record<PlanType, { name: string; monthly: number; color: string }>;
  syncInvoice: (id: number) => Promise<Invoice>;
}

export default function InvoicesTab({ currency, invoices, loaded, plans, syncInvoice }: Props) {
  const { t } = useTranslation('billing');
  const toast = useToast();
  const [exporting, setExporting] = useState(false);
  const [openingReceiptId, setOpeningReceiptId] = useState<number | null>(null);
  const [syncingId, setSyncingId] = useState<number | null>(null);

  // Суммы счетов приходят в копейках (как и каталог) — в рубли переводим на отрисовке.
  const total = invoices.filter(i => i.status === 'paid').reduce((s, i) => s + i.amount, 0) / 100;

  const handleExport = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      await billingApi.exportInvoicesCsv();
    } catch {
      toast.error(t('invoices.exportError'));
    } finally {
      setExporting(false);
    }
  };

  const handleOpenReceipt = async (inv: Invoice) => {
    if (openingReceiptId !== null) return;
    setOpeningReceiptId(inv.id);
    try {
      await billingApi.openReceipt(inv.id, inv.pdf_url);
    } catch {
      toast.error(t('invoices.receiptError'));
    } finally {
      setOpeningReceiptId(null);
    }
  };

  // Сверка с банком: статус мог не дойти вебхуком. Не изменился — говорим об этом прямо,
  // чтобы клик не выглядел «ничего не произошло».
  const handleSync = async (inv: Invoice) => {
    if (syncingId !== null) return;
    setSyncingId(inv.id);
    try {
      const fresh = await syncInvoice(inv.id);
      if (fresh.status === inv.status) toast.info(t('invoices.syncUnchanged'));
      else toast.success(t('invoices.syncChanged', { status: t(`status.${fresh.status}`) }));
    } catch {
      toast.error(t('invoices.syncError'));
    } finally {
      setSyncingId(null);
    }
  };

  return (
    <div style={{ padding: '0 var(--card-pad)' }}>
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
              onClick={handleExport}
              disabled={exporting}
              style={{ padding: '8px 16px', borderRadius: '10px', border: '1.5px solid var(--border)', background: 'transparent', color: 'var(--muted)', fontSize: '12px', fontWeight: 600, cursor: exporting ? 'default' : 'pointer', opacity: exporting ? 0.6 : 1, fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '6px', transition: 'all 0.2s ease' }}>
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
            <div className="bill-inv-row bill-inv-head" style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 1fr 1fr 1fr', padding: '12px 28px', borderBottom: '1px solid var(--border)', background: 'rgba(102,102,102,0.03)' }}>
              {[t('table.date'), t('table.description'), t('table.amount'), t('table.status'), t('table.receipt')].map(h => (
                <div key={h} style={{ fontSize: '11px', fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.5px', textTransform: 'uppercase' }}>{h}</div>
              ))}
            </div>

            {invoices.map((inv, i) => (
              <div
                key={inv.id}
                className="bill-inv-row" style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 1fr 1fr 1fr', padding: '16px 28px', borderBottom: i < invoices.length - 1 ? '1px solid var(--border)' : 'none', alignItems: 'center', transition: 'background 0.15s ease' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(252,174,145,0.03)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <div style={{ fontSize: '13px', color: 'var(--muted)' }}>{fmtDate(inv.paid_at, t('empty.noData'))}</div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: '13px', color: 'var(--onyx)', fontWeight: 500 }}>
                    {FEE_KIND_KEYS[inv.plan_name]
                      ? t(FEE_KIND_KEYS[inv.plan_name])
                      : plans[inv.plan_name as PlanType]?.name ?? inv.plan_name}
                    {/* Период у счетов за комиссию всегда «1 мес.» и смысла не несёт —
                        показываем его только у счетов за тариф, где он и куплен. */}
                    {!FEE_KIND_KEYS[inv.plan_name] && (
                      <span style={{ color: 'var(--muted)', fontWeight: 400 }}> · {t('upgrade.periodValue', { count: inv.period_months })}</span>
                    )}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px' }}>
                    {inv.payment_method === 'stripe'
                      ? t('invoices.methodWithheld')
                      : inv.payment_method === 'iban'
                      ? t('invoices.methodIban')
                      : inv.payment_method
                      ? t('invoices.methodCard')
                      : t('invoices.invoiceNo', { id: inv.id })}
                  </div>
                </div>
                <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--onyx)' }}>{formatMoney(inv.amount / 100, currency)}</div>
                <div>
                  <StatusBadge
                    status={inv.status}
                    busy={syncingId === inv.id}
                    onSync={FINAL_STATUSES.includes(inv.status) ? undefined : () => handleSync(inv)}
                  />
                </div>
                <div>
                  {/* Чек есть у любого оплаченного счёта: есть pdf_url — открываем
                      фактуру Stripe, нет — наш /receipt.pdf (billingApi.openReceipt). */}
                  {inv.status === 'paid' ? (
                    <button
                      onClick={() => handleOpenReceipt(inv)}
                      disabled={openingReceiptId === inv.id}
                      style={{ padding: '5px 12px', borderRadius: '8px', border: '1.5px solid var(--border)', background: 'transparent', color: 'var(--muted)', fontSize: '11px', fontWeight: 600, cursor: openingReceiptId === inv.id ? 'default' : 'pointer', opacity: openingReceiptId === inv.id ? 0.6 : 1, fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      <DownloadIcon />PDF
                    </button>
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
