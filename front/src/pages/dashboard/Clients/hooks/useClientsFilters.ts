import { useState, useMemo } from 'react';
import type { ClientData } from '../types';
import { CATEGORIES } from '../constants';

function matchesCategory(cl: ClientData, cat: string): boolean {
  if (cat.startsWith('Все')) return true;
  if (cat.startsWith('С абонементом')) return cl.ab > 0;
  if (cat.startsWith('День рождения')) {
    return cl.tags.some(t => t.toLowerCase().includes('день')) ||
           cl.note.toLowerCase().includes('день рождения');
  }
  if (cat.startsWith('Неактив')) return cl.bl === 'Неактивный';

  const raw = cat.replace(/\s*\(\d+\).*$/, '').trim();
  const labelMap: Record<string, string> = {
    'VIP':      'VIP',
    'Активные': 'Активный',
    'Новые':    'Новый',
  };
  const target = labelMap[raw] ?? raw;
  return cl.bl === target;
}

export function useClientsFilters(data: ClientData[]) {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCat,   setActiveCat]   = useState(CATEGORIES[0]);

  const filteredClients = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return data.filter(cl => {
      if (!matchesCategory(cl, activeCat)) return false;
      if (!q) return true;
      return (
        cl.n.toLowerCase().includes(q) ||
        cl.phone.includes(q) ||
        cl.email.toLowerCase().includes(q) ||
        cl.tags.some(tag => tag.toLowerCase().includes(q))
      );
    });
  }, [data, searchQuery, activeCat]);

  return { filteredClients, searchQuery, setSearchQuery, activeCat, setActiveCat };
}
