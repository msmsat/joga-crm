import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Card, EmptyState, InfoHint } from '../../../../../../components/ui/index';
import { fmtMoney, fmtInt } from '../../../../../../lib/format';
import type { BuyerTypeSlice, CategorySlice, MethodSlice } from '../../../types';

const BAR_COLORS = ['#FCAE91', '#5BAB72', '#4A80C4', '#D88C9A', '#A3C9A8'];

function SliceCard({
  title, formulaKey, rows, labelKey, onRowClick, t,
}: {
  title: string;
  formulaKey: string;
  rows: { key: string; amount: number; share_pct: number }[];
  labelKey: string;
  onRowClick: (key: string) => void;
  t: TFunction<'reports'>;
}) {
  return (
    <Card padding={24}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
        <h3 style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text)', margin: 0, letterSpacing: '-0.2px' }}>{title}</h3>
        <InfoHint title={t(`formulas.${formulaKey}.title`)} text={t(`formulas.${formulaKey}.text`)} />
      </div>
      {rows.length === 0 ? (
        <EmptyState size="sm" icon="chart" title={t('empty.noSales')} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {rows.map((row, i) => (
            <div key={row.key} onClick={() => onRowClick(row.key)} style={{ cursor: 'pointer' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text2)' }}>
                  {t(`${labelKey}.${row.key}`, row.key)}
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
    </Card>
  );
}

function BuyerTypeCard({ buyerType, t }: { buyerType: BuyerTypeSlice; t: TFunction<'reports'> }) {
  const total = buyerType.new.count + buyerType.returning.count + buyerType.no_client.count;
  const pct = (count: number) => (total ? Math.round((count / total) * 100) : 0);

  return (
    <Card padding={24}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
        <h3 style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text)', margin: 0, letterSpacing: '-0.2px' }}>
          {t('sales.breakdown.buyerType')}
        </h3>
        <InfoHint title={t('formulas.newClients.title')} text={t('formulas.newClients.text')} />
      </div>
      <div style={{ display: 'flex', gap: '16px' }}>
        <div style={{ flex: 1, textAlign: 'center' }}>
          <div style={{ fontSize: '24px', fontWeight: 800, color: '#5BAB72' }}>{fmtInt(buyerType.new.count)}</div>
          <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text3)', marginTop: '4px' }}>
            {t('sales.breakdown.new')} ({pct(buyerType.new.count)}%)
          </div>
        </div>
        <div style={{ flex: 1, textAlign: 'center' }}>
          <div style={{ fontSize: '24px', fontWeight: 800, color: '#4A80C4' }}>{fmtInt(buyerType.returning.count)}</div>
          <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text3)', marginTop: '4px' }}>
            {t('sales.breakdown.returning')} ({pct(buyerType.returning.count)}%)
          </div>
        </div>
        {buyerType.no_client.count > 0 && (
          <div style={{ flex: 1, textAlign: 'center' }}>
            <div style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text3)' }}>{fmtInt(buyerType.no_client.count)}</div>
            <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text3)', marginTop: '4px' }}>
              {t('sales.breakdown.noClient')} ({pct(buyerType.no_client.count)}%)
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

export interface BreakdownCardsProps {
  byCategory: CategorySlice[];
  byMethod: MethodSlice[];
  byBuyerType: BuyerTypeSlice;
  onCategoryClick: (category: string) => void;
  onMethodClick: (method: string) => void;
}

export function BreakdownCards({ byCategory, byMethod, byBuyerType, onCategoryClick, onMethodClick }: BreakdownCardsProps) {
  const { t } = useTranslation('reports');

  return (
    <div className="grid-2" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: '20px' }}>
      <SliceCard
        title={t('sales.breakdown.byCategory')}
        formulaKey="revenue"
        rows={byCategory.map(c => ({ key: c.category, amount: c.amount, share_pct: c.share_pct }))}
        labelKey="overview.category"
        onRowClick={onCategoryClick}
        t={t}
      />
      <SliceCard
        title={t('sales.breakdown.byMethod')}
        formulaKey="revenue"
        rows={byMethod.map(m => ({ key: m.method, amount: m.amount, share_pct: m.share_pct }))}
        labelKey="sales.method"
        onRowClick={onMethodClick}
        t={t}
      />
      <BuyerTypeCard buyerType={byBuyerType} t={t} />
    </div>
  );
}
