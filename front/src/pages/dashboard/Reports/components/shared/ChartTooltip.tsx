import { useLayoutEffect, useRef } from 'react';
import { DefaultTooltipContent, Tooltip, usePlotArea } from 'recharts';
import type { TooltipContentProps, TooltipProps } from 'recharts';
import { TOOLTIP_STYLE } from './chartTheme';

/**
 * Окошко центрируется по курсору (translateY(-50%)), а у краёв графика упирается
 * и стоит на месте — вместо дефолтного recharts-переворота под/над курсором.
 */
function CenteredContent(props: TooltipContentProps) {
  const ref = useRef<HTMLDivElement>(null);
  const plot = usePlotArea();
  const y = props.coordinate?.y ?? 0;

  // Обёртка recharts стоит ровно на курсоре (offset.y = 0), поэтому clamp считаем от него.
  // Правим transform в layout-эффекте: высота окошка известна только после рендера.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !plot) return;
    const half = el.offsetHeight / 2;
    const shift = Math.min(Math.max(0, plot.y + half - y), plot.y + plot.height - half - y);
    el.style.transform = `translateY(calc(-50% + ${shift}px))`;
  });

  return (
    <div ref={ref} style={{ transform: 'translateY(-50%)' }}>
      <DefaultTooltipContent {...props} />
    </div>
  );
}

export function ChartTooltip(props: TooltipProps) {
  return (
    <Tooltip
      contentStyle={TOOLTIP_STYLE}
      isAnimationActive={false}
      allowEscapeViewBox={{ x: false, y: true }}
      offset={{ x: 10, y: 0 }}
      content={CenteredContent}
      {...props}
    />
  );
}
