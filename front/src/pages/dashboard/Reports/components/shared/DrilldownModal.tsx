import { ModalShell, ModalHeader, ModalBody } from '../../../../../components/ui/index';

export interface DrilldownColumn {
  key: string;
  label: string;
}

export interface DrilldownModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  columns: DrilldownColumn[];
  rows: Record<string, React.ReactNode>[];
  loading?: boolean;
  onRowClick?: (row: Record<string, React.ReactNode>) => void;
}

export function DrilldownModal({ open, onClose, title, columns, rows, loading, onRowClick }: DrilldownModalProps) {
  if (!open) return null;

  return (
    <ModalShell onClose={onClose} size="lg">
      <ModalHeader title={title} />
      <ModalBody>
        {loading ? (
          <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text3)' }}>…</div>
        ) : rows.length === 0 ? (
          <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text3)' }}>—</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr>
                {columns.map(col => (
                  <th key={col.key} style={{
                    textAlign: 'left', padding: '8px 10px', fontSize: '11px', fontWeight: 700,
                    color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.3px',
                    borderBottom: '1px solid var(--border)',
                  }}>
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr
                  key={i}
                  onClick={() => onRowClick?.(row)}
                  style={{ cursor: onRowClick ? 'pointer' : 'default' }}
                  onMouseEnter={e => { if (onRowClick) e.currentTarget.style.background = 'rgba(249,160,139,0.06)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                >
                  {columns.map(col => (
                    <td key={col.key} style={{ padding: '10px', borderBottom: '1px solid var(--border)', color: 'var(--text)' }}>
                      {row[col.key]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </ModalBody>
    </ModalShell>
  );
}
