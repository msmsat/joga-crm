export default function ThinkingStateSVG() {
  const rings = [
    { delay: '0s',    duration: '2.4s', opacity: 0.55 },
    { delay: '0.6s',  duration: '2.4s', opacity: 0.40 },
    { delay: '1.2s',  duration: '2.4s', opacity: 0.28 },
    { delay: '1.8s',  duration: '2.4s', opacity: 0.15 },
  ];

  return (
    <svg
      width="44"
      height="44"
      viewBox="0 0 44 44"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <style>{`
          @keyframes ts-ring {
            0%   { r: 8px;  opacity: var(--op); }
            100% { r: 20px; opacity: 0; }
          }
          @keyframes ts-center-pulse {
            0%, 100% { transform: scale(0.9); }
            50%       { transform: scale(1.1); }
          }
          .ts-center { transform-origin: 22px 22px; animation: ts-center-pulse 1.6s ease-in-out infinite; }
        `}</style>
        <filter id="ts-glow">
          <feDropShadow dx="0" dy="0" stdDeviation="3" floodColor="#F9A08B" floodOpacity="0.7" />
        </filter>
      </defs>

      {rings.map((ring, i) => (
        <circle
          key={i}
          cx="22"
          cy="22"
          fill="#F9A08B"
          style={{
            animation: `ts-ring ${ring.duration} ease-out ${ring.delay} infinite`,
            opacity: ring.opacity,
            ['--op' as string]: ring.opacity,
          }}
        />
      ))}

      {/* Center core */}
      <circle className="ts-center" cx="22" cy="22" r="7" fill="#F9A08B" filter="url(#ts-glow)" />
      <path
        d="M22 19.5l.637 1.938a.667.667 0 00.425.425L25 22.5l-1.938.637a.667.667 0 00-.425.425L22 25.5l-.637-1.938a.667.667 0 00-.425-.425L19 22.5l1.938-.637a.667.667 0 00.425-.425L22 19.5z"
        fill="white"
        fillOpacity="0.9"
      />
    </svg>
  );
}
