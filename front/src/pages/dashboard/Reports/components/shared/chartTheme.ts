export const AXIS_X = {
  tick: { fontSize: 11, fill: 'var(--text3)', fontWeight: 600 },
  axisLine: false, tickLine: false, dy: 6,
} as const;

export const TOOLTIP_STYLE = {
  borderRadius: '12px', border: '1px solid var(--border)',
  fontSize: '12px', background: 'var(--bg-card)',
  boxShadow: '0 8px 24px -4px rgba(26,26,26,0.12)', padding: '8px 12px',
} as const;

// Персиковая подсветка колонки вместо серого квадрата Recharts.
export const BAR_CURSOR = { fill: 'rgba(249,160,139,0.10)', radius: 8 } as const;
// Для area-графиков — тонкая пунктирная вертикаль.
export const LINE_CURSOR = { stroke: '#F9A08B', strokeWidth: 1, strokeDasharray: '4 4' } as const;

export const PEACH = '#F9A08B';
export const PEACH_LIGHT = '#FCAE91';
export const BLUE = '#4A80C4';
export const ROSE = '#D88C9A';

// Заливка нулевого слота — виден сам слот, но не как полноценная колонка.
export const ZERO_FILL = 'rgba(26,26,26,0.06)';
