import { useState } from 'react';
import type { Period } from '../types';
import { PERIOD_LABELS } from '../constants';

const MULTIPLIERS: Record<Period, number> = {
  day: 0.037, week: 0.19, month: 1, year: 12,
};

export function useDateRange() {
  const [period, setPeriod] = useState<Period>('month');
  const label      = PERIOD_LABELS[period];
  const multiplier = MULTIPLIERS[period];
  return { period, setPeriod, label, multiplier };
}
