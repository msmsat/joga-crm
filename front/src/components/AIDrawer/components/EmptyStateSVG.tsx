export default function EmptyStateSVG() {
  return (
    <svg
      width="120"
      height="120"
      viewBox="0 0 120 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <style>{`
          @keyframes es-rotate-cw  { from { transform: rotate(0deg); }   to { transform: rotate(360deg); } }
          @keyframes es-rotate-ccw { from { transform: rotate(0deg); }   to { transform: rotate(-360deg); } }
          @keyframes es-pulse       {
            0%, 100% { transform: scale(0.95); opacity: 0.7; }
            50%       { transform: scale(1.05); opacity: 1; }
          }
          @keyframes es-glow-pulse  {
            0%, 100% { opacity: 0.4; transform: scale(0.85); }
            50%       { opacity: 0.9; transform: scale(1.15); }
          }
          .es-outer { transform-origin: 60px 60px; animation: es-rotate-cw  20s linear infinite; }
          .es-mid   { transform-origin: 60px 60px; animation: es-rotate-ccw 15s linear infinite; }
          .es-inner { transform-origin: 60px 60px; animation: es-pulse 3s ease-in-out infinite; }
          .es-glow  { transform-origin: 60px 60px; animation: es-glow-pulse 3s ease-in-out infinite; }
        `}</style>
        <radialGradient id="es-center-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%"   stopColor="#F9A08B" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#F9A08B" stopOpacity="0" />
        </radialGradient>
        <filter id="es-drop-outer">
          <feDropShadow dx="0" dy="0" stdDeviation="2" floodColor="#F9A08B" floodOpacity="0.15" />
        </filter>
        <filter id="es-drop-mid">
          <feDropShadow dx="0" dy="0" stdDeviation="1.5" floodColor="#F9A08B" floodOpacity="0.10" />
        </filter>
        <filter id="es-drop-center">
          <feDropShadow dx="0" dy="0" stdDeviation="4" floodColor="#F9A08B" floodOpacity="0.6" />
        </filter>
      </defs>

      {/* Glow background */}
      <circle className="es-glow" cx="60" cy="60" r="22" fill="url(#es-center-glow)" />

      {/* Outer dashed ring */}
      <circle
        className="es-outer"
        cx="60" cy="60" r="52"
        stroke="#F9A08B"
        strokeWidth="1"
        strokeOpacity="0.25"
        strokeDasharray="6 5"
        filter="url(#es-drop-outer)"
      />

      {/* Middle solid ring */}
      <circle
        className="es-mid"
        cx="60" cy="60" r="38"
        stroke="#F9A08B"
        strokeWidth="1.2"
        strokeOpacity="0.35"
        fill="none"
        filter="url(#es-drop-mid)"
      />

      {/* Inner pulsing ring */}
      <circle
        className="es-inner"
        cx="60" cy="60" r="24"
        stroke="#F9A08B"
        strokeWidth="1.5"
        strokeOpacity="0.5"
        fill="rgba(249,160,139,0.05)"
      />

      {/* Center spark */}
      <circle cx="60" cy="60" r="6" fill="#F9A08B" filter="url(#es-drop-center)" />
      <path
        d="M60 56.5l.955 2.907a1 1 0 00.638.638L64.5 61l-2.907.955a1 1 0 00-.638.638L60 65.5l-.955-2.907a1 1 0 00-.638-.638L55.5 61l2.907-.955a1 1 0 00.638-.638L60 56.5z"
        fill="white"
        fillOpacity="0.9"
      />
    </svg>
  );
}
