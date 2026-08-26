import { AnimatePresence, motion } from "framer-motion";
import type { Variants } from "framer-motion";
import type { ReactNode } from "react";
import { usePhone } from "../../../hooks/usePhone";
import { EASE } from "./tokens";

/* Свои line-art иллюстрации: только inline SVG, без внешних ассетов и
   зависимостей. Контур — белый на 22%, акцентные детали — персиковые.
   Анимация входа: обводка «рисуется» (pathLength), заливки «выщёлкивают». */

const LINE = "rgba(255,255,255,0.22)";
const LINE_SOFT = "rgba(255,255,255,0.12)";
// Тёмная дорожка прогресса на бумажном фоне (FAQ) — та же система, но не
// белая, а оникс с низкой непрозрачностью.
const LINE_DARK_SOFT = "rgba(16,16,16,0.08)";

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
 * Сетка-подложка для чёрных секций — два CSS-градиента под радиальной маской
 * (`.lp-grid` в landing.css). Был SVG с `<pattern>` и `<mask>`: шесть секций
 * страницы растрировали его во всю свою высоту, и это была самая дорогая
 * графика на странице при том, что рисует она четыре линии.
 */
export function GridBg({ className = "" }: { className?: string }) {
  return <div aria-hidden className={`lp-grid ${className}`} />;
}

/** Герой: контурная «панель расписания» с парящими карточками записи. */
export function HeroArt() {
  const bars = [40, 64, 48, 92, 56, 74, 44];
  // На телефоне рисуем сразу готовую иллюстрацию: вход — это сорок узлов SVG,
  // каждый со своей пружиной, и все они считаются в главном потоке. Ровно в тот
  // момент, когда человек начинает листать первый экран.
  const isPhone = usePhone();

  return (
    <motion.svg
      viewBox="0 0 460 440"
      initial={isPhone ? "show" : "hidden"}
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

      {/* медленное персиковое кольцо вокруг композиции (CSS, только с планшета) */}
      <circle
        className="lp-spin-slow"
        cx="230" cy="205" r="198"
        fill="none" stroke="#F9A08B" strokeOpacity="0.22"
        strokeWidth="1" strokeDasharray="2 12"
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

      {/* Парящие карточки. Внешний <g> качает их средствами CSS, внутренний —
          выщёлкивает при появлении. Разные элементы намеренно: CSS-анимация
          перебивает inline-стиль, и на одном узле она стёрла бы вход. */}
      <g className="lp-float-a">
        <motion.g variants={pop} custom={22}>
          <rect x="300" y="24" width="146" height="70" rx="16" fill="#161616" stroke="#F9A08B" strokeOpacity="0.45" strokeWidth="1.5" />
          <circle cx="326" cy="59" r="13" fill="#F9A08B" />
          <path d="M321 59.5 324.5 63 331 55.5" fill="none" stroke="#101010" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <rect x="348" y="48" width="76" height="8" rx="4" fill="rgba(255,255,255,0.28)" />
          <rect x="348" y="63" width="50" height="6" rx="3" fill="rgba(255,255,255,0.14)" />
        </motion.g>
      </g>

      <g className="lp-float-b">
        <motion.g variants={pop} custom={24}>
          <rect x="10" y="298" width="158" height="68" rx="16" fill="#161616" stroke={LINE} strokeWidth="1.5" />
          <circle cx="36" cy="332" r="14" fill="none" stroke="#F9A08B" strokeWidth="1.5" />
          <circle cx="36" cy="328" r="4.5" fill="none" stroke="#F9A08B" strokeWidth="1.5" />
          <path d="M28 340a9 9 0 0 1 16 0" fill="none" stroke="#F9A08B" strokeWidth="1.5" strokeLinecap="round" />
          <rect x="60" y="322" width="86" height="8" rx="4" fill="rgba(255,255,255,0.26)" />
          <rect x="60" y="337" width="58" height="6" rx="3" fill="rgba(255,255,255,0.13)" />
        </motion.g>
      </g>
    </motion.svg>
  );
}

