import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, EmptyState } from '../../../../../../components/ui/index';
import { fmtMoney, fmtInt, fmtPct } from '../../../../../../lib/format';
import type { ProductRow } from '../../../types';

type SortKey = 'name' | 'sold' | 'revenue' | 'avg_check' | 'repeat_share_pct' | 'trend_pct';

export interface ProductsTableProps {
  products: ProductRow[];
  onRowClick: (row: ProductRow) => void;
}

const COLUMNS: { key: SortKey; labelKey: string; align?: 'right' }[] = [
  { key: 'name', labelKey: 'sales.products.name' },
  { key: 'sold', labelKey: 'sales.products.sold', align: 'right' },
  { key: 'revenue', labelKey: 'sales.products.revenue', align: 'right' },
  { key: 'avg_check', labelKey: 'sales.products.avgCheck', align: 'right' },
  { key: 'repeat_share_pct', labelKey: 'sales.products.repeatShare', align: 'right' },
  { key: 'trend_pct', labelKey: 'sales.products.trend', align: 'right' },
];

function rowKey(row: SortKey, r: ProductRow): number | string {
  if (row === 'name') return r.name ?? '';
  return r[row] ?? -Infinity;
}

export function ProductsTable({ products, onRowClick }: ProductsTableProps) {
  const { t } = useTranslation('reports');
  const [sortKey, setSortKey] = useState<SortKey>('revenue');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const sorted = useMemo(() => {
    const copy = [...products];
    copy.sort((a, b) => {
      const av = rowKey(sortKey, a);
      const bv = rowKey(sortKey, b);
      const cmp = typeof av === 'string' ? av.localeCompare(String(bv)) : Number(av) - Number(bv);
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return copy;
  }, [products, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  return (
    <Card padding={0} style={{ overflow: 'hidden' }}>
      {products.length === 0 ? (
        <EmptyState size="sm" icon="search" title={t('empty.noProducts')} />
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
          <thead>
            <tr>
              {COLUMNS.map(col => (
                <th
                  key={col.key}
                  onClick={() => toggleSort(col.key)}
                  style={{
                    textAlign: col.align ?? 'left', padding: '12px 16px', fontSize: '11px', fontWeight: 700,
                    color: sortKey === col.key ? 'var(--text)' : 'var(--text3)', textTransform: 'uppercase',
                    letterSpacing: '0.3px', borderBottom: '1px solid var(--border)', cursor: 'pointer',
                    userSelect: 'none', whiteSpace: 'nowrap',
                  }}
                >
                  {t(col.labelKey)}
                  {sortKey === col.key && (sortDir === 'asc' ? ' ↑' : ' ↓')}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map(row => {
              // "без продукта" (product_id=null) не фильтруется на бэке — не открываем drilldown вслепую.
              const clickable = row.product_id != null;
              return (
              <tr
                key={row.product_id ?? 'none'}
                onClick={clickable ? () => onRowClick(row) : undefined}
                style={{ cursor: clickable ? 'pointer' : 'default' }}
                onMouseEnter={e => { if (clickable) e.currentTarget.style.background = 'rgba(249,160,139,0.06)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
              >
                <td style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', color: 'var(--text)', fontWeight: 600 }}>
                  {row.name ?? t('table.noProduct')}
                </td>
                <td style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', textAlign: 'right', color: 'var(--text)' }}>
                  {fmtInt(row.sold)}
                </td>
                <td style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', textAlign: 'right', color: 'var(--text)', fontWeight: 700 }}>
                  {fmtMoney(row.revenue)}
                </td>
                <td style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', textAlign: 'right', color: 'var(--text)' }}>
                  {fmtMoney(row.avg_check)}
                </td>
                <td style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', textAlign: 'right', color: 'var(--text)' }}>
                  {fmtPct(row.repeat_share_pct)}
                </td>
                <td style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', textAlign: 'right' }}>
                  {row.trend_pct != null ? (
                    <span style={{
                      padding: '3px 8px', borderRadius: '6px', fontSize: '12px', fontWeight: 700,
                      background: row.trend_pct >= 0 ? 'rgba(91,171,114,0.12)' : 'rgba(216,140,154,0.12)',
                      color: row.trend_pct >= 0 ? '#5BAB72' : '#D88C9A',
                    }}>
                      {fmtPct(row.trend_pct)}
                    </span>
                  ) : (
                    <span style={{ color: 'var(--text3)' }}>—</span>
                  )}
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </Card>
  );
}
