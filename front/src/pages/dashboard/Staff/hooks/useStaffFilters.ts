/**
 * @file useStaffFilters.ts
 * @description Кастомный хук для поиска, фильтрации и сортировки списка сотрудников
 */

import { useState, useMemo } from 'react';
import type { Employee } from '../types';

export type SortOption = 'default' | 'name_asc' | 'name_desc';

export function useStaffFilters(initialStaff: Employee[]) {
  // ─── СОСТОЯНИЯ ФИЛЬТРОВ ─────────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('');
  const [activeGroup, setActiveGroup] = useState<string | 'ALL'>('ALL');
  const [sortBy, setSortBy] = useState<SortOption>('default');

  // ─── ЛОГИКА ФИЛЬТРАЦИИ И СОРТИРОВКИ ─────────────────────────────────────────

  // Используем useMemo, чтобы пересчитывать массив только при изменении зависимостей,
  // а не при каждом рендере компонента (экономим ресурсы).
  const filteredAndSortedStaff = useMemo(() => {
    // 1. Нормализация групп
    // Так как в исходных данных group может быть null (наследование от предыдущего),
    // нам нужно явно присвоить каждому сотруднику его фактическую группу перед фильтрацией.
    let currentGroup = 'Без группы';
    const normalizedStaff = initialStaff.map(emp => {
      if (emp.group) {
        currentGroup = emp.group;
      }
      // Добавляем временное поле _resolvedGroup для внутренней фильтрации
      return { ...emp, _resolvedGroup: currentGroup };
    });

    // 2. Применение фильтров и поиска
    let result = normalizedStaff.filter(emp => {
      // Проверка по отделу (группе)
      const matchesGroup = activeGroup === 'ALL' || emp._resolvedGroup === activeGroup;
      
      // Проверка по поисковому запросу (ищем по имени, роли, email и телефону)
      const query = searchQuery.toLowerCase().trim();
      const matchesSearch = !query || 
        emp.name.toLowerCase().includes(query) ||
        emp.role.toLowerCase().includes(query) ||
        emp.email.toLowerCase().includes(query) ||
        emp.phone.includes(query);

      return matchesGroup && matchesSearch;
    });

    // 3. Применение сортировки
    if (sortBy === 'name_asc') {
      result.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortBy === 'name_desc') {
      result.sort((a, b) => b.name.localeCompare(a.name));
    }
    // Если 'default', оставляем исходный порядок из моков

    return result;
  }, [initialStaff, searchQuery, activeGroup, sortBy]);

  // ─── ВОЗВРАЩАЕМЫЙ ИНТЕРФЕЙС ХУКА ──────────────────────────────────────────
  return {
    // Отфильтрованные данные
    staffList: filteredAndSortedStaff,
    
    // Текущие значения стейтов
    searchQuery,
    activeGroup,
    sortBy,
    
    // Функции для изменения стейтов
    setSearchQuery,
    setActiveGroup,
    setSortBy,
    
    // Вспомогательная функция: получить уникальный список всех доступных групп
    // (полезно для рендера кнопок-табов фильтрации)
    availableGroups: useMemo(() => {
      const groups = new Set<string>();
      initialStaff.forEach(emp => { if (emp.group) groups.add(emp.group); });
      return ['ALL', ...Array.from(groups)];
    }, [initialStaff])
  };
}