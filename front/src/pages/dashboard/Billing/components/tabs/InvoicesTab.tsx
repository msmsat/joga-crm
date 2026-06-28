import styles from '../../Billing.module.css';
import { TrendingIcon, HistoryIcon, DownloadIcon } from '../ui/BillingIcons';
import { invoices } from '../../constants';

function fmtAmount(n: number): string {
  return `₽${n.toLocaleString('ru-RU')}`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
}

const MONTHS = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];

function getBarValue(i: number): number {
  if (i < 8) return 990;
  if (i === 14 || i === 19) return 5990;
  return 2490;
}

export default function InvoicesTab() {
  return (
    <div style={{ padding: '0 32px' }}>

      <div style={{ padding: '32px 36px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '20px', boxShadow: 'var(--shadow)', marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '40px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <TrendingIcon />
            <span style={{ fontSize: '16px', fontWeight: 800, color: 'var(--onyx)' }}>Динамика расходов за 2 года</span>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '24px', fontWeight: 900, color: 'var(--onyx)', letterSpacing: '-0.5px' }}>₽59 760</div>
            <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--muted)', marginTop: '2px' }}>общие траты за 24 месяца</div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '6px', height: '180px', position: 'relative' }}>
          {Array.from({ length: 24 }).map((_, i) => {
            const date = new Date();
            date.setMonth(date.getMonth() - (23 - i));
            const label = `${MONTHS[date.getMonth()]} '${date.getFullYear().toString().slice(2)}`;
            const val = getBarValue(i);
            const max = 6500;
            const height = Math.max((val / max) * 150, 10);
            const isCurrent = i === 23;

            return (
              <div key={i} className={styles.chartBarGroup} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                <div className={styles.chartTooltip}>
                  <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '10px', marginBottom: '4px', fontWeight: 600 }}>{label}</div>
                  <div style={{ fontSize: '14px' }}>₽{val.toLocaleString('ru-RU')}</div>
                </div>
                <div className={styles.barFill} style={{
                  width: '100%', maxWidth: '24px', height: `${height}px`,
                  background: isCurrent
                    ? 'linear-gradient(180deg, var(--peach), #F9A08B)'
                    : val > 3000 ? 'rgba(26,26,26,0.3)' : 'rgba(252,174,145,0.25)',
                  borderRadius: '6px 6px 4px 4px',
                  boxShadow: isCurrent ? '0 4px 16px rgba(252,174,145,0.4)' : 'none',
                }} />
                <div style={{ fontSize: '10px', color: 'var(--muted)', fontWeight: 600, opacity: i % 3 === 0 || isCurrent ? 1 : 0, whiteSpace: 'nowrap' }}>
                  {i % 3 === 0 || isCurrent ? label : '·'}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '20px', boxShadow: 'var(--shadow)', overflow: 'hidden' }}>
        <div style={{ padding: '20px 28px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <HistoryIcon />
            <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--onyx)' }}>История платежей</span>
          </div>
          <button
            onClick={() => {
              const headers = ['Дата', 'Описание', 'Сумма', 'Статус'];
              const rows = invoices.map(inv => [fmtDate(inv.paid_at), inv.plan_name, fmtAmount(inv.amount), 'Оплачено']);
              const csv = '﻿' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
              const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url; a.download = 'velora_invoices.csv';
              document.body.appendChild(a); a.click(); document.body.removeChild(a);
              URL.revokeObjectURL(url);
            }}
            style={{ padding: '8px 16px', borderRadius: '10px', border: '1.5px solid var(--border)', background: 'transparent', color: 'var(--muted)', fontSize: '12px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '6px', transition: 'all 0.2s ease' }}>
            <DownloadIcon />Экспорт CSV
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 1fr 1fr', padding: '12px 28px', borderBottom: '1px solid var(--border)', background: 'rgba(102,102,102,0.03)' }}>
          {['Дата', 'Описание', 'Сумма', 'Чек'].map(h => (
            <div key={h} style={{ fontSize: '11px', fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.5px', textTransform: 'uppercase' }}>{h}</div>
          ))}
        </div>

        {invoices.map((inv, i) => (
          <div
            key={i}
            style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 1fr 1fr', padding: '16px 28px', borderBottom: i < invoices.length - 1 ? '1px solid var(--border)' : 'none', alignItems: 'center', transition: 'background 0.15s ease' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(252,174,145,0.03)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            <div style={{ fontSize: '13px', color: 'var(--muted)' }}>{fmtDate(inv.paid_at)}</div>
            <div style={{ fontSize: '13px', color: 'var(--onyx)', fontWeight: 500 }}>{inv.plan_name}</div>
            <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--onyx)' }}>{fmtAmount(inv.amount)}</div>
            <div>
              <button
                onClick={() => {
                  const win = window.open('', '_blank');
                  if (!win) return;
                  win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Счёт — ${inv.plan_name}</title><style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:'Inter',Arial,sans-serif;padding:48px;color:#1A1A1A;max-width:600px}h1{font-size:26px;font-weight:800;letter-spacing:-0.5px;margin-bottom:4px}h1 span{color:#F9A08B}.sub{color:#666;font-size:13px;margin-bottom:40px;margin-top:2px}.divider{height:1px;background:#eee;margin:28px 0}table{width:100%;border-collapse:collapse}td{padding:13px 0;border-bottom:1px solid #f0f0f0;font-size:14px}td:last-child{text-align:right;font-weight:700}.total td{font-size:16px;font-weight:800;border-bottom:none;padding-top:22px}.badge{display:inline-block;padding:3px 10px;border-radius:20px;background:#A3C9A822;color:#2A6B35;font-size:11px;font-weight:700;border:1px solid #A3C9A8}.footer{margin-top:40px;font-size:11px;color:#999;line-height:1.6}@media print{body{padding:32px}}</style></head><body><h1>Velora <span>CRM</span></h1><div class="sub">Квитанция об оплате · ${new Date().toLocaleDateString('ru-RU')}</div><div class="divider"></div><table><tr><td style="color:#666">Описание</td><td>${inv.plan_name}</td></tr><tr><td style="color:#666">Дата списания</td><td>${fmtDate(inv.paid_at)}</td></tr><tr><td style="color:#666">Способ оплаты</td><td>${inv.payment_method ?? 'Visa •••• 4242'}</td></tr><tr><td style="color:#666">Статус</td><td><span class="badge">Оплачено</span></td></tr><tr class="total"><td>Итого</td><td>${fmtAmount(inv.amount)}</td></tr></table><div class="footer">Velora CRM · velora.studio<br>Поддержка: support@velora.studio</div></body></html>`);
                  win.document.close();
                  setTimeout(() => win.print(), 350);
                }}
                style={{ padding: '5px 12px', borderRadius: '8px', border: '1.5px solid var(--border)', background: 'transparent', color: 'var(--muted)', fontSize: '11px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <DownloadIcon />PDF
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
