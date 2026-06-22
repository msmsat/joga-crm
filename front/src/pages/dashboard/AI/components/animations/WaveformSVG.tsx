interface WaveformSVGProps {
  active?: boolean;
  color?: string;
  barCount?: number;
  height?: number;
  width?: number;
}

const HEIGHTS = [0.3, 0.6, 0.9, 0.7, 1.0, 0.6, 0.8, 0.4, 0.9, 0.5, 0.7, 1.0, 0.4, 0.6, 0.3];

export default function WaveformSVG({
  active = false,
  color = '#F9A08B',
  barCount = 15,
  height = 28,
  width = 60,
}: WaveformSVGProps) {
  const barWidth = 2.5;
  const gap = width / barCount;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} fill="none">
      <defs>
        <style>{`
          @keyframes wf-bar {
            0%, 100% { transform: scaleY(0.25); }
            50% { transform: scaleY(1); }
          }
        `}</style>
      </defs>
      {Array.from({ length: barCount }).map((_, i) => {
        const maxH = HEIGHTS[i % HEIGHTS.length] * height;
        const x = i * gap + gap / 2 - barWidth / 2;
        const delay = `${(i * 0.08).toFixed(2)}s`;
        const duration = `${0.7 + (i % 4) * 0.1}s`;
        return (
          <rect
            key={i}
            x={x}
            y={(height - maxH) / 2}
            width={barWidth}
            height={maxH}
            rx={barWidth / 2}
            fill={active ? color : 'rgba(26,26,26,0.12)'}
            style={{
              transformOrigin: `${x + barWidth / 2}px ${height / 2}px`,
              animation: active ? `wf-bar ${duration} ease-in-out ${delay} infinite` : 'none',
              transition: 'fill 0.3s ease',
            }}
          />
        );
      })}
    </svg>
  );
}
