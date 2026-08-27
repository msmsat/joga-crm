import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

/* Контурные «экраны продукта» для глав-разборов. Светлые — как настоящий
   кабинет: белая карточка, тонкая рамка, персиковый только на акценте.
   Хром карточки — обычный HTML, внутри SVG только содержимое: так меньше
   кода и тень с радиусом ведут себя предсказуемо. */

const LINE = "rgba(26,26,26,0.10)";
const SOFT = "rgba(26,26,26,0.05)";
const MUTE = "rgba(26,26,26,0.22)";
const PEACH = "#F9A08B";

function Screen({ titleKey, children }: { titleKey: string; children: ReactNode }) {
  const { t } = useTranslation("landing");
  return (
    <div className="rounded-[22px] border border-[#101010]/8 bg-white p-5 shadow-[0_28px_70px_-28px_rgba(26,26,26,0.22)]">
      <div className="mb-4 flex items-center gap-2 px-1">
        <span className="h-2 w-2 rounded-full bg-[#F9A08B]" />
        <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#101010]/45">{t(`screens.${titleKey}`)}</span>
      </div>
      <svg viewBox="0 0 360 230" className="h-auto w-full" aria-hidden>{children}</svg>
    </div>
  );
}

/** Журнал: колонки тренеров, часовая сетка, занятие в переносе. */
export function JournalScreen() {
  return (
    <Screen titleKey="journal">
      {[0, 1, 2].map((i) => (
        <g key={i}>
          <rect x={30 + i * 112} y="0" width="104" height="22" rx="8" fill={SOFT} />
          <circle cx={44 + i * 112} cy="11" r="6" fill={i === 0 ? PEACH : MUTE} />
          <rect x={56 + i * 112} y="8" width="42" height="6" rx="3" fill={MUTE} />
        </g>
      ))}
      {[0, 1, 2, 3, 4].map((r) => (
        <g key={r}>
          <line x1="26" y1={36 + r * 38} x2="360" y2={36 + r * 38} stroke={LINE} />
          <rect x="0" y={32 + r * 38} width="18" height="6" rx="3" fill={MUTE} opacity="0.45" />
        </g>
      ))}

      <rect x="32" y="40" width="100" height="32" rx="9" fill={PEACH} />
      <rect x="42" y="49" width="54" height="6" rx="3" fill="#fff" opacity="0.9" />
      <rect x="42" y="59" width="34" height="5" rx="2.5" fill="#fff" opacity="0.55" />

      <rect x="256" y="40" width="100" height="46" rx="9" fill={SOFT} stroke={LINE} />
      <rect x="266" y="50" width="58" height="6" rx="3" fill={MUTE} />
      <rect x="266" y="62" width="38" height="5" rx="2.5" fill={MUTE} opacity="0.6" />

      <rect x="144" y="116" width="100" height="32" rx="9" fill="rgba(249,160,139,0.14)" stroke={PEACH} strokeOpacity="0.45" />
      <rect x="154" y="125" width="52" height="6" rx="3" fill={PEACH} />
      <rect x="154" y="135" width="30" height="5" rx="2.5" fill={PEACH} opacity="0.5" />

      {/* карточка в переносе — пунктир и «тень» на месте назначения */}
      <rect x="34" y="154" width="100" height="32" rx="9" fill="#fff" stroke={PEACH} strokeWidth="1.5" strokeDasharray="5 4" />
      <rect x="44" y="163" width="48" height="6" rx="3" fill={PEACH} opacity="0.7" />
      <rect x="44" y="173" width="28" height="5" rx="2.5" fill={PEACH} opacity="0.35" />
      <rect x="34" y="192" width="100" height="30" rx="9" fill={SOFT} />
    </Screen>
  );
}

/** Онлайн-запись: список услуг и выбор времени глазами клиента. */
export function BookingScreen() {
  const slots = ["9:00", "10:30", "12:00", "14:00", "17:30", "19:00"];
  return (
    <Screen titleKey="booking">
      {[0, 1, 2].map((i) => (
        <g key={i}>
          <rect x="0" y={i * 52} width="360" height="44" rx="12"
            fill={i === 0 ? "rgba(249,160,139,0.08)" : "#fff"}
            stroke={i === 0 ? PEACH : LINE} strokeOpacity={i === 0 ? 0.45 : 1} />
          <circle cx="26" cy={22 + i * 52} r="11" fill={i === 0 ? PEACH : SOFT} />
          <rect x="48" y={14 + i * 52} width={110 - i * 18} height="7" rx="3.5" fill={MUTE} />
          <rect x="48" y={27 + i * 52} width="64" height="5" rx="2.5" fill={MUTE} opacity="0.55" />
          <rect x={294} y={18 + i * 52} width="48" height="8" rx="4" fill={i === 0 ? PEACH : MUTE} opacity={i === 0 ? 1 : 0.5} />
        </g>
      ))}

      <rect x="0" y="168" width="86" height="7" rx="3.5" fill={MUTE} opacity="0.6" />
      {slots.map((s, i) => (
        <g key={s}>
          <rect x={i * 61} y="190" width="52" height="30" rx="10"
            fill={i === 3 ? PEACH : "#fff"} stroke={i === 3 ? PEACH : LINE} />
          <rect x={i * 61 + 12} y="202" width="28" height="6" rx="3"
            fill={i === 3 ? "#fff" : MUTE} opacity={i === 3 ? 0.95 : 0.7} />
        </g>
      ))}
    </Screen>
  );
}

