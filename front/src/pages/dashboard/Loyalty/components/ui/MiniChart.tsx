interface Props {
  data: number[];
  color: string;
}

export default function MiniChart({ data, color }: Props) {
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const w = 80;
  const h = 32;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / range) * (h - 4) - 2}`).join(' ');

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.8" />
      {data.map((v, i) =>
        i === data.length - 1 ? (
          <circle key={i} cx={(i / (data.length - 1)) * w} cy={h - ((v - min) / range) * (h - 4) - 2} r="3" fill={color} />
        ) : null,
      )}
    </svg>
  );
}
