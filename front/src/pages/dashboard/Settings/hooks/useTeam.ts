import { useState } from "react";
import { INITIAL_TEAM_DATA, INITIAL_PERMISSIONS_MATRIX } from "../constants";
import type { TeamMember } from "../types";

export function useTeam(triggerToast: (msg: string) => void, triggerSave: (key: string, msg: string) => void) {
  const [teamData, setTeamData] = useState<TeamMember[]>(INITIAL_TEAM_DATA);
  const [isAddStaffOpen, setIsAddStaffOpen] = useState(false);
  const [isEditStaffOpen, setIsEditStaffOpen] = useState(false);
  const [activeEditStaff, setActiveEditStaff] = useState<any>(null);
  const [expandedRole, setExpandedRole] = useState<string | null>(null);
  const [permissionsMatrix, setPermissionsMatrix] = useState<Record<string, Record<string, boolean>>>(INITIAL_PERMISSIONS_MATRIX);

  const handlePermissionToggle = (role: string, permissionKey: string) => {
    if (role === "Владелец") return;
    setPermissionsMatrix(prev => ({
      ...prev, [role]: { ...prev[role], [permissionKey]: !prev[role][permissionKey] }
    }));
  };

  const handleAddStaffSuccess = (data: any) => {
    setTeamData(prev => [...prev, {
      id: Date.now().toString(),
      name: data.name || "Новый сотрудник",
      role: data.role || "Сотрудник",
      email: data.email || "email@studio.ru",
      status: "active" as const,
    }]);
    triggerToast(`Сотрудник ${data.name ? data.name.split(' ')[0] : ''} добавлен 🎉`);
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
