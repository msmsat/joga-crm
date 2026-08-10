import { motion } from "framer-motion";
import type { Variants } from "framer-motion";
import { EASE } from "./tokens";

/* Свои line-art иллюстрации: только inline SVG, без внешних ассетов и
   зависимостей. Контур — белый на 22%, акцентные детали — персиковые.
   Анимация входа: обводка «рисуется» (pathLength), заливки «выщёлкивают». */

const LINE = "rgba(255,255,255,0.22)";
const LINE_SOFT = "rgba(255,255,255,0.12)";

const draw: Variants = {
  hidden: { opacity: 0, pathLength: 0 },
  show: (i: number = 0) => ({
    opacity: 1,
    pathLength: 1,
    transition: {
      pathLength: { duration: 1.1, delay: 0.2 + i * 0.09, ease: EASE },
      opacity: { duration: 0.2, delay: 0.2 + i * 0.09 },
    },
  }),
};

const pop: Variants = {
  hidden: { opacity: 0, scale: 0.75 },
  show: (i: number = 0) => ({
    opacity: 1,
    scale: 1,
    transition: { delay: 0.75 + i * 0.05, type: "spring", stiffness: 240, damping: 18 },
  }),
};

/**
 * Сетка-подложка для чёрных секций. id внутри defs повторяются, если
 * компонент отрисован дважды — это безошибочно: определения идентичны,
 * браузер берёт первое и рисует то же самое.
 */
export function GridBg({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden className={`pointer-events-none absolute inset-0 h-full w-full ${className}`}>
      <defs>
        <pattern id="lpGrid" width="72" height="72" patternUnits="userSpaceOnUse">
          <path d="M72 0H0v72" fill="none" stroke="rgba(255,255,255,0.045)" strokeWidth="1" />
        </pattern>
        <radialGradient id="lpGridFade" cx="50%" cy="38%" r="62%">
          <stop offset="0%" stopColor="#fff" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <mask id="lpGridMask">
          <rect width="100%" height="100%" fill="url(#lpGridFade)" />
        </mask>
      </defs>
      <rect width="100%" height="100%" fill="url(#lpGrid)" mask="url(#lpGridMask)" />
    </svg>
  );
}

/** Герой: контурная «панель расписания» с парящими карточками записи. */
export function HeroArt() {
  const bars = [40, 64, 48, 92, 56, 74, 44];

  return (
    <motion.svg
      viewBox="0 0 460 440"
      initial="hidden"
      animate="show"
      className="h-auto w-full overflow-visible"
      aria-hidden
    >
      <defs>
        <radialGradient id="lpHeroGlow" cx="50%" cy="46%" r="52%">
          <stop offset="0%" stopColor="#F9A08B" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#F9A08B" stopOpacity="0" />
        </radialGradient>
      </defs>
      <ellipse cx="230" cy="205" rx="215" ry="200" fill="url(#lpHeroGlow)" />

      {/* медленное персиковое кольцо вокруг композиции */}
      <motion.circle
        cx="230" cy="205" r="198"
        fill="none" stroke="#F9A08B" strokeOpacity="0.22"
        strokeWidth="1" strokeDasharray="2 12"
        style={{ transformOrigin: "230px 205px" }}
        animate={{ rotate: 360 }}
        transition={{ duration: 90, ease: "linear", repeat: Infinity }}
      />

      {/* корпус панели */}
      <motion.rect variants={draw} custom={0} x="46" y="52" width="330" height="300" rx="22"
        fill="none" stroke={LINE} strokeWidth="1.5" />
      <motion.line variants={draw} custom={1} x1="46" y1="96" x2="376" y2="96"
        stroke={LINE} strokeWidth="1.5" />
      <motion.line variants={draw} custom={2} x1="104" y1="96" x2="104" y2="352"
        stroke={LINE_SOFT} strokeWidth="1.5" />

      {/* точки заголовка окна */}
      {[0, 1, 2].map((i) => (
        <motion.circle key={i} variants={pop} custom={i}
          cx={68 + i * 15} cy="74" r="3.5"
          fill={i === 0 ? "#F9A08B" : "rgba(255,255,255,0.22)"} />
      ))}

      {/* боковая рельса разделов */}
      {[0, 1, 2, 3, 4].map((i) => (
        <motion.rect key={i} variants={pop} custom={i + 3}
          x="63" y={118 + i * 38} width="26" height="26" rx="8"
          fill={i === 0 ? "#F9A08B" : "rgba(255,255,255,0.07)"} />
      ))}

      {/* заголовок раздела */}
      <motion.rect variants={pop} custom={8} x="122" y="116" width="112" height="11" rx="5.5" fill="rgba(255,255,255,0.26)" />
      <motion.rect variants={pop} custom={9} x="122" y="135" width="72" height="7" rx="3.5" fill="rgba(255,255,255,0.12)" />

      {/* три плитки-метрики */}
      {[0, 1, 2].map((i) => (
        <g key={i}>
          <motion.rect variants={draw} custom={3 + i}
            x={122 + i * 78} y="160" width="70" height="54" rx="12"
            fill="none" stroke={LINE_SOFT} strokeWidth="1.5" />
          <motion.rect variants={pop} custom={10 + i}
            x={134 + i * 78} y="174" width="34" height="9" rx="4.5"
            fill={i === 0 ? "#F9A08B" : "rgba(255,255,255,0.3)"} />
          <motion.rect variants={pop} custom={11 + i}
            x={134 + i * 78} y="191" width="46" height="6" rx="3" fill="rgba(255,255,255,0.12)" />
        </g>
      ))}

      {/* карточка графика загрузки */}
      <motion.rect variants={draw} custom={6} x="122" y="230" width="226" height="104" rx="14"
        fill="none" stroke={LINE_SOFT} strokeWidth="1.5" />
      {bars.map((h, i) => (
        <motion.rect key={i} variants={pop} custom={14 + i}
          x={140 + i * 29} y={316 - h * 0.62} width="19" height={h * 0.62} rx="5"
          style={{ transformOrigin: `${149 + i * 29}px 316px` }}
          fill={i === 3 ? "#F9A08B" : "rgba(255,255,255,0.14)"} />
      ))}

      {/* парящая карточка «новая запись» */}
      <motion.g
        variants={pop} custom={22}
        animate={{ y: [0, -9, 0] }}
        transition={{ duration: 6, ease: "easeInOut", repeat: Infinity, delay: 1.2 }}
      >
        <rect x="300" y="24" width="146" height="70" rx="16" fill="#161616" stroke="#F9A08B" strokeOpacity="0.45" strokeWidth="1.5" />
        <circle cx="326" cy="59" r="13" fill="#F9A08B" />
        <path d="M321 59.5 324.5 63 331 55.5" fill="none" stroke="#101010" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <rect x="348" y="48" width="76" height="8" rx="4" fill="rgba(255,255,255,0.28)" />
        <rect x="348" y="63" width="50" height="6" rx="3" fill="rgba(255,255,255,0.14)" />
      </motion.g>

      {/* парящая карточка клиента */}
      <motion.g
        variants={pop} custom={24}
        animate={{ y: [0, 8, 0] }}
        transition={{ duration: 7, ease: "easeInOut", repeat: Infinity, delay: 1.6 }}
      >
        <rect x="10" y="298" width="158" height="68" rx="16" fill="#161616" stroke={LINE} strokeWidth="1.5" />
        <circle cx="36" cy="332" r="14" fill="none" stroke="#F9A08B" strokeWidth="1.5" />
        <circle cx="36" cy="328" r="4.5" fill="none" stroke="#F9A08B" strokeWidth="1.5" />
        <path d="M28 340a9 9 0 0 1 16 0" fill="none" stroke="#F9A08B" strokeWidth="1.5" strokeLinecap="round" />
        <rect x="60" y="322" width="86" height="8" rx="4" fill="rgba(255,255,255,0.26)" />
        <rect x="60" y="337" width="58" height="6" rx="3" fill="rgba(255,255,255,0.13)" />
      </motion.g>
    </motion.svg>
  );
}

