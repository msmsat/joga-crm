import type { Role } from '../../types';
import { ROLES } from '../../constants';
import styles from '../../Notifications.module.css';

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
            className={`${styles.roleBtn}${isActive ? ` ${styles.roleBtnActive}` : ''}`}
            style={{
              '--role-bg': role.bg,
              '--role-color': role.color,
              '--role-border': `${role.color}50`,
              '--role-shadow': `${role.color}30`,
              '--role-icon-bg': `${role.color}22`,
            } as React.CSSProperties}
          >
            <div className={`${styles.roleBtnIcon}${isActive ? ` ${styles.roleBtnIconActive}` : ''}`}>
              <role.IconComp />
            </div>
            <div style={{ flex: 1, overflow: 'hidden' }}>
              <div style={{ fontSize: '14px', fontWeight: 800, color: isActive ? '#1A1A1A' : '#666666', lineHeight: 1.2, whiteSpace: 'nowrap', textOverflow: 'ellipsis', transition: 'color 0.2s ease' }}>
                {role.label}
              </div>
              <div style={{ fontSize: '11px', color: isActive ? role.color : '#999999', marginTop: '3px', fontWeight: 600, transition: 'color 0.25s ease' }}>
                {cnt} активных
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
