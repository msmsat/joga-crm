import type { Employee } from '../types';

export interface EmployeeCardProps {
  employee: Employee & { _resolvedGroup: string };
  isActive: boolean;
  onSelect: () => void;
}

export function EmployeeCard({ employee: s, isActive, onSelect }: EmployeeCardProps) {
  return (
    <div className={`s-item ${isActive ? 'active' : ''}`} onClick={onSelect}>
      <div
        className={`ava ${s.online ? 'ava-online' : ''}`}
        style={{ background: s.grad, width: '40px', height: '40px', fontSize: '13px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}
      >
        {s.initials}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="s-name" style={{ fontSize: '13px', fontWeight: 700 }}>
          {s.name.split(' ')[0]}{s.name.split(' ')[1] ? ' ' + s.name.split(' ')[1][0] + '.' : ''}
        </div>
        <div className="s-role" style={{ fontSize: '11px', marginTop: '1px' }}>{s.role}</div>
      </div>

      {s.online && (
        <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#A3C9A8', flexShrink: 0 }} />
      )}
    </div>
  );
}