const CARD = "rounded-[20px] border border-[#101010]/8 bg-white p-5 shadow-[0_20px_50px_-20px_rgba(26,26,26,0.18)]";

/** Заголовок карточки: точка + подпись — тот же приём, что у Screen в Screens.tsx. */
function CardLabel({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="h-2 w-2 shrink-0 rounded-full bg-[#F9A08B]" />
      <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#101010]/45">{children}</span>
    </div>
  );
}

/** Хero-карточка: недельная загрузка журнала. */
function JournalCard() {
  const bars = [62, 80, 45, 95, 70, 55, 88];
  return (
    <motion.div variants={pop} custom={0} className={`${CARD} rotate-[-1deg] lg:col-start-1 lg:row-start-1 lg:row-span-2 col-span-2 lg:col-span-1`}>
      <CardLabel>Журнал</CardLabel>
      <div className="mt-1.5 text-[13px] text-[#666]">Сегодня — 12 занятий</div>
      <div className="mt-6 flex h-24 items-end gap-2">
        {bars.map((h, i) => (
          <motion.div
            key={i}
            variants={pop}
            custom={1 + i}
            style={{
              height: `${h * 0.9}px`,
              transformOrigin: "center bottom",
              background: i === 3 ? "linear-gradient(180deg,#FCAE91,#F9A08B)" : `rgba(249,160,139,${0.15 + i * 0.03})`,
            }}
            className="flex-1 rounded-t-md"
          />
        ))}
      </div>
      <div className="mt-2 flex justify-between text-[9px] font-bold uppercase tracking-wide text-[#101010]/25">
        {"ПВСЧПСВ".split("").map((d, i) => <span key={i}>{d}</span>)}
      </div>
    </motion.div>
  );
}

/** Выручка месяца с трендом. */
function FinanceCard() {
  return (
    <motion.div variants={pop} custom={9} className={`${CARD} rotate-[2deg] lg:col-start-2 lg:row-start-1`}>
      <CardLabel>Финансы</CardLabel>
      <div className="mt-4 text-[26px] font-black tracking-[-0.02em] text-[#101010]">₽186K</div>
      <div className="mt-1 text-[11px] text-[#666]">выручка за месяц</div>
      <motion.div
        variants={pop}
        custom={10}
        className="mt-3 inline-flex items-center gap-1 rounded-full bg-[#A3C9A8]/18 px-2.5 py-1 text-[11px] font-bold text-[#4B8A63]"
      >
        <svg width="9" height="9" viewBox="0 0 10 10" fill="none" aria-hidden>
          <path d="M1 7L5 3L9 7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        +12%
      </motion.div>
    </motion.div>
  );
}

/** Клиентская база: стопка аватаров + счётчик. */
function ClientsCard() {
  const avatars = ["#F9A08B", "#101010", "#7BA7D4"];
  return (
    <motion.div variants={pop} custom={11} className={`${CARD} rotate-[-2deg] lg:col-start-2 lg:row-start-2`}>
      <CardLabel>Клиенты</CardLabel>
      <div className="mt-4 flex -space-x-2.5">
        {avatars.map((c, i) => (
          <motion.span key={i} variants={pop} custom={12 + i} style={{ background: c }} className="h-7 w-7 rounded-full ring-2 ring-white" />
        ))}
        <motion.span
          variants={pop}
          custom={15}
          className="flex h-7 w-7 items-center justify-center rounded-full bg-[#F5F4F2] text-[8px] font-bold text-[#666] ring-2 ring-white"
        >
          +245
        </motion.span>
      </div>
      <div className="mt-3 text-[20px] font-black text-[#101010]">248</div>
      <div className="text-[11px] text-[#666]">клиентов, +12 за неделю</div>
    </motion.div>
  );
}

