import { useTranslation } from 'react-i18next';
import { useRoleLabel } from '../../../../hooks/useBusinessTerms';
import type { Employee } from '../types';

interface Props {
  staff: Employee[];
  activeGroup: string;
  onGroupChange: (group: string, event: React.MouseEvent<HTMLButtonElement>) => void;
  dialogId?: string;
  isOpen?: boolean;
}

export function StaffRoleButtons({ staff, activeGroup, onGroupChange, dialogId, isOpen }: Props) {
  const { t } = useTranslation('staff');
  const roleLabel = useRoleLabel();
  return <div className="staff-picker-roles">
    {['ALL', 'owner', 'admin', 'trainer'].map(group => (
      <button key={group} type="button" className="staff-picker-role"
        aria-pressed={activeGroup === group}
        aria-haspopup={dialogId ? 'dialog' : undefined}
        aria-controls={dialogId}
        aria-expanded={dialogId ? !!isOpen && activeGroup === group : undefined}
        onClick={event => onGroupChange(group, event)}>
        <span>{group === 'ALL' ? t('toolbar.allGroup') : roleLabel(group)}</span>
        <span className="staff-picker-count">{group === 'ALL' ? staff.length : staff.filter(s => s.role === group).length}</span>
        {dialogId && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>}
      </button>
    ))}
  </div>;
}
