interface Segment { pct: number; color: string; label: string; }

export function DonutIllustration({ total, segments, centerLabel }: { total: number; segments: Segment[]; centerLabel: string }) {
  const r = 46, cx = 60, cy = 60;
  const circ = 2 * Math.PI * r;
  let offset = 0;

  return (
    <svg width="120" height="120" viewBox="0 0 120 120" style={{ filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.06))' }}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(26,26,26,0.05)" strokeWidth="12" />
      <g>
        <animateTransform
          attributeName="transform" type="rotate"
          from="0 60 60" to="360 60 60"
          dur="25s" repeatCount="indefinite"
        />
        {segments.map((seg, i) => {
          const dash = seg.pct * circ;
          const gap = circ - dash;
          const el = (
            <circle key={i} cx={cx} cy={cy} r={r}
              fill="none" stroke={seg.color} strokeWidth="12"
              strokeDasharray={`${dash} ${gap}`}
              strokeDashoffset={-offset * circ}
              strokeLinecap="round"
              transform={`rotate(-90 ${cx} ${cy})`}
              style={{ opacity: 0.9 }}
            />
          );
          offset += seg.pct;
          return el;
        })}
      </g>
      <circle cx={cx} cy={cy} r={32} fill="var(--card)" />
      <text x={cx} y={cy - 6} textAnchor="middle" style={{ fontSize: '11px', fontWeight: 800, fill: 'var(--text)', fontFamily: 'var(--font)', letterSpacing: '-0.5px' }}>
        {total >= 1000000 ? `${(total / 1000000).toFixed(1)}M` : `${(total / 1000).toFixed(0)}K`}
      </text>
      <text x={cx} y={cy + 9} textAnchor="middle" style={{ fontSize: '8px', fill: 'var(--text3)', fontFamily: 'var(--font)', fontWeight: 600 }}>
        {centerLabel}
      </text>
    </svg>
  );
}