/** Ассистент отвечает клиенту — мини-диалог с «печатающими» точками. */
function AiCard() {
  return (
    <motion.div variants={pop} custom={16} className={`${CARD} rotate-[1deg] col-span-2 lg:col-start-1 lg:col-span-2 lg:row-start-3`}>
      <CardLabel>Velora AI</CardLabel>
      <motion.div variants={pop} custom={17} className="mt-3 rounded-2xl bg-[#101010] p-3.5">
        <div className="h-[7px] w-[78%] rounded-full bg-white/30" />
        <div className="mt-2 h-[7px] w-[52%] rounded-full bg-white/18" />
        <div className="mt-2.5 flex gap-1">
          <span className="lp-typing-1 h-1.5 w-1.5 rounded-full bg-[#F9A08B]" />
          <span className="lp-typing-2 h-1.5 w-1.5 rounded-full bg-[#F9A08B]" />
          <span className="lp-typing-3 h-1.5 w-1.5 rounded-full bg-[#F9A08B]" />
        </div>
      </motion.div>
    </motion.div>
  );
}

/**
 * «Одна платформа»: не мокап окна браузера, а бенто-кластер из четырёх
 * самостоятельных карточек — по одной на «Записи, клиенты, деньги, …AI» из
 * подзаголовка. На lg+ карточки встают в асимметричную сетку (Журнал — герой
 * на две строки), ниже — просто складываются в столбик: явную сетку задают
 * только числовые col/row-утилиты Tailwind, без строковых grid-template-areas
 * (легко разъехаться, а линтер такую опечатку не ловит). Высоты строк —
 * `minmax(мин, auto)`, а не жёсткий px: если контент карточки чуть выше
 * расчёта, ряд растягивается сам, а не режет карточку — та же причина, по
 * которой уже один раз резало иконки рельсы старой версии этого блока.
 */
