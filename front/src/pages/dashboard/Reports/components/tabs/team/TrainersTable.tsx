import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, EmptyState } from '../../../../../../components/ui/index';
import { fmtMoney, fmtInt, fmtPct } from '../../../../../../lib/format';
import { ProgressBar } from '../../ProgressBar';
import type { TrainerRow } from '../../../types';

type SortKey = 'name' | 'lessons' | 'fill_pct' | 'attendance' | 'revenue' | 'return_rate_pct' | 'cancels';

export interface TrainersTableProps {
  trainers: TrainerRow[];
  onRowClick: (row: TrainerRow) => void;
}

const COLUMNS: { key: SortKey; labelKey: string; align?: 'right' }[] = [
  { key: 'name', labelKey: 'team.table.trainer' },
  { key: 'lessons', labelKey: 'team.table.lessons', align: 'right' },
  { key: 'fill_pct', labelKey: 'team.table.fillPct', align: 'right' },
  { key: 'attendance', labelKey: 'team.table.attendance', align: 'right' },
  { key: 'revenue', labelKey: 'team.table.revenue', align: 'right' },
  { key: 'return_rate_pct', labelKey: 'team.table.returnRate', align: 'right' },
  { key: 'cancels', labelKey: 'team.table.cancels', align: 'right' },
];

function sortValue(key: SortKey, r: TrainerRow): number | string {
  if (key === 'name') return r.name;
  return r[key];
}

const StarIcon = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="#f0c040" stroke="#f0c040" strokeWidth="1.5">
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
  </svg>
);

export function TrainersTable({ trainers, onRowClick }: TrainersTableProps) {
  const { t } = useTranslation('reports');
  // Дефолт — по возвращаемости (принцип «не только выручка» из ТЗ).
  const [sortKey, setSortKey] = useState<SortKey>('return_rate_pct');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const sorted = useMemo(() => {
    const copy = [...trainers];
    copy.sort((a, b) => {
      const av = sortValue(sortKey, a);
      const bv = sortValue(sortKey, b);
      const cmp = typeof av === 'string' ? av.localeCompare(String(bv)) : Number(av) - Number(bv);
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return copy;
  }, [trainers, sortKey, sortDir]);

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
      {trainers.length === 0 ? (
        <EmptyState size="sm" icon="clients" title={t('empty.noRows')} />
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
            {sorted.map(row => (
              <tr
                key={row.trainer_id}
                onClick={() => onRowClick(row)}
                style={{ cursor: 'pointer' }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(249,160,139,0.06)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
              >
                <td style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', color: 'var(--text)', fontWeight: 600 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {row.name}
                    {row.rating != null && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '2px', color: 'var(--text3)', fontWeight: 700, fontSize: '11px' }}>
                        <StarIcon />{row.rating.toFixed(1)}
                      </span>
                    )}
                  </div>
                </td>
                <td style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', textAlign: 'right', color: 'var(--text)' }}>
                  {fmtInt(row.lessons)}
                </td>
                <td style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', textAlign: 'right' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px' }}>
                    <div style={{ width: '48px' }}><ProgressBar value={row.fill_pct} height={5} /></div>
                    <span style={{ color: 'var(--text)', width: '38px', textAlign: 'right' }}>{Math.round(row.fill_pct)}%</span>
                  </div>
                </td>
                <td style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', textAlign: 'right', color: 'var(--text)' }}>
                  {fmtInt(row.attendance)}
                </td>
                <td style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', textAlign: 'right', color: 'var(--text)', fontWeight: 700 }}>
                  {fmtMoney(row.revenue)}
                </td>
                <td style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', textAlign: 'right' }}>
                  <span style={{
                    padding: '3px 8px', borderRadius: '6px', fontSize: '12px', fontWeight: 700,
                    background: row.return_rate_pct >= 60 ? 'rgba(91,171,114,0.12)' : 'rgba(26,26,26,0.05)',
                    color: row.return_rate_pct >= 60 ? '#5BAB72' : 'var(--text)',
                  }}>
                    {fmtPct(row.return_rate_pct)}
                  </span>
                </td>
                <td style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', textAlign: 'right', color: row.cancels > 0 ? '#D88C9A' : 'var(--text3)' }}>
                  {fmtInt(row.cancels)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}
