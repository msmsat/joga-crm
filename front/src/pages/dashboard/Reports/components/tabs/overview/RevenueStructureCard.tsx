import { useTranslation } from 'react-i18next';
import { EmptyState } from '../../../../../../components/ui/index';
import { ChartCard } from '../../shared/ChartCard';
import { fmtMoney } from '../../../../../../lib/format';
import type { RevenueStructureRow } from '../../../types';

export interface RevenueStructureCardProps {
  rows: RevenueStructureRow[];
  onCategoryClick: (category: string) => void;
}

const BAR_COLORS = ['#FCAE91', '#5BAB72', '#4A80C4', '#D88C9A', '#A3C9A8'];

export function RevenueStructureCard({ rows, onCategoryClick }: RevenueStructureCardProps) {
  const { t } = useTranslation('reports');

  return (
    <ChartCard title={t('overview.revenueStructure.title')} formulaKey="revenue">
      {rows.length === 0 ? (
        <EmptyState size="sm" icon="money" title={t('empty.noRevenue')} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {rows.map((row, i) => (
            <div
              key={row.category}
              onClick={() => onCategoryClick(row.category)}
              style={{ cursor: 'pointer' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text2)' }}>
                  {t(`overview.category.${row.category}`, row.category)}
                </span>
                <span style={{ fontSize: '13px', fontWeight: 800 }}>
                  {fmtMoney(row.amount)} <span style={{ color: 'var(--text3)', fontWeight: 500 }}>({row.share_pct}%)</span>
                </span>
              </div>
              <div style={{ height: '6px', borderRadius: '3px', background: 'rgba(26,26,26,0.06)', overflow: 'hidden' }}>
                <div style={{
                  width: `${row.share_pct}%`, height: '100%', borderRadius: '3px',
                  background: BAR_COLORS[i % BAR_COLORS.length], transition: 'width 0.3s ease',
                }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </ChartCard>
  );
}
