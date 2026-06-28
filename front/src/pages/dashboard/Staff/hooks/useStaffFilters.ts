/**
 * @file useStaffFilters.ts
 * @description Тупой и чистый хук. Работает с уже переведенными данными (ViewModel).
 */
import { useState, useMemo } from 'react';

export type SortOption = 'default' | 'name_asc' | 'name_desc';

// Принимаем any[], так как сюда прилетает расширенный Employee из Staff.tsx
export function useStaffFilters(initialStaff: any[]) {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeGroup, setActiveGroup] = useState<string | 'ALL'>('ALL'); // Хранит сырой ключ (например, 'pilates')
  const [sortBy, setSortBy] = useState<SortOption>('default');

  const filteredAndSortedStaff = useMemo(() => {
    let result = initialStaff.filter(emp => {
      // 1. Фильтр по табам (группам) - сравниваем сырые ключи!
      const matchesGroup = activeGroup === 'ALL' || emp._resolvedGroupKey === activeGroup;

      // 2. Текстовый поиск
      const query = searchQuery.toLowerCase().trim();
      const fullName = [emp.name, emp.last_name].filter(Boolean).join(' ').toLowerCase();

      // 🔥 ИЩЕМ ПО УЖЕ ПЕРЕВЕДЕННЫМ ПОЛЯМ, которые мы собрали в Staff.tsx
      const matchesSearch = !query ||
        fullName.includes(query) ||
        (emp._translatedRole && emp._translatedRole.toLowerCase().includes(query)) ||
        (emp._translatedGroup && emp._translatedGroup.toLowerCase().includes(query)) ||
        (emp.email && emp.email.toLowerCase().includes(query)) ||
        (emp.phone && emp.phone.includes(query));

      return matchesGroup && matchesSearch;
    });

    // 3. Сортировка
    if (sortBy === 'name_asc') {
      result.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortBy === 'name_desc') {
      result.sort((a, b) => b.name.localeCompare(a.name));
    }

    return result;
  }, [initialStaff, searchQuery, activeGroup, sortBy]);

  return {
    staffList: filteredAndSortedStaff,
    searchQuery,
    activeGroup,
    sortBy,
    setSearchQuery,
    setActiveGroup,
    setSortBy,
    
    // Возвращаем список СЫРЫХ ключей для кнопок-табов (['ALL', 'pilates', 'management'])
    availableGroups: useMemo(() => {
      const seen = new Set<string>();
      const groups: string[] = [];
      initialStaff.forEach(emp => {
        if (emp._resolvedGroupKey && !seen.has(emp._resolvedGroupKey)) {
          seen.add(emp._resolvedGroupKey);
          groups.push(emp._resolvedGroupKey);
        }
      });
      return ['ALL', ...groups];
    }, [initialStaff])
  };
}