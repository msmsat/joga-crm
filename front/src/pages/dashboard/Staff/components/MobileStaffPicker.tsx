import { useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { StaffListProps } from './StaffList';
import { StaffRoleButtons } from './StaffRoleButtons';
import { StaffPickerDialog } from './StaffPickerDialog';

export function MobileStaffPicker(props: StaffListProps) {
  const { t } = useTranslation('staff');
  const [openButton, setOpenButton] = useState<string | null>(null);
  const anchorRef = useRef<HTMLElement>(null);
  const isOpen = openButton !== null;
  const dialogId = useId();
  const openGroup = (group: string, event: React.MouseEvent<HTMLButtonElement>, buttonKey = group) => {
    if (isOpen && anchorRef.current === event.currentTarget) { setOpenButton(null); return; }
    anchorRef.current = event.currentTarget;
    props.onSearch('');
    props.onGroupChange(group);
    setOpenButton(buttonKey);
  };
  const openSearch = (input: HTMLInputElement) => {
    anchorRef.current = input;
    props.onGroupChange('ALL');
    setOpenButton('search');
  };
  return <div className="staff-picker-mobile">
    <div className="staff-picker-launcher">
      <div className="staff-picker-search-field">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg>
        <input type="search" role="combobox" aria-autocomplete="list" className="staff-picker-main-search"
          placeholder={t('toolbar.employeePlaceholder')} aria-label={t('toolbar.employeePlaceholder')}
          aria-haspopup="dialog" aria-expanded={openButton === 'search'} aria-controls={dialogId}
          value={props.searchQuery} onClick={event => openSearch(event.currentTarget)}
          onChange={event => { openSearch(event.currentTarget); props.onSearch(event.currentTarget.value); }}
          onKeyDown={event => { if (event.key === 'ArrowDown') { event.preventDefault(); openSearch(event.currentTarget); } }}/>
      </div>
      <button type="button" className="staff-picker-add" aria-label={t('toolbar.addEmployee')} onClick={props.onAddClick}>+</button>
    </div>
    <StaffRoleButtons staff={props.allStaff} activeGroup={props.activeGroup} onGroupChange={openGroup} dialogId={dialogId} isOpen={isOpen && openButton !== 'search'}/>
    <p className="staff-picker-hint">{t('toolbar.mobileHint')}</p>
    {isOpen && <StaffPickerDialog key={openButton} {...props} dialogId={dialogId} anchorRef={anchorRef} searchAtAnchor={openButton === 'search'} onClose={() => setOpenButton(null)}
      onSelect={id => { props.onSelect(id); props.onSearch(''); setOpenButton(null); }}/>}
  </div>;
}
