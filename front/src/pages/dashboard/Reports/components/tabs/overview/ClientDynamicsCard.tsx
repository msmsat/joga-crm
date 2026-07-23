import { useTranslation } from 'react-i18next';
import { ChartCard } from '../../shared/ChartCard';
import { fmtInt, fmtPct } from '../../../../../../lib/format';
import type { ClientDynamics, Kpi } from '../../../types';

export interface ClientDynamicsCardProps {
  dynamics: ClientDynamics;
  onClick: () => void;
}

function DynamicsStat({ label, kpi, color }: { label: string; kpi: Kpi; color: string }) {
  return (
    <div style={{ textAlign: 'center', flex: 1 }}>
      <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text3)', marginBottom: '6px' }}>{label}</div>
      <div style={{ fontSize: '24px', fontWeight: 800, color }}>{fmtInt(kpi.value)}</div>
      {kpi.prev_pct != null && (
        <div style={{ fontSize: '11px', fontWeight: 700, color: kpi.prev_pct >= 0 ? '#5BAB72' : '#D88C9A', marginTop: '2px' }}>
          {fmtPct(kpi.prev_pct)}
        </div>
      )}
    </div>
  );
}

export function ClientDynamicsCard({ dynamics, onClick }: ClientDynamicsCardProps) {
  const { t } = useTranslation('reports');

  return (
    <ChartCard title={t('overview.clientDynamics.title')} formulaKey="newClients">
      <div onClick={onClick} style={{ display: 'flex', cursor: 'pointer' }}>
        <DynamicsStat label={t('overview.clientDynamics.new')} kpi={dynamics.new} color="#5BAB72" />
        <DynamicsStat label={t('overview.clientDynamics.returned')} kpi={dynamics.returned} color="#4A80C4" />
        <DynamicsStat label={t('overview.clientDynamics.lost')} kpi={dynamics.lost} color="#D88C9A" />
      </div>
    </ChartCard>
  );
}
