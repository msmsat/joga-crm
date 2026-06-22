import { useState } from 'react';
import type { MetricConfig } from '../types';
import { METRICS, chartData } from '../constants';

export function useDashboardChart() {
  const [period, setPeriod] = useState<'week' | 'month' | 'year'>('week');
  const [activeMetric, setActiveMetric] = useState<string>('revenue');

  const currentPeriodData = chartData[period];
  const { labels } = currentPeriodData;
  const vals = currentPeriodData[activeMetric as keyof typeof currentPeriodData] as number[];
  const activeConfig: MetricConfig = METRICS.find(m => m.id === activeMetric)!;

  const periodLabel =
    period === 'week' ? 'по неделям' : period === 'month' ? 'по месяцам' : 'по годам';
  const periodSubLabel =
    period === 'week' ? 'Последние 8 недель' : period === 'month' ? 'Последние 8 месяцев' : 'Последние 8 лет';

  return { period, setPeriod, activeMetric, setActiveMetric, labels, vals, activeConfig, periodLabel, periodSubLabel };
}
