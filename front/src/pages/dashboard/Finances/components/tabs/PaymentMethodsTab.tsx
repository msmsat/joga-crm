import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ToastType } from '../../types';
import { Ico } from '../ui/FinanceIcons';
import { InfoHint } from '../../../../../components/ui/InfoHint';
import { useStudioCurrency } from '../../../../../hooks/useStudioCurrency';
import { getCurrencySymbol } from '../../../../../components/UI';
import { useMethodStats } from '../../hooks/useFinances';
import { PAYMENT_METHOD_KEYS } from '../../constants';
import { PeriodDropdown } from '../ui/PeriodDropdown';

type Period = 'month' | 'quarter' | 'year';

const PERIOD_DAYS: Record<Period, number> = { month: 30, quarter: 90, year: 365 };

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function daysAgoISO(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

const ICONS: Record<string, React.ReactNode> = {
  cash: <Ico.Cash />,
  card: <Ico.Card />,
  qr: <Ico.QR />,
  transfer: <Ico.World />,
  stripe: <Ico.Dollar />,
  fondy: <Ico.Dollar />,
  '': <Ico.Dots />,
};

// showToast не используется здесь (вкладка read-only), проп принят для единой сигнатуры вкладок в Finances.tsx.
export default function PaymentMethodsTab(props: { showToast: (msg: string, t?: ToastType) => void }) {
  void props;
  const { t } = useTranslation('finances');
  const currency = getCurrencySymbol(useStudioCurrency());
  const fmt = (n: number) => `${currency}${n.toLocaleString('ru-RU')}`;
  const [period, setPeriod] = useState<Period>('month');

  const dateFrom = daysAgoISO(PERIOD_DAYS[period]);
  const dateTo = todayISO();
  const { data: stats = [], isLoading } = useMethodStats(dateFrom, dateTo);

  const total = stats.reduce((s, m) => s + m.amount, 0);

  // Все ключи-константы + "не указан", даже если сумма 0 — видно все методы студии.
  const rows = [...PAYMENT_METHOD_KEYS, ''].map(key => {
    const found = stats.find(s => s.method === key);
    return { method: key, amount: found?.amount ?? 0, count: found?.count ?? 0 };
  }).filter(r => r.amount > 0 || r.method !== '')
    .sort((a, b) => b.amount - a.amount);

  return (
    <>
      <div className="card card-sm" style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '24px', background: 'linear-gradient(135deg, rgba(252,174,145,0.06) 0%, transparent 60%)' }}>
        <div>
          <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            {t('paymentMethods.totalTurnover')}
            <InfoHint title={t('tabs.paymentMethods')} text={t('info.paymentMethods')} />
          </div>
          <div style={{ fontSize: '28px', fontWeight: 800, letterSpacing: '-0.5px' }}>{fmt(total)}</div>
        </div>
        <div style={{ width: '1px', height: '40px', background: 'var(--border)' }} />
        <PeriodDropdown
          value={period}
          options={(['month', 'quarter', 'year'] as const).map(p => ({ value: p, label: t(`paymentMethods.periods.${p}`) }))}
          onChange={v => setPeriod(v as Period)}
        />
      </div>

      {isLoading ? (
        <div style={{ background: '#FFFFFF', borderRadius: '16px', padding: '64px 20px', textAlign: 'center', color: '#999999', fontSize: '14px', fontWeight: 600, border: '1px solid rgba(26,26,26,0.06)' }}>{t('common.loading')}</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {rows.map(r => {
            const share = total > 0 ? Math.round((r.amount / total) * 100) : 0;
            return (
              <div key={r.method || '_unspecified'} className="card card-sm" style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <div style={{ width: '44px', height: '44px', borderRadius: '12px', flexShrink: 0, background: 'rgba(252,174,145,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)' }}>
                  {ICONS[r.method] ?? <Ico.Dots />}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '2px' }}>{t(`paymentMethods.methods.${r.method}.name`)}</div>
                  <div style={{ fontSize: '12px', color: 'var(--text3)' }}>{r.count} {t('paymentMethods.transactions')}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '15px', fontWeight: 800, color: '#1A1A1A' }}>{fmt(r.amount)}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text3)', fontWeight: 600 }}>{t('paymentMethods.share')}: {share}%</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
