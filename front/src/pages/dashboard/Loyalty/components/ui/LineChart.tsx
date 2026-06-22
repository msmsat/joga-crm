import { useState } from 'react';
import type { chartData as ChartDataType } from '../../constants';

interface Props {
  data: typeof ChartDataType;
  color: string;
  valueKey: 'revenue' | 'clients';
}

export default function LineChart({ data, color, valueKey }: Props) {
  const [hovered, setHovered] = useState<number | null>(null);
  const values = data.map(d => d[valueKey]);
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;

  const W = 1000;
  const H = 240;
  const padX = 40;

  const getSvgX = (i: number) => padX + (i / (values.length - 1)) * (W - padX * 2);
  const getSvgY = (v: number) => H - ((v - min) / range) * (H * 0.7) - (H * 0.15);
  const getPctX = (i: number) => (getSvgX(i) / W) * 100;

  const pts = values.map((v, i) => `${getSvgX(i)},${getSvgY(v)}`).join(' ');
  const areapts = `${getSvgX(0)},${H} ` + pts + ` ${getSvgX(values.length - 1)},${H}`;

  const formatValue = (v: number) =>
    valueKey === 'revenue' ? `₽${v.toLocaleString('ru-RU')}` : `${v} чел.`;

  return (
    <div style={{ position: 'relative', width: '100%', marginTop: '16px' }} onMouseLeave={() => setHovered(null)}>
      <div style={{ position: 'relative', height: '140px' }}>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: '100%', height: '100%', overflow: 'visible' }}>
          <defs>
            <linearGradient id={`grad-${valueKey}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.25" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          <polygon points={areapts} fill={`url(#grad-${valueKey})`} />
          <polyline points={pts} fill="none" stroke={color} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" style={{ filter: `drop-shadow(0 4px 8px ${color}40)` }} />
          {values.map((v, i) => {
            const cx = getSvgX(i);
            const cy = getSvgY(v);
            const isHov = hovered === i;
            return (
              <g key={i}>
                {isHov && <line x1={cx} y1={cy} x2={cx} y2={H} stroke={color} strokeWidth="2" strokeDasharray="6 6" opacity="0.4" />}
                <circle
                  cx={cx} cy={cy}
                  r={isHov ? 10 : 5}
                  fill="#FFFFFF"
                  stroke={color}
                  strokeWidth={isHov ? 4 : 3}
                  style={{ transition: 'all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)', transformOrigin: `${cx}px ${cy}px` }}
                />
              </g>
            );
          })}
        </svg>

        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '100%' }}>
          {values.map((_, i) => (
            <div
              key={i}
              onMouseEnter={() => setHovered(i)}
              style={{
                position: 'absolute',
                left: `${getPctX(i)}%`,
                top: 0,
                height: '100%',
                width: `${100 / Math.max(1, values.length - 1)}%`,
                transform: 'translateX(-50%)',
                cursor: 'pointer',
              }}
            />
          ))}
        </div>

        {hovered !== null && (
          <div style={{
            position: 'absolute',
            left: `${getPctX(hovered)}%`,
            top: `calc(${(getSvgY(values[hovered]) / H) * 100}% - 16px)`,
            transform: 'translate(-50%, -100%)',
            background: '#1A1A1A', color: '#FFFFFF',
            padding: '8px 14px', borderRadius: '10px',
            fontSize: '13px', fontWeight: 800, letterSpacing: '-0.3px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
            pointerEvents: 'none', zIndex: 10,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: "'Manrope', sans-serif", whiteSpace: 'nowrap',
          }}>
            {formatValue(values[hovered])}
            <div style={{ position: 'absolute', bottom: '-4px', left: '50%', transform: 'translateX(-50%) rotate(45deg)', width: '10px', height: '10px', background: '#1A1A1A', borderRadius: '2px' }} />
          </div>
        )}
      </div>

      <div style={{ position: 'relative', height: '16px', marginTop: '16px' }}>
        {data.map((d, i) => (
          <div key={i} style={{
            position: 'absolute',
            left: `${getPctX(i)}%`,
            transform: 'translateX(-50%)',
            fontSize: '11px', fontWeight: 700,
            color: hovered === i ? '#1A1A1A' : '#999999',
            textTransform: 'uppercase', letterSpacing: '0.6px',
            transition: 'color 0.2s', textAlign: 'center',
          }}>
            {d.month}
          </div>
        ))}
      </div>
    </div>
  );
}
