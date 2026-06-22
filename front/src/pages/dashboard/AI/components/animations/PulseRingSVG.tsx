interface PulseRingSVGProps {
  active?: boolean;
  size?: number;
}

export default function PulseRingSVG({ active = false, size = 20 }: PulseRingSVGProps) {
  const color = active ? '#A3C9A8' : '#C7C7C7';
  const r = size / 2;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} fill="none" style={{ flexShrink: 0 }}>
      <defs>
        <style>{`
          @keyframes pr-ring1 {
            0% { r: ${r * 0.28}px; opacity: 0.8; }
            100% { r: ${r * 0.9}px; opacity: 0; }
          }
          @keyframes pr-ring2 {
            0% { r: ${r * 0.28}px; opacity: 0.5; }
            100% { r: ${r * 0.9}px; opacity: 0; }
          }
        `}</style>
      </defs>
      {active && (
        <>
          <circle
            cx={r} cy={r}
            fill={color}
            style={{
              animation: 'pr-ring1 1.6s ease-out infinite',
              opacity: 0,
            }}
          />
          <circle
            cx={r} cy={r}
            fill={color}
            style={{
              animation: 'pr-ring2 1.6s ease-out 0.5s infinite',
              opacity: 0,
            }}
          />
        </>
      )}
      <circle cx={r} cy={r} r={r * 0.28} fill={color} />
    </svg>
  );
}
