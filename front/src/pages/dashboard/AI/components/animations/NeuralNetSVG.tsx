interface NeuralNetSVGProps {
  thinking?: boolean;
  size?: number;
}

const NODES = [
  { x: 80, y: 160 },
  { x: 80, y: 260 },
  { x: 80, y: 360 },
  { x: 200, y: 100 },
  { x: 200, y: 200 },
  { x: 200, y: 300 },
  { x: 200, y: 400 },
  { x: 320, y: 160 },
  { x: 320, y: 260 },
  { x: 320, y: 360 },
  { x: 440, y: 100 },
  { x: 440, y: 200 },
  { x: 440, y: 300 },
  { x: 440, y: 400 },
  { x: 560, y: 230 },
  { x: 560, y: 330 },
];

const EDGES = [
  [0,3],[0,4],[0,5],[1,3],[1,4],[1,5],[1,6],[2,4],[2,5],[2,6],
  [3,7],[3,8],[4,7],[4,8],[4,9],[5,7],[5,8],[5,9],[6,8],[6,9],
  [7,10],[7,11],[8,10],[8,11],[8,12],[9,11],[9,12],[9,13],[10,14],[11,14],[11,15],[12,14],[12,15],[13,15],
];

export default function NeuralNetSVG({ thinking = false, size = 480 }: NeuralNetSVGProps) {
  const speed = thinking ? '0.8s' : '2.4s';
  const nodeColor = thinking ? '#F9A08B' : '#E0DDD9';
  const edgeColor = thinking ? 'rgba(249,160,139,0.25)' : 'rgba(26,26,26,0.06)';
  const glowColor = thinking ? 'rgba(249,160,139,0.5)' : 'rgba(249,160,139,0.15)';

  return (
    <svg
      width={size}
      height={size * 0.9}
      viewBox="0 0 640 480"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ transition: 'all 0.6s ease' }}
    >
      <defs>
        <style>{`
          @keyframes nn-pulse {
            0%, 100% { opacity: 0.3; r: 5; }
            50% { opacity: 1; r: 7; }
          }
          @keyframes nn-edge-flow {
            0% { stroke-dashoffset: 40; opacity: 0.2; }
            50% { opacity: 0.7; }
            100% { stroke-dashoffset: 0; opacity: 0.2; }
          }
          @keyframes nn-glow-pulse {
            0%, 100% { opacity: 0; transform: scale(0.8); }
            50% { opacity: 1; transform: scale(1.2); }
          }
        `}</style>
        <radialGradient id="nn-node-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={glowColor} />
          <stop offset="100%" stopColor="transparent" />
        </radialGradient>
      </defs>

      {EDGES.map(([a, b], i) => {
        const na = NODES[a], nb = NODES[b];
        return (
          <line
            key={i}
            x1={na.x} y1={na.y}
            x2={nb.x} y2={nb.y}
            stroke={edgeColor}
            strokeWidth="1.5"
            strokeDasharray="8 4"
            style={{
              animation: `nn-edge-flow ${speed} ease-in-out infinite`,
              animationDelay: `${(i * 0.07) % 1.5}s`,
              transition: 'stroke 0.6s ease',
            }}
          />
        );
      })}

      {NODES.map((n, i) => (
        <g key={i}>
          <circle
            cx={n.x} cy={n.y} r={18}
            fill="url(#nn-node-glow)"
            style={{
              animation: `nn-glow-pulse ${speed} ease-in-out infinite`,
              animationDelay: `${(i * 0.13) % 1.8}s`,
            }}
          />
          <circle
            cx={n.x} cy={n.y}
            fill={nodeColor}
            style={{
              animation: `nn-pulse ${speed} ease-in-out infinite`,
              animationDelay: `${(i * 0.13) % 1.8}s`,
              transition: 'fill 0.6s ease',
              r: '5',
            } as React.CSSProperties}
          />
        </g>
      ))}
    </svg>
  );
}
