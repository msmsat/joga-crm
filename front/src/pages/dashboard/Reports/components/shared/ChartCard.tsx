import { useTranslation } from 'react-i18next';
import { Card, InfoHint } from '../../../../../components/ui/index';

export interface ChartCardProps {
  title: string;
  subtitle?: string;
  formulaKey: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}

export function ChartCard({ title, subtitle, formulaKey, actions, children }: ChartCardProps) {
  const { t } = useTranslation('reports');

  return (
    <Card padding={28}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div>
            <h3 style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text)', margin: 0, letterSpacing: '-0.2px' }}>{title}</h3>
            {subtitle && <p style={{ fontSize: '12px', color: 'var(--text3)', margin: '2px 0 0' }}>{subtitle}</p>}
          </div>
          <InfoHint
            title={t(`formulas.${formulaKey}.title`)}
            text={t(`formulas.${formulaKey}.text`)}
          />
        </div>
        {actions}
      </div>
      {children}
    </Card>
  );
}
