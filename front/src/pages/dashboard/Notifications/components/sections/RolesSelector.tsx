import type { Role } from '../../types';
import { ROLES } from '../../constants';

interface Props {
  activeRole: Role;
  switchRole: (role: Role) => void;
  countActive: (role: Role) => number;
}

export default function RolesSelector({ activeRole, switchRole, countActive }: Props) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
      {ROLES.map(role => {
        const cnt = countActive(role.key);
        const isActive = activeRole === role.key;
        return (
          <button
            key={role.key}
            onClick={() => switchRole(role.key)}
            style={{
              padding: '14px 16px', borderRadius: '16px',
              border: isActive ? `1.5px solid ${role.color}50` : '1.5px solid rgba(26,26,26,0.08)',
              background: isActive ? role.bg : '#FFFFFF', cursor: 'pointer',
              display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '12px',
              transition: 'all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1)',
              transform: isActive ? 'translateY(-2px)' : 'translateY(0)',
              boxShadow: isActive ? `0 12px 24px -8px ${role.color}30` : '0 2px 8px rgba(0,0,0,0.02)',
              fontFamily: "'Manrope', sans-serif", textAlign: 'left',
            }}
          >
            <div style={{
              width: '38px', height: '38px', borderRadius: '10px',
              background: isActive ? `${role.color}22` : 'rgba(26,26,26,0.04)',
              color: isActive ? role.color : '#999999',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'all 0.25s', flexShrink: 0,
            }}>
              <role.IconComp />
            </div>
            <div style={{ flex: 1, overflow: 'hidden' }}>
              <div style={{ fontSize: '14px', fontWeight: 800, color: isActive ? '#1A1A1A' : '#666666', lineHeight: 1.2, whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                {role.label}
              </div>
              <div style={{ fontSize: '11px', color: isActive ? role.color : '#999999', marginTop: '3px', fontWeight: 600 }}>
                {cnt} активных
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
