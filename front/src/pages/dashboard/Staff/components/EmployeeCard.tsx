import type { Employee } from '../types';

export interface EmployeeCardProps {
  employee: Employee & { 
    _resolvedGroupKey: string; 
    _translatedGroup: string;
    _translatedRole: string; // Наша новая переведенная роль!
  };
  isActive: boolean;
  onSelect: () => void;
}

export function EmployeeCard({ employee: s, isActive, onSelect }: EmployeeCardProps) {
  // Хук useTranslation удален, он тут больше не нужен!
  
  const initials = [s.name, s.last_name]
    .filter(Boolean)
    .map(n => n![0])
    .join('')
    .toUpperCase();

  const gradient = s.avatar_gradient ?? 'linear-gradient(135deg, #FCAE91, #F9A08B)';

  return (
    <div className={`s-item ${isActive ? 'active' : ''}`} onClick={onSelect}>
      <div
        className={`ava ${s.is_online ? 'ava-online' : ''}`}
        style={{ background: gradient, width: '40px', height: '40px', fontSize: '13px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}
      >
        {initials}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="s-name" style={{ fontSize: '13px', fontWeight: 700 }}>
          {s.name}{s.last_name ? ' ' + s.last_name[0] + '.' : ''}
        </div>
        {/* 🔥 ПРОСТО ВЫВОДИМ ГОТОВУЮ СТРОКУ ИЗ VIEWMODEL */}
        <div className="s-role" style={{ fontSize: '11px', marginTop: '1px' }}>
          {s._translatedRole}
        </div>
      </div>

      {s.is_online && (
        <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#A3C9A8', flexShrink: 0 }} />
      )}
    </div>
  );
}