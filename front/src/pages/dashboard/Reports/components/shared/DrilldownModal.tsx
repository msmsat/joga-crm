import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ModalShell, ModalHeader, ModalBody, ModalFooter, EmptyState, GhostButton, Input,
} from '../../../../../components/ui/index';
import { useExport } from '../../hooks/useExport';

export interface DrilldownColumn {
  key: string;
  label: string;
  align?: 'right';
}

// Строка таблицы. Ключи-колонки — уже отформатированный текст, `_id` — сырой
// идентификатор для перехода по клику (в колонках его нет, поэтому не рисуется).
export type DrilldownRow = Record<string, React.ReactNode>;

export interface DrilldownStat {
  label: string;
  value: string;
  tone?: 'positive' | 'negative';
}

export interface DrilldownModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  icon?: 'money' | 'calendar';
  /** Крупное число левой панели. Без него берётся количество строк. */
  hero?: { value: string; label: string };
  /** Реальные агрегаты среза — считаются вызывающей вкладкой по сырым данным. */
  stats?: DrilldownStat[];
  /** Подсказка, куда уводит клик по строке (показывается только с onRowClick). */
  rowHint?: string;
  columns: DrilldownColumn[];
  rows: DrilldownRow[];
  loading?: boolean;
  onRowClick?: (row: DrilldownRow) => void;
  /** Имя файла экспорта; без него кнопки «Экспорт CSV» в панели нет. */
  exportName?: string;
  footer?: React.ReactNode;
}

const TONE_COLOR: Record<'positive' | 'negative', string> = {
  positive: '#7FA98A',
  negative: '#C97F8E',
};

// Ищем и экспортируем только по текстовым ячейкам: ReactNode-ячейку
// (бейдж, иконка) в CSV и поиск честно не превратить.
const cellText = (v: React.ReactNode): string =>
  (typeof v === 'string' || typeof v === 'number' ? String(v) : '');

const ICONS: Record<'money' | 'calendar', React.ReactNode> = {
  money: (
    <g stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3.5" y="7" width="17" height="10" rx="2.2" />
      <circle cx="12" cy="12" r="2.4" />
      <path d="M6.6 12h.01M17.4 12h.01" />
    </g>
  ),
  calendar: (
    <g stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="5.5" width="16" height="14" rx="2.4" />
      <path d="M4 9.6h16M8.6 3.6v3.4M15.4 3.6v3.4" />
      <path d="M8 13.2h3M8 16.4h6" />
    </g>
  ),
};

export function DrilldownModal({
  open, onClose, title, subtitle, icon = 'money', hero, stats, rowHint,
  columns, rows, loading, onRowClick, exportName, footer,
}: DrilldownModalProps) {
  const { t } = useTranslation('reports');
  const { exportCSV } = useExport();
  const [search, setSearch] = useState('');

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(r => columns.some(c => cellText(r[c.key]).toLowerCase().includes(q)));
  }, [rows, columns, search]);

  if (!open) return null;

  const left = (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" style={{ color: 'rgba(249,160,139,0.55)', marginBottom: '20px', flexShrink: 0 }}>
        <circle cx="12" cy="12" r="11" fill="rgba(249,160,139,0.08)" />
        {ICONS[icon]}
      </svg>

      <div style={{ fontSize: '32px', fontWeight: 900, color: 'var(--text)', letterSpacing: '-1px', lineHeight: 1.1 }}>
        {hero?.value ?? String(rows.length)}
      </div>
      <div style={{ fontSize: '13px', color: 'var(--text3)', marginTop: '2px' }}>
        {hero?.label ?? t('overview.drilldown.rowsCount')}
      </div>

      {subtitle && (
        <div style={{ fontSize: '13px', color: 'var(--text3)', marginTop: '10px', lineHeight: 1.45 }}>
          {subtitle}
        </div>
      )}

      {!!stats?.length && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginTop: '24px' }}>
          {stats.map(s => (
            <div key={s.label}>
              <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                {s.label}
              </div>
              <div style={{ fontSize: '16px', fontWeight: 800, marginTop: '2px', color: s.tone ? TONE_COLOR[s.tone] : 'var(--text)' }}>
                {s.value}
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: 'auto', paddingTop: '20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {onRowClick && rowHint && (
          <div style={{ fontSize: '11px', color: 'var(--text3)', lineHeight: 1.4 }}>{rowHint}</div>
        )}
        {exportName && (
          // Экспортируем то, что видно на экране (с учётом поиска), и под
          // человеческими заголовками колонок — не под ключами.
          <GhostButton onClick={() => exportCSV(
            filteredRows.map(r => Object.fromEntries(columns.map(c => [c.label, cellText(r[c.key])]))),
            exportName,
          )}>
            {t('overview.drilldown.export')}
          </GhostButton>
        )}
      </div>
    </div>
  );

  return (
    <ModalShell onClose={onClose} size="lg" left={left}>
      {/* subtitle живёт в левой панели — в шапке он был бы вторым таким же
          абзацем в 10 см от первого */}
      <ModalHeader title={title} />
      <ModalBody>
        {loading ? (
          <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text3)' }}>{t('table.loading')}</div>
        ) : rows.length === 0 ? (
          <EmptyState size="sm" icon="search" title={t('empty.noRows')} />
        ) : (
          <>
            {rows.length > 8 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
                <div style={{ flex: 1 }}>
                  <Input
                    value={search}
                    onChange={setSearch}
                    placeholder={t('overview.drilldown.search')}
                    icon={
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                        <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                      </svg>
                    }
                  />
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text3)', fontWeight: 600, whiteSpace: 'nowrap' }}>
                  {t('overview.drilldown.shownOf', { shown: filteredRows.length, total: rows.length })}
                </div>
              </div>
            )}

            {filteredRows.length === 0 ? (
              <EmptyState
                size="sm"
                icon="search"
                title={t('overview.drilldown.noMatches', { query: search })}
                action={<GhostButton onClick={() => setSearch('')}>{t('overview.drilldown.reset')}</GhostButton>}
              />
            ) : (
              // Своя область скролла (а не общий скролл тела): поиск и шапка
              // таблицы остаются на месте, когда список длинный.
              <div className="ms-scroll" style={{ flex: '0 1 auto', minHeight: 0, overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead>
                    <tr>
                      {columns.map(col => (
                        <th key={col.key} style={{
                          textAlign: col.align === 'right' ? 'right' : 'left',
                          padding: '8px 10px', fontSize: '11px', fontWeight: 700,
                          color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.3px',
                          position: 'sticky', top: 0, zIndex: 1, background: 'var(--bg-card, #FDFCFB)',
                          // border-bottom у sticky-ячейки уезжает вместе с контентом — рисуем тенью
                          boxShadow: 'inset 0 -1px 0 var(--border)',
                        }}>
                          {col.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.map((row, i) => (
                      <tr
                        key={(row._id as number | string | undefined) ?? i}
                        onClick={() => onRowClick?.(row)}
                        style={{ cursor: onRowClick ? 'pointer' : 'default' }}
                        onMouseEnter={e => { if (onRowClick) e.currentTarget.style.background = 'rgba(249,160,139,0.06)'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                      >
                        {columns.map(col => (
                          <td key={col.key} style={{
                            padding: '10px', borderBottom: '1px solid var(--border)', color: 'var(--text)',
                            textAlign: col.align === 'right' ? 'right' : 'left',
                            fontVariantNumeric: col.align === 'right' ? 'tabular-nums' : undefined,
                          }}>
                            {row[col.key]}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </ModalBody>
      {footer && <ModalFooter>{footer}</ModalFooter>}
    </ModalShell>
  );
}