export function PlatformArt() {
  const isPhone = usePhone();

  return (
    <div className="relative">
      <div aria-hidden className="lp-glow absolute -inset-16 -z-10" />

      <motion.div
        initial={isPhone ? "show" : "hidden"}
        whileInView="show"
        viewport={{ once: true, margin: "-80px" }}
        className="grid grid-cols-2 gap-4 lg:grid-rows-[minmax(168px,auto)_minmax(168px,auto)_minmax(128px,auto)]"
      >
        <JournalCard />
        <FinanceCard />
        <ClientsCard />
        <AiCard />
      </motion.div>
    </div>
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
  const isPhone = usePhone();

  return (
    <motion.svg
      viewBox="0 0 420 420"
      initial={isPhone ? "show" : "hidden"}
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

      {/* узлы-клиенты на орбитах (вращение — CSS, только с планшета) */}
      <g className="lp-orbit">
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
      </g>
    </motion.svg>
  );
}

/**
 * FAQ: компактный «пульс» вместо статичного макета — персиковое кольцо
 * прогресса заполняется по мере того, какой вопрос открыт (`active`), номер
 * в центре сменяется тем же приёмом, что счётчики цены/страниц. Живая часть
 * привязана к состоянию аккордеона в Faq.tsx, а не декорация рядом с ним.
 */
export function FaqArt({ active, total }: { active: number | null; total: number }) {
  const r = 92;
  const c = 2 * Math.PI * r;
  const progress = active === null ? 0 : (active + 1) / total;

  return (
    <div className="relative">
      <motion.svg
        viewBox="0 0 260 260"
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, margin: "-80px" }}
        className="h-auto w-full overflow-visible"
        aria-hidden
      >
        <defs>
          <radialGradient id="lpFaqGlow" cx="50%" cy="50%" r="55%">
            <stop offset="0%" stopColor="#F9A08B" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#F9A08B" stopOpacity="0" />
          </radialGradient>
        </defs>
        <ellipse cx="130" cy="130" rx="130" ry="126" fill="url(#lpFaqGlow)" />

        <g className="lp-spin-slow" style={{ transformOrigin: "130px 130px" }}>
          <motion.circle variants={pop} custom={0}
            cx="130" cy="130" r="118" fill="none"
            stroke="#F9A08B" strokeOpacity="0.22" strokeWidth="1" strokeDasharray="2 12" />
        </g>

        {/* дорожка прогресса */}
        <motion.circle variants={draw} custom={0}
          cx="130" cy="130" r={r} fill="none" stroke={LINE_DARK_SOFT} strokeWidth="6" />

        {/* заливка — сколько вопросов уже открыли, начиная с полуночи */}
        <g transform="rotate(-90 130 130)">
          <motion.circle
            cx="130" cy="130" r={r} fill="none" stroke="#F9A08B" strokeWidth="6" strokeLinecap="round"
            strokeDasharray={c}
            initial={{ strokeDashoffset: c }}
            animate={{ strokeDashoffset: c * (1 - progress) }}
            transition={{ duration: 0.6, ease: EASE }}
          />
        </g>

        {/* плавающий бейдж «?» */}
        <g className="lp-float-a">
          <motion.g variants={pop} custom={1}>
            <circle cx="222" cy="46" r="22" fill="#101010" stroke="#F9A08B" strokeOpacity="0.55" strokeWidth="1.5" />
            <path d="M216 39a6 6 0 1 1 8.5 5.4c-1.6 1-2.5 2.2-2.5 3.8" fill="none" stroke="#F9A08B" strokeWidth="1.8" strokeLinecap="round" />
            <circle cx="222" cy="53.5" r="1.4" fill="#F9A08B" />
          </motion.g>
        </g>
      </motion.svg>

      {/* номер открытого вопроса — HTML поверх SVG, тот же приём, что нумерация в ChapterHead */}
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <AnimatePresence mode="wait">
          {active === null ? (
            <motion.div
              key="idle"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25, ease: EASE }}
              className="flex flex-col items-center"
            >
              {/* рисованный вопросительный знак: тлеющий пинг-ореол + мягкое дыхание, приглашают нажать */}
              <div className="relative flex h-14 w-14 items-center justify-center">
                <span className="lp-ping absolute h-9 w-9 rounded-full bg-[#F9A08B]/30" />
                <svg width="30" height="30" viewBox="0 0 44 44" fill="none" className="lp-breathe relative" aria-hidden>
                  <path d="M14 15c0-6 4.5-9.5 10-9.5s10 3.4 10 8c0 4.6-3.4 6.8-7 9-2.4 1.4-3.5 3-3.5 5.6"
                    stroke="#F9A08B" strokeWidth="3" strokeLinecap="round" fill="none" />
                  <circle cx="23.5" cy="34" r="2.6" fill="#F9A08B" />
                </svg>
              </div>
              <div className="mt-3 text-[11px] font-bold uppercase tracking-[0.16em] text-[#666]">
                {total} вопросов
              </div>
            </motion.div>
          ) : (
            <motion.div
              key={active}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25, ease: EASE }}
              className="text-center"
            >
              <div className="font-mono text-[38px] font-black tabular-nums leading-none text-[#101010]">
                {String(active + 1).padStart(2, "0")}
              </div>
              <div className="mt-2 text-[10px] font-bold uppercase tracking-[0.16em] text-[#666]">
                открыт
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className={`mt-3 flex gap-1.5 transition-opacity duration-300 ${active !== null ? "opacity-100" : "opacity-0"}`}>
          <span className="lp-typing-1 h-1.5 w-1.5 rounded-full bg-[#F9A08B]" />
          <span className="lp-typing-2 h-1.5 w-1.5 rounded-full bg-[#F9A08B]" />
          <span className="lp-typing-3 h-1.5 w-1.5 rounded-full bg-[#F9A08B]" />
        </div>
      </div>
    </div>
  );
}
