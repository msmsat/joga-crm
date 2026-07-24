import type { LabelProps } from 'recharts';

// Нулевая колонка у Recharts не рисуется вообще (высота 0) — подписываем её "0",
// чтобы отсутствие данных не выглядело как дырка в оси.
export function ZeroLabel({ x, y, width, value }: LabelProps) {
  if (Number(value) !== 0) return null;
  const cx = Number(x ?? 0) + Number(width ?? 0) / 2;
  return (
    <text x={cx} y={Number(y ?? 0) - 4} textAnchor="middle" fontSize={11} fill="var(--text3)">
      0
    </text>
  );
}