/** Финансы: чек визита со списаниями и итогом. */
export function FinanceScreen() {
  const rows: [number, number, boolean][] = [
    [150, 46, false], [120, 40, false], [176, 52, true], [138, 44, false],
  ];
  return (
    <Screen titleKey="finance">
      {rows.map(([w, aw, minus], i) => (
        <g key={i}>
          <rect x="0" y={i * 34} width={w} height="8" rx="4" fill={MUTE} opacity="0.7" />
          <rect x={360 - aw} y={i * 34} width={aw} height="8" rx="4" fill={minus ? PEACH : MUTE} opacity={minus ? 0.9 : 0.55} />
          <line x1="0" y1={i * 34 + 22} x2="360" y2={i * 34 + 22} stroke={LINE} strokeDasharray="3 4" />
        </g>
      ))}

      <rect x="0" y="150" width="360" height="52" rx="14" fill="#101010" />
      <rect x="18" y="170" width="92" height="9" rx="4.5" fill="#fff" opacity="0.35" />
      <rect x="250" y="166" width="92" height="16" rx="8" fill={PEACH} />

      <rect x="0" y="214" width="132" height="6" rx="3" fill={MUTE} opacity="0.4" />
      <rect x="284" y="214" width="76" height="6" rx="3" fill={PEACH} opacity="0.6" />
    </Screen>
  );
}

/** Уведомления: матрица «событие × канал». Колонок три — по числу живых
    каналов рассылки (Telegram, Email, WhatsApp), а не шесть, как рисовалось
    раньше: Instagram, SMS и Push в отправке не участвуют. */
export function NotifyScreen() {
  const on = [
    [1, 1, 0],
    [1, 0, 1],
    [0, 1, 1],
    [1, 1, 0],
  ];
  const colX = (c: number) => 236 + c * 44;

  return (
    <Screen titleKey="notify">
      {[0, 1, 2].map((c) => (
        <circle key={c} cx={colX(c) + 14} cy="10" r="9" fill={SOFT} stroke={LINE} />
      ))}
      {on.map((row, r) => (
        <g key={r}>
          <rect x="0" y={44 + r * 42} width={190 - (r % 2) * 34} height="8" rx="4" fill={MUTE} opacity="0.7" />
          <line x1="0" y1={64 + r * 42} x2="360" y2={64 + r * 42} stroke={LINE} />
          {row.map((v, c) => (
            <g key={c}>
              <rect x={colX(c)} y={34 + r * 42} width="28" height="28" rx="9"
                fill={v ? PEACH : "#fff"} stroke={v ? PEACH : LINE} />
              {v === 1 && (
                <path d={`m${colX(c) + 8} ${48 + r * 42} 4 4 7-8`} fill="none" stroke="#fff"
                  strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              )}
            </g>
          ))}
        </g>
      ))}
    </Screen>
  );
}

/** Velora AI: диалог ассистента с владельцем. */
export function AiScreen() {
  return (
    <Screen titleKey="ai">
      <rect x="120" y="0" width="240" height="46" rx="14" fill={SOFT} />
      <rect x="138" y="14" width="182" height="7" rx="3.5" fill={MUTE} opacity="0.75" />
      <rect x="138" y="27" width="118" height="6" rx="3" fill={MUTE} opacity="0.5" />

      <rect x="0" y="62" width="278" height="96" rx="16" fill="#101010" />
      <path d="M22 84a12 12 0 0 0 12-12 12 12 0 0 0 12 12 12 12 0 0 0-12 12 12 12 0 0 0-12-12Z" fill={PEACH} />
      <rect x="58" y="78" width="196" height="7" rx="3.5" fill="#fff" opacity="0.55" />
      <rect x="22" y="100" width="232" height="7" rx="3.5" fill="#fff" opacity="0.32" />
      <rect x="22" y="117" width="176" height="7" rx="3.5" fill="#fff" opacity="0.32" />
      <rect x="22" y="134" width="96" height="9" rx="4.5" fill={PEACH} opacity="0.85" />

      <rect x="0" y="176" width="360" height="46" rx="14" fill="#fff" stroke={LINE} />
      <rect x="20" y="195" width="150" height="7" rx="3.5" fill={MUTE} opacity="0.4" />
      <rect x="306" y="186" width="36" height="26" rx="9" fill={PEACH} />
      <path d="m318 199 5 5 9-11" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </Screen>
  );
}
