import { useTranslation } from 'react-i18next';
import { Card, InfoHint } from '../../../../../components/ui/index';
import { fmtMoney, fmtPct, fmtInt } from '../../../../../lib/format';

export interface KpiStatProps {
  label: string;
  value: number;
  trendPct: number | null;
  formulaKey: string;
  onClick?: () => void;
  format?: 'money' | 'int' | 'pct';
  currencySymbol?: string;
}

function formatValue(value: number, format: KpiStatProps['format'], currencySymbol?: string): string {
  if (format === 'money') return fmtMoney(value, currencySymbol);
  if (format === 'pct') return fmtPct(value);
  return fmtInt(value);
}

export function KpiStat({ label, value, trendPct, formulaKey, onClick, format = 'int', currencySymbol }: KpiStatProps) {
  const { t } = useTranslation('reports');
  const positive = trendPct != null && trendPct >= 0;

  return (
    <Card hover={!!onClick} onClick={onClick}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
        <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text3)' }}>{label}</span>
        <InfoHint
          title={t(`formulas.${formulaKey}.title`)}
          text={t(`formulas.${formulaKey}.text`)}
        />
      </div>
      <div style={{ fontSize: '28px', fontWeight: 800, color: 'var(--text)', marginTop: '8px', letterSpacing: '-0.5px' }}>
        {formatValue(value, format, currencySymbol)}
      </div>
      {trendPct != null && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '4px', marginTop: '6px',
          fontSize: '12px', fontWeight: 700,
          color: positive ? '#5BAB72' : '#D88C9A',
        }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"
            style={{ transform: positive ? 'none' : 'rotate(180deg)' }}>
            <polyline points="18 15 12 9 6 15" />
          </svg>
          {fmtPct(trendPct)}
        </div>
      )}
    </Card>
  );
}
