import React from 'react';
import type { Employee } from '../types';
import { EmployeeCard } from './EmployeeCard';
import { StaffToolbar } from './StaffToolbar';

export interface StaffListProps {
  staffList: (Employee & { _resolvedGroup: string })[];
  activeStaffId: string;
  onSelect: (id: string) => void;
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
            Не найдено
          </div>
        ) : (
          staffList.map((employee, i) => (
            <React.Fragment key={employee.id}>
              {(i === 0 || staffList[i - 1]._resolvedGroup !== employee._resolvedGroup) && (
                <div className="role-sep">{employee._resolvedGroup}</div>
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
