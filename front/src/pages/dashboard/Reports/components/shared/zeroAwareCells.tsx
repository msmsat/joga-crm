import { Cell } from 'recharts';
import { ZERO_FILL } from './chartTheme';

// Приглушённая заливка для нулевых колонок вместо основного цвета серии —
// слот виден, но понятно, что данных в нём нет.
export function zeroAwareCells<T extends Record<string, unknown>>(data: T[], key: keyof T, fill: string) {
  return data.map((d, i) => (
    <Cell key={i} fill={Number(d[key]) ? fill : ZERO_FILL} />
  ));
}
