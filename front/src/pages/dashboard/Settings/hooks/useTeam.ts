import { useState } from "react";
import { INITIAL_TEAM_DATA, INITIAL_PERMISSIONS_MATRIX } from "../constants";
import type { TeamMember } from "../types";
import { staffApi } from "../../../../api/staff/staff.api";
import { ApiError } from "../../../../api/client";

export function useTeam(triggerToast: (msg: string) => void, triggerSave: (key: string, msg: string) => void) {
  const [teamData, setTeamData] = useState<TeamMember[]>(INITIAL_TEAM_DATA);
  const [isAddStaffOpen, setIsAddStaffOpen] = useState(false);
  const [isEditStaffOpen, setIsEditStaffOpen] = useState(false);
  const [activeEditStaff, setActiveEditStaff] = useState<any>(null);
  const [expandedRole, setExpandedRole] = useState<string | null>(null);
  const [permissionsMatrix, setPermissionsMatrix] = useState<Record<string, Record<string, boolean>>>(INITIAL_PERMISSIONS_MATRIX);

  const handlePermissionToggle = (role: string, permissionKey: string) => {
    if (role === "admin") return;
    setPermissionsMatrix(prev => ({
      ...prev, [role]: { ...prev[role], [permissionKey]: !prev[role][permissionKey] }
    }));
  };

  const handleAddStaffSuccess = async (data: any) => {
    try {
      const result = await staffApi.create({
        name: data.name,
        last_name: data.last_name || undefined,
        email: data.email,
        phone: data.phone || undefined,
        password: data.password,
        role: data.role,
        salary: data.salary ? Number(data.salary) : undefined,
        rate_type: data.rate_type || undefined,
      });
      setTeamData(prev => [...prev, {
        id: result.staff.id,
        name: result.staff.name,
        role: result.staff.role,
        email: result.staff.email,
        status: "active" as const,
      }]);
      triggerToast(`Сотрудник ${data.name.split(' ')[0]} добавлен`);
    } catch (err) {
      triggerToast(err instanceof ApiError ? err.message : "Не удалось добавить сотрудника");
    }
  };

  const handleEditStaffSave = (updatedData: any) => {
    setTeamData(prev => prev.map(m => m.id === activeEditStaff.id ? { ...m, ...updatedData } : m));
    triggerToast(`Профиль "${updatedData.name || activeEditStaff.name}" сохранен`);
  };

  const handleEditStaffDelete = () => {
    setTeamData(prev => prev.filter(m => m.id !== activeEditStaff.id));
    triggerToast("Сотрудник успешно удален");
  };

  return {
    teamData,
    setTeamData,
    isAddStaffOpen,
    setIsAddStaffOpen,
    isEditStaffOpen,
    setIsEditStaffOpen,
    activeEditStaff,
    setActiveEditStaff,
    expandedRole,
    setExpandedRole,
    permissionsMatrix,
    handlePermissionToggle,
    handleAddStaffSuccess,
    handleEditStaffSave,
    handleEditStaffDelete,
    triggerSave,
  };
}
