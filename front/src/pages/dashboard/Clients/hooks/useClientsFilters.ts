import { useState, useMemo } from 'react';
import type { ClientData } from '../types';

function matchesCategory(cl: ClientData, cat: string): boolean {
  if (cat.startsWith('Все')) return true;
  if (cat.startsWith('С абонементом')) {
    const { active_subscription: sub } = cl;
    return sub != null && sub.total - sub.used > 0;
  }
  if (cat.startsWith('День рождения')) {
    const note = cl.notes?.[0]?.text ?? '';
    return cl.tags.some(t => t.toLowerCase().includes('день')) ||
           note.toLowerCase().includes('день рождения');
  }
  if (cat.startsWith('Неактив')) return cl.status === 'inactive';

  const raw = cat.replace(/\s*\(\d+\).*$/, '').trim();
  const labelToStatus: Record<string, string> = {
    'VIP': 'vip', 'Активные': 'active', 'Новые': 'new',
  };
  const target = labelToStatus[raw];
  return target ? cl.status === target : false;
}

export function useClientsFilters(data: ClientData[], categories: string[]) {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCat,   setActiveCat]   = useState('');

  const effectiveActiveCat = activeCat || categories[0] || '';

  const filteredClients = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return data.filter(cl => {
      if (!matchesCategory(cl, effectiveActiveCat)) return false;
      if (!q) return true;
      return (
        cl.name.toLowerCase().includes(q) ||
        (cl.last_name ?? '').toLowerCase().includes(q) ||
        (cl.phone ?? '').includes(q) ||
        (cl.email ?? '').toLowerCase().includes(q) ||
        cl.tags.some(tag => tag.toLowerCase().includes(q))
      );
    });
  }, [data, searchQuery, effectiveActiveCat]);

  return {
    filteredClients,
    searchQuery, setSearchQuery,
    activeCat: effectiveActiveCat,
    setActiveCat,
  };
}
