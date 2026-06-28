import React from 'react';
import { useTranslation } from 'react-i18next';
import type { Employee } from '../types';
import { EmployeeCard } from './EmployeeCard';
import { StaffToolbar } from './StaffToolbar';

export interface StaffListProps {
  // 🔥 Обновили интерфейс под нашу ViewModel
  staffList: (Employee & { _resolvedGroupKey: string; _translatedGroup: string; _translatedRole: string; })[];
  activeStaffId: number | null;
  onSelect: (id: number) => void;
  searchQuery: string;
  onSearch: (query: string) => void;
  activeGroup: string;
  onGroupChange: (group: string) => void;
  availableGroups: string[];
  onAddClick: () => void;
}

export function StaffList({
  staffList,
  activeStaffId,
  onSelect,
  searchQuery,
  onSearch,
  activeGroup,
  onGroupChange,
  availableGroups,
  onAddClick,
}: StaffListProps) {
  const { t } = useTranslation('common');
  return (
    <div className="staff-list-panel">
      <StaffToolbar
        count={staffList.length}
        searchQuery={searchQuery}
        onSearch={onSearch}
        activeGroup={activeGroup}
        onGroupChange={onGroupChange}
        availableGroups={availableGroups}
        onAddClick={onAddClick}
      />

      <div className="staff-list">
        {staffList.length === 0 ? (
          <div style={{ padding: '24px 12px', textAlign: 'center', fontSize: '11px', color: 'var(--text3)' }}>
            {t('status.notFound')}
          </div>
        ) : (
          staffList.map((employee, i) => (
            <React.Fragment key={employee.id}>
              {/* 🔥 Сравниваем по сырому КЛЮЧУ, а на экран выводим ПЕРЕВОД */}
              {(i === 0 || staffList[i - 1]._resolvedGroupKey !== employee._resolvedGroupKey) && (
                <div className="role-sep">{employee._translatedGroup}</div> 
              )}
              <EmployeeCard
                employee={employee}
                isActive={activeStaffId === employee.id}
                onSelect={() => onSelect(employee.id)}
              />
            </React.Fragment>
          ))
        )}
      </div>
    </div>
  );
}