import type { ReactElement } from 'react';
import { ResponsiveContainer } from 'recharts';

export interface ChartFrameProps {
  height?: number;
  children: ReactElement;
}

export function ChartFrame({ height = 240, children }: ChartFrameProps) {
  return (
    <div style={{ height, minWidth: 0, width: '100%', overflow: 'hidden' }}>
      <ResponsiveContainer width="100%" height="100%">{children}</ResponsiveContainer>
    </div>
  );
}
