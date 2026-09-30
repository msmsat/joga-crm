import { useEffect, useRef, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { usePopoverPosition } from '../../../../components/ui/popoverPosition';
import { EmployeeCard } from './EmployeeCard';
import type { StaffListProps } from './StaffList';

interface Props extends StaffListProps {
  dialogId: string;
  anchorRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  searchAtAnchor?: boolean;
}

/** A non-modal employee list anchored to the button that opened it. */
export function StaffPickerDialog(props: Props) {
  const { t } = useTranslation(['staff', 'common']);
  const panelRef = useRef<HTMLDivElement>(null);
  const focused = useRef(false);
  const { anchorRef, onClose, searchAtAnchor } = props;
  const placement = usePopoverPosition(true, anchorRef, panelRef, 'bottom', onClose);

  useEffect(() => {
    const trigger = anchorRef.current;
    return () => { if (trigger?.isConnected && !searchAtAnchor) trigger.focus(); };
  }, [anchorRef, searchAtAnchor]);

  useEffect(() => {
    if (placement && !focused.current) {
      if (searchAtAnchor) anchorRef.current?.focus();
      else panelRef.current?.querySelector<HTMLButtonElement>('[data-picker-close]')?.focus();
      focused.current = true;
    }
  }, [placement, anchorRef, searchAtAnchor]);

  useEffect(() => {
    const onOutside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!panelRef.current?.contains(target) && !anchorRef.current?.contains(target)) onClose();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.stopImmediatePropagation(); onClose(); }
    };
    document.addEventListener('pointerdown', onOutside);
    window.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('pointerdown', onOutside);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [anchorRef, onClose]);

  return createPortal(<div ref={panelRef} id={props.dialogId} role="dialog"
    aria-labelledby={`${props.dialogId}-title`} className="staff-picker-popover"
    data-side={placement?.side ?? 'bottom'}
    style={{ top: placement?.top ?? 0, left: placement?.left ?? 0,
      visibility: placement ? 'visible' : 'hidden',
      ['--staff-picker-arrow' as string]: `${placement?.arrowOffset ?? 20}px` }}>
    <div className="staff-picker-heading">
      <h2 id={`${props.dialogId}-title`}>{t('staff:toolbar.chooseStaff')}</h2>
      <button type="button" data-picker-close className="staff-picker-close" aria-label={t('common:buttons.close')} onClick={onClose}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m6 6 12 12M6 18 18 6"/></svg>
      </button>
    </div>
    {!searchAtAnchor && <input type="search" className="staff-picker-search" aria-label={t('staff:toolbar.searchPlaceholder')}
      placeholder={t('staff:toolbar.searchPlaceholder')} value={props.searchQuery} onChange={e => props.onSearch(e.target.value)}/> }
    <div className="staff-picker-list ms-scroll">
      {props.isLoading ? <p className="staff-picker-empty">{t('common:status.loading')}</p>
        : props.staffList.length === 0 ? <p className="staff-picker-empty">{t('common:status.notFound')}</p>
        : props.staffList.map(employee => <EmployeeCard key={employee.id} employee={employee}
          isActive={props.activeStaffId === employee.id} onSelect={() => { if (searchAtAnchor) anchorRef.current?.blur(); props.onSelect(employee.id); }}
          onResendInvite={() => props.onResendInvite(employee.id)} onCancelInvite={() => props.onCancelInvite(employee.id)}
          isResending={props.resendingId === employee.id}/>)}
    </div>
  </div>, document.body);
}
