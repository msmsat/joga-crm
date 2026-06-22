import { useMemo } from 'react';
import type { Period } from '../types';

const MULTIPLIERS: Record<Period, number> = {
  day: 0.037, week: 0.19, month: 1, year: 12,
};

export function useReportData(period: Period) {
  return useMemo(() => {
    const multiplier = MULTIPLIERS[period];

    const fmtRevenue = (base: number): string => {
      const n = Math.round(base * multiplier);
      if (n >= 1000) return `₽${(n / 1000).toFixed(n >= 100000 ? 0 : 1)}M`.replace('.0', '');
      return `₽${n}K`;
    };

    return { multiplier, fmtRevenue };
  }, [period]);
}
