import type { ReactElement } from 'react';
import { ResponsiveContainer } from 'recharts';

export interface ChartFrameProps {
  height?: number;
  children: ReactElement;
}

export function ChartFrame({ height = 240, children }: ChartFrameProps) {
  return (
    // height числом, а не '100%': recharts до первого срабатывания ResizeObserver
    // считает обе стороны равными -1 и на каждом монтировании графика сыпал в
    // консоль «The width(-1) and height(-1) of chart should be greater than 0».
    // С фиксированной высотой одна сторона положительна сразу — предупреждения нет,
    // ширину по-прежнему меряет контейнер.
    <div style={{ height, minWidth: 0, width: '100%', overflow: 'hidden' }}>
      <ResponsiveContainer width="100%" height={height}>{children}</ResponsiveContainer>
    </div>
  );
}