/** О нас: орбиты клиентов вокруг студии. */
export function OrbitArt() {
  const nodes = [
    { r: 96, a: -35, accent: true },
    { r: 96, a: 150, accent: false },
    { r: 142, a: 42, accent: false },
    { r: 142, a: 200, accent: true },
    { r: 142, a: 290, accent: false },
    { r: 186, a: -70, accent: false },
    { r: 186, a: 110, accent: false },
  ];

  return (
    <motion.svg
      viewBox="0 0 420 420"
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-80px" }}
      className="h-auto w-full overflow-visible"
      aria-hidden
    >
      <defs>
        <radialGradient id="lpOrbitGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#F9A08B" stopOpacity="0.22" />
          <stop offset="100%" stopColor="#F9A08B" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="210" cy="210" r="200" fill="url(#lpOrbitGlow)" />

      {[96, 142, 186].map((r, i) => (
        <motion.circle key={r} variants={draw} custom={i}
          cx="210" cy="210" r={r} fill="none"
          stroke={i === 1 ? "#F9A08B" : LINE_SOFT}
          strokeOpacity={i === 1 ? 0.4 : 1}
          strokeWidth="1.5"
          strokeDasharray={i === 1 ? "4 9" : undefined} />
      ))}

      {/* ядро — знак Velora */}
      <motion.circle variants={draw} custom={3} cx="210" cy="210" r="52" fill="none" stroke={LINE} strokeWidth="1.5" />
      <motion.g variants={pop} custom={0}>
        <rect x="192" y="192" width="15" height="15" rx="4.5" fill="#F9A08B" />
        <rect x="213" y="192" width="15" height="15" rx="4.5" fill="#F9A08B" opacity="0.55" />
        <rect x="192" y="213" width="15" height="15" rx="4.5" fill="#F9A08B" opacity="0.55" />
        <rect x="213" y="213" width="15" height="15" rx="4.5" fill="#F9A08B" />
      </motion.g>

      {/* узлы-клиенты на орбитах */}
      <motion.g
        animate={{ rotate: 360 }}
        style={{ transformOrigin: "210px 210px" }}
        transition={{ duration: 140, ease: "linear", repeat: Infinity }}
      >
        {nodes.map((n, i) => {
          const rad = (n.a * Math.PI) / 180;
          const cx = 210 + n.r * Math.cos(rad);
          const cy = 210 + n.r * Math.sin(rad);
          return (
            <motion.g key={i} variants={pop} custom={i + 2}>
              <circle cx={cx} cy={cy} r="17" fill="#161616" stroke={n.accent ? "#F9A08B" : LINE} strokeWidth="1.5" />
              <circle cx={cx} cy={cy - 4} r="4.5" fill={n.accent ? "#F9A08B" : "rgba(255,255,255,0.4)"} />
              <path d={`M${cx - 8} ${cy + 8}a8 8 0 0 1 16 0`} fill="none"
                stroke={n.accent ? "#F9A08B" : "rgba(255,255,255,0.4)"} strokeWidth="1.5" strokeLinecap="round" />
            </motion.g>
          );
        })}
      </motion.g>
    </motion.svg>
  );
}
