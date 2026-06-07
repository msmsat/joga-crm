import { useState } from 'react';

// ─── ТИПЫ ───────────────────────────────────────────────────────────────────
type Period = 'day' | 'week' | 'month' | 'year';
type Tab = 'Основные' | 'По продажам' | 'По тренерам' | 'По услугам' | 'Все' | 'События';

// ─── ДАННЫЕ ─────────────────────────────────────────────────────────────────
const MONTHS = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл'];
const MONTH_VALS: Record<Period, number[]> = {
  day:   [18, 21, 24, 19, 27, 26, 28],
  week:  [95, 110, 128, 103, 145, 138, 151],
  month: [180, 210, 240, 195, 270, 260, 284],
  year:  [1800, 2100, 2400, 1950, 2700, 2600, 2840],
};
const PERIOD_LABELS: Record<Period, string> = {
  day: 'День', week: 'Неделя', month: 'Месяц', year: 'Год',
};

const TRAINER_DATA = [
  { name: 'Анна Смирнова', role: 'Пилатес', sessions: 87, revenue: '₽104K', rating: 4.9, retention: 94, color: '#FCAE91', initials: 'АС' },
  { name: 'Мария Козлова', role: 'Йога', sessions: 74, revenue: '₽88K', rating: 4.8, retention: 91, color: '#5BAB72', initials: 'МК' },
  { name: 'Дмитрий Орлов', role: 'Растяжка', sessions: 62, revenue: '₽72K', rating: 4.7, retention: 88, color: '#4A80C4', initials: 'ДО' },
  { name: 'Ольга Новикова', role: 'Реформер', sessions: 48, revenue: '₽59K', rating: 4.6, retention: 85, color: '#A3C9A8', initials: 'ОН' },
];

const SERVICE_DATA = [
  { name: 'Групповой пилатес', sessions: 148, revenue: '₽128K', share: 45, color: '#FCAE91', trend: '+12%' },
  { name: 'Индивидуальный урок', sessions: 64, revenue: '₽78K', share: 27, color: '#5BAB72', trend: '+8%' },
  { name: 'Реформер пилатес', sessions: 51, revenue: '₽54K', share: 19, color: '#4A80C4', trend: '+21%' },
  { name: 'Растяжка / Стретчинг', sessions: 26, revenue: '₽24K', share: 9, color: '#D88C9A', trend: '-3%' },
];

const SALES_DATA = [
  { label: 'Абонемент 8 занятий', count: 42, revenue: '₽109K', avg: '₽2 600', badge: 'ТОП' },
  { label: 'Разовое занятие', count: 38, revenue: '₽45K', avg: '₽1 200', badge: '' },
  { label: 'Абонемент 16 занятий', count: 19, revenue: '₽83K', avg: '₽4 400', badge: 'РОСТ' },
  { label: 'Подарочный сертификат', count: 11, revenue: '₽28K', avg: '₽2 500', badge: '' },
  { label: 'Абонемент безлимит', count: 8, revenue: '₽52K', avg: '₽6 500', badge: '' },
  { label: 'Пробное занятие', count: 22, revenue: '₽11K', avg: '₽500', badge: 'НОВЫЙ' },
];

const EVENTS_DATA = [
  { date: '15 июл', title: 'Мастер-класс по реформеру', type: 'Мероприятие', attendees: 14, revenue: '₽21K', status: 'Завершено', color: '#5BAB72' },
  { date: '22 июл', title: 'Воркшоп: Основы пилатеса', type: 'Обучение', attendees: 8, revenue: '₽12K', status: 'Завершено', color: '#4A80C4' },
  { date: '28 июл', title: 'День открытых дверей', type: 'Промо', attendees: 31, revenue: '₽0', status: 'Завершено', color: '#FCAE91' },
  { date: '5 авг', title: 'Интенсив по растяжке', type: 'Мероприятие', attendees: 12, revenue: '₽18K', status: 'Предстоит', color: '#D88C9A' },
  { date: '19 авг', title: 'Сезонный марафон', type: 'Мероприятие', attendees: 0, revenue: '—', status: 'Предстоит', color: '#FCAE91' },
];

// ─── МИНИ-ИКОНКИ SVG ────────────────────────────────────────────────────────
const Icon = {
  TrendUp: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" />
    </svg>
  ),
  TrendDown: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="23 18 13.5 8.5 8.5 13.5 1 6" /><polyline points="17 18 23 18 23 12" />
    </svg>
  ),
  Users: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.85" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  Star: () => (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="#f0c040" stroke="#f0c040" strokeWidth="1.5">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  ),
  Calendar: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  ),
  Ruble: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M6 11h8a4 4 0 0 0 0-8H6v8zm0 0H4m2 0v8" /><line x1="4" y1="15" x2="10" y2="15" />
    </svg>
  ),
  Zap: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  ),
  Heart: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  ),
  Award: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="8" r="6" /><path d="M15.477 12.89L17 22l-5-3-5 3 1.523-9.11" />
    </svg>
  ),
  Package: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <line x1="16.5" y1="9.4" x2="7.5" y2="4.21" />
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <polyline points="3.27 6.96 12 12.01 20.73 6.96" /><line x1="12" y1="22.08" x2="12" y2="12" />
    </svg>
  ),
};

// ─── КОМПОНЕНТ ВЫБОРА ПЕРИОДА ─────────────────────────────────────────────────
function PeriodSelector({ value, onChange }: { value: Period; onChange: (p: Period) => void }) {
  return (
    <div style={{
      display: 'flex', background: 'rgba(26,26,26,0.04)', borderRadius: '10px',
      padding: '3px', gap: '2px', border: '1px solid var(--border)',
    }}>
      {(['day', 'week', 'month', 'year'] as Period[]).map((p) => (
        <button key={p} onClick={() => onChange(p)} style={{
          padding: '5px 12px', borderRadius: '8px', border: 'none', cursor: 'pointer',
          fontSize: '12px', fontWeight: 700, fontFamily: 'var(--font)',
          transition: 'all 0.2s cubic-bezier(0.34,1.2,0.64,1)',
          background: value === p ? '#fff' : 'transparent',
          color: value === p ? 'var(--text)' : 'var(--text3)',
          boxShadow: value === p ? '0 1px 6px rgba(26,26,26,0.1)' : 'none',
          transform: value === p ? 'translateY(-0.5px)' : 'none',
        }}>
          {PERIOD_LABELS[p]}
        </button>
      ))}
    </div>
  );
}

// ─── ТУЛТИП ДЛЯ СВЕЧКИ ───────────────────────────────────────────────────────
interface CandleTooltipData {
  month: string; val: number; pct: number; sessions: number; clients: number; period: Period;
}
function CandleTooltip({ data, visible, x, y }: { data: CandleTooltipData | null; visible: boolean; x: number; y: number }) {
  if (!data || !visible) return null;
  const unitMap: Record<Period, string> = { day: 'тыс.', week: 'тыс.', month: 'тыс.', year: 'тыс.' };
  return (
    <div style={{
      position: 'fixed', left: x + 12, top: y - 10, zIndex: 9999, pointerEvents: 'none',
      background: '#1A1A1A', borderRadius: '12px', padding: '12px 14px', minWidth: '160px',
      boxShadow: '0 12px 40px rgba(0,0,0,0.3)', color: '#fff', animation: 'tooltipIn 0.15s ease',
    }}>
      <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)', marginBottom: '6px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{data.month}</div>
      <div style={{ fontSize: '20px', fontWeight: 800, marginBottom: '8px' }}>₽{data.val}{unitMap[data.period]}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'rgba(255,255,255,0.7)' }}>
          <span>Занятий</span><span style={{ fontWeight: 700, color: '#fff' }}>{data.sessions}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'rgba(255,255,255,0.7)' }}>
          <span>Клиентов</span><span style={{ fontWeight: 700, color: '#fff' }}>{data.clients}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'rgba(255,255,255,0.7)' }}>
          <span>vs прошлый</span>
          <span style={{ fontWeight: 700, color: data.pct >= 0 ? '#A3C9A8' : '#D88C9A' }}>
            {data.pct >= 0 ? '+' : ''}{data.pct}%
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── ИНТЕРАКТИВНЫЙ СВЕЧНОЙ ГРАФИК ────────────────────────────────────────────
function CandleChart({ period }: { period: Period }) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [tooltipData, setTooltipData] = useState<CandleTooltipData | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const vals = MONTH_VALS[period];
  const maxVal = Math.max(...vals);
  const sessionsData = [148, 167, 184, 156, 201, 195, 213];
  const clientsData  = [89, 102, 115, 97, 128, 121, 134];
  const pctChanges   = [0, +16, +14, -18, +38, -4, +9];

  return (
    <div style={{ position: 'relative' }}>
      <div style={{
        display: 'flex', alignItems: 'flex-end', gap: '10px',
        height: '180px', padding: '10px 0 0', position: 'relative',
      }}>
        {/* Сетка */}
        {[25, 50, 75, 100].map(pct => (
          <div key={pct} style={{
            position: 'absolute', left: 0, right: 0,
            bottom: `${pct}%`, height: '1px',
            background: 'rgba(26,26,26,0.05)',
            zIndex: 0, pointerEvents: 'none',
          }} />
        ))}

        {vals.map((v, i) => {
          const h = (v / maxVal) * 100;
          const isActive = hoveredIdx === i;
          const isHigh = v === maxVal;
          // Свечка: тело + фитиль
          const bodyH = Math.max(h - 4, 8);
          const wickTop = h + 4;
          return (
            <div key={i} style={{
              flex: 1, display: 'flex', flexDirection: 'column',
              alignItems: 'center', height: '100%', justifyContent: 'flex-end',
              position: 'relative', zIndex: 1, cursor: 'pointer',
            }}
              onMouseEnter={(e) => {
                setHoveredIdx(i);
                setTooltipData({ month: MONTHS[i], val: v, pct: pctChanges[i], sessions: sessionsData[i], clients: clientsData[i], period });
                setTooltipPos({ x: e.clientX, y: e.clientY });
              }}
              onMouseMove={(e) => setTooltipPos({ x: e.clientX, y: e.clientY })}
              onMouseLeave={() => { setHoveredIdx(null); setTooltipData(null); }}
            >
              {/* Фитиль */}
              <div style={{
                width: '2px', background: isActive ? 'var(--accent)' : 'rgba(252,174,145,0.4)',
                height: `${wickTop}%`, position: 'absolute', bottom: 0,
                borderRadius: '2px', transition: 'all 0.2s',
              }} />
              {/* Тело свечки */}
              <div style={{
                width: '100%', maxWidth: '32px',
                height: `${bodyH}%`, position: 'absolute', bottom: 0,
                background: isActive
                  ? 'linear-gradient(180deg, var(--accent) 0%, #F5866E 100%)'
                  : isHigh
                    ? 'linear-gradient(180deg, rgba(252,174,145,0.9) 0%, rgba(249,160,139,0.6) 100%)'
                    : 'rgba(252,174,145,0.3)',
                borderRadius: '4px 4px 2px 2px',
                transition: 'all 0.2s cubic-bezier(0.34,1.2,0.64,1)',
                transform: isActive ? 'scaleX(1.05)' : 'none',
                boxShadow: isActive ? '0 4px 14px rgba(252,174,145,0.5)' : 'none',
              }} />
              {/* Значение над баром при hover */}
              {isActive && (
                <div style={{
                  position: 'absolute', bottom: `calc(${bodyH}% + 8px)`,
                  fontSize: '10px', fontWeight: 800, color: 'var(--accent)',
                  whiteSpace: 'nowrap', animation: 'fadeSlide 0.15s ease',
                }}>
                  ₽{v}K
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Метки месяцев */}
      <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
        {MONTHS.map((m, i) => (
          <div key={i} style={{
            flex: 1, textAlign: 'center', fontSize: '10px',
            color: hoveredIdx === i ? 'var(--accent)' : 'var(--text3)',
            fontWeight: hoveredIdx === i ? 700 : 500,
            transition: 'all 0.15s',
          }}>{m}</div>
        ))}
      </div>

      <CandleTooltip data={tooltipData} visible={hoveredIdx !== null} x={tooltipPos.x} y={tooltipPos.y} />
    </div>
  );
}

// ─── ВИЗУАЛИЗАЦИЯ RETENTION ───────────────────────────────────────────────────
function RetentionArc({ value }: { value: number }) {
  const r = 44;
  const circumference = 2 * Math.PI * r;
  const filled = (value / 100) * circumference;
  return (
    <svg width="110" height="60" viewBox="0 0 110 60">
      <path d="M 8 58 A 47 47 0 0 1 102 58" fill="none" stroke="rgba(26,26,26,0.06)" strokeWidth="10" strokeLinecap="round" />
      <path d="M 8 58 A 47 47 0 0 1 102 58" fill="none"
        stroke="url(#retGrad)" strokeWidth="10" strokeLinecap="round"
        strokeDasharray={`${(value / 100) * 147} 147`}
      />
      <defs>
        <linearGradient id="retGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#FCAE91" />
          <stop offset="100%" stopColor="#F5866E" />
        </linearGradient>
      </defs>
      <text x="55" y="52" textAnchor="middle" fontSize="18" fontWeight="800" fontFamily="Manrope" fill="var(--text)">{value}%</text>
    </svg>
  );
}

// ─── ИЛЛЮСТРАЦИЯ: АНАЛИТИКА ───────────────────────────────────────────────────
function AnalyticsIllus() {
  return (
    <svg width="120" height="80" viewBox="0 0 120 80" style={{ position: 'absolute', right: '24px', top: '50%', transform: 'translateY(-50%)', opacity: 0.8 }}>
      {/* Фоновый круг */}
      <circle cx="90" cy="40" r="34" fill="rgba(252,174,145,0.08)" />
      {/* Пунктирная орбита */}
      <circle cx="90" cy="40" r="28" fill="none" stroke="rgba(252,174,145,0.2)" strokeWidth="1" strokeDasharray="4 3" />
      {/* Столбики */}
      <rect x="6" y="46" width="10" height="24" rx="3" fill="rgba(252,174,145,0.25)" />
      <rect x="20" y="34" width="10" height="36" rx="3" fill="rgba(252,174,145,0.45)" />
      <rect x="34" y="22" width="10" height="48" rx="3" fill="rgba(252,174,145,0.7)" />
      <rect x="48" y="30" width="10" height="40" rx="3" fill="rgba(252,174,145,0.55)" />
      {/* Линия тренда */}
      <polyline points="11,46 25,34 39,22 53,30" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {/* Точки на линии */}
      {[[11,46],[25,34],[39,22],[53,30]].map(([x,y],i) => (
        <circle key={i} cx={x} cy={y} r="3" fill="var(--accent)" stroke="white" strokeWidth="1.5" />
      ))}
      {/* Доп. элементы справа */}
      <circle cx="90" cy="40" r="16" fill="rgba(252,174,145,0.15)" stroke="rgba(252,174,145,0.3)" strokeWidth="1.5" />
      <text x="90" y="45" textAnchor="middle" fontSize="11" fontWeight="800" fontFamily="Manrope" fill="var(--accent)">+18%</text>
    </svg>
  );
}

// ─── ИЛЛЮСТРАЦИЯ: ПРОДАЖИ ─────────────────────────────────────────────────────
function SalesIllus() {
  return (
    <svg width="110" height="70" viewBox="0 0 110 70" style={{ position: 'absolute', right: '20px', top: '50%', transform: 'translateY(-50%)', opacity: 0.75 }}>
      <circle cx="75" cy="35" r="30" fill="rgba(252,174,145,0.07)" />
      {/* Кольцевой прогресс */}
      <circle cx="75" cy="35" r="22" fill="none" stroke="rgba(252,174,145,0.12)" strokeWidth="8" />
      <circle cx="75" cy="35" r="22" fill="none" stroke="rgba(252,174,145,0.6)" strokeWidth="8"
        strokeDasharray="83 55" strokeLinecap="round" transform="rotate(-90 75 35)" />
      <circle cx="75" cy="35" r="22" fill="none" stroke="rgba(91,171,114,0.5)" strokeWidth="8"
        strokeDasharray="34 104" strokeLinecap="round" transform="rotate(63 75 35)" />
      <circle cx="75" cy="35" r="22" fill="none" stroke="rgba(74,128,196,0.4)" strokeWidth="8"
        strokeDasharray="21 117" strokeLinecap="round" transform="rotate(153 75 35)" />
      {/* Горизонтальные бары слева */}
      {[['Абон.', 59, '#FCAE91'], ['Разов.', 24, '#5BAB72'], ['Доп.', 17, '#4A80C4']].map(([label, pct, color], i) => (
        <g key={i}>
          <text x={0} y={16 + i * 20} fontSize="9" fill="var(--text3)" fontFamily="Manrope" fontWeight="600">{label as string}</text>
          <rect x={0} y={20 + i * 20} width="48" height="5" rx="2.5" fill="rgba(26,26,26,0.06)" />
          <rect x={0} y={20 + i * 20} width={48 * (pct as number) / 100} height="5" rx="2.5" fill={color as string} opacity="0.7" />
        </g>
      ))}
    </svg>
  );
}

// ─── ИЛЛЮСТРАЦИЯ: ТРЕНЕР ─────────────────────────────────────────────────────
function TrainerIllus({ color }: { color: string }) {
  return (
    <svg width="48" height="48" viewBox="0 0 48 48">
      <circle cx="24" cy="24" r="24" fill={`${color}22`} />
      <circle cx="24" cy="18" r="8" fill={`${color}55`} stroke={color} strokeWidth="1.5" />
      <path d="M10 40 Q10 30 24 30 Q38 30 38 40" fill={`${color}40`} stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      {/* Звёздочка */}
      <circle cx="36" cy="10" r="7" fill={color} opacity="0.9" />
      <text x="36" y="14" textAnchor="middle" fontSize="9" fontWeight="800" fontFamily="Manrope" fill="white">★</text>
    </svg>
  );
}

// ─── ИЛЛЮСТРАЦИЯ: СОБЫТИЕ ─────────────────────────────────────────────────────
function EventIllus({ color }: { color: string }) {
  return (
    <svg width="44" height="44" viewBox="0 0 44 44">
      <rect x="2" y="6" width="40" height="36" rx="8" fill={`${color}15`} stroke={`${color}40`} strokeWidth="1.5" />
      <line x1="14" y1="2" x2="14" y2="10" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <line x1="30" y1="2" x2="30" y2="10" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <line x1="6" y1="18" x2="38" y2="18" stroke={`${color}50`} strokeWidth="1.5" />
      <rect x="10" y="24" width="8" height="8" rx="2" fill={`${color}60`} />
      <rect x="22" y="24" width="8" height="8" rx="2" fill={`${color}30`} />
    </svg>
  );
}

// ─── ВКЛ/ВЫКЛ СТРОК ──────────────────────────────────────────────────────────
function ExpandRow({ children, label }: { children: React.ReactNode; label: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <div onClick={() => setOpen(!open)} style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        cursor: 'pointer', padding: '12px 0', borderBottom: '1px solid var(--border)',
        userSelect: 'none',
      }}>
        <span style={{ fontSize: '13px', fontWeight: 600 }}>{label}</span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" strokeWidth="2"
          style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </div>
      {open && (
        <div style={{ padding: '12px 0 8px', animation: 'fadeSlide 0.2s ease' }}>
          {children}
        </div>
      )}
    </div>
  );
}

// ─── ПРОГРЕСС-БАР ─────────────────────────────────────────────────────────────
function ProgressBar({ value, color = 'var(--accent)', height = 5 }: { value: number; color?: string; height?: number }) {
  return (
    <div style={{ background: 'rgba(26,26,26,0.06)', borderRadius: '99px', height, overflow: 'hidden' }}>
      <div style={{
        width: `${value}%`, height: '100%', background: color,
        borderRadius: '99px', transition: 'width 0.8s cubic-bezier(0.34,1.2,0.64,1)',
      }} />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// ─── ТАБ: ОСНОВНЫЕ ────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════
function TabOsnovnye({ period }: { period: Period }) {
  const multipliers: Record<Period, number> = { day: 0.037, week: 0.19, month: 1, year: 12 };
  const m = multipliers[period];
  const fmt = (v: number) => {
    const n = Math.round(v * m);
    if (n >= 1000) return `₽${(n / 1000).toFixed(n >= 100000 ? 0 : 1)}M`.replace('.0', '');
    return `₽${n}K`;
  };

  return (
    <>
      {/* Метрики */}
      <div className="report-metrics" style={{ marginBottom: '20px' }}>
        {[
          { label: 'Выручка', value: fmt(284), change: '+18%', up: true, icon: <Icon.Ruble /> },
          { label: 'Занятий', value: `${Math.round(318 * m)}`, change: `+${Math.round(24 * m)}`, up: true, icon: <Icon.Calendar /> },
          { label: 'Средний чек', value: '₽1 890', change: '+5.2%', up: true, icon: <Icon.Zap /> },
          { label: 'Новые клиенты', value: `${Math.round(12 * m)}`, change: period === 'day' ? '−1' : '−2', up: false, icon: <Icon.Users /> },
          { label: 'Удержание', value: '87%', change: '+3%', up: true, icon: <Icon.Heart /> },
        ].map(({ label, value, change, up, icon }) => (
          <div className="stat-card" key={label} style={{ cursor: 'pointer' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
              <div style={{ fontSize: '11px', color: 'var(--text3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.4px' }}>{label}</div>
              <div style={{ color: 'rgba(252,174,145,0.6)', opacity: 0.7 }}>{icon}</div>
            </div>
            <div style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.5px', marginBottom: '4px' }}>{value}</div>
            <div style={{
              fontSize: '11px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '3px',
              color: up ? '#5BAB72' : '#D88C9A',
            }}>
              {up ? <Icon.TrendUp /> : <Icon.TrendDown />} {change}
            </div>
          </div>
        ))}
      </div>

      {/* Графики */}
      <div className="grid-2" style={{ marginBottom: '20px' }}>

        {/* Свечки */}
        <div className="card" style={{ position: 'relative', overflow: 'hidden' }}>
          <AnalyticsIllus />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <div>
              <div style={{ fontSize: '14px', fontWeight: 700 }}>Выручка по периодам</div>
              <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '2px' }}>Наведи на свечку — увидишь детали</div>
            </div>
          </div>
          <CandleChart period={period} />
        </div>

        {/* Структура + retention */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Доп метрики */}
          <div className="card" style={{ flex: 1 }}>
            <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '14px' }}>Удержание клиентов</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
              <RetentionArc value={87} />
              <div style={{ flex: 1 }}>
                {[
                  { label: 'Вернулись во 2-й раз', val: 94, color: 'var(--accent)' },
                  { label: 'Регулярные (6+ мес)', val: 71, color: '#5BAB72' },
                  { label: 'Отток за месяц', val: 13, color: '#D88C9A' },
                ].map(({ label, val, color }) => (
                  <div key={label} style={{ marginBottom: '10px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <span style={{ fontSize: '11px', color: 'var(--text2)', fontWeight: 600 }}>{label}</span>
                      <span style={{ fontSize: '11px', fontWeight: 800, color }}>{val}%</span>
                    </div>
                    <ProgressBar value={val} color={color} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Структура доходов */}
      <div className="card" style={{ marginBottom: '20px' }}>
        <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '16px' }}>Структура доходов</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '32px' }}>
          <svg width="150" height="150" viewBox="0 0 140 140">
            <circle cx="70" cy="70" r="52" fill="none" stroke="rgba(252,174,145,0.1)" strokeWidth="18" />
            <circle cx="70" cy="70" r="52" fill="none" stroke="#FCAE91" strokeWidth="18" strokeDasharray="196 130" strokeLinecap="round" transform="rotate(-90 70 70)" />
            <circle cx="70" cy="70" r="52" fill="none" stroke="#5BAB72" strokeWidth="18" strokeDasharray="80 246" strokeLinecap="round" transform="rotate(63 70 70)" />
            <circle cx="70" cy="70" r="52" fill="none" stroke="#4A80C4" strokeWidth="18" strokeDasharray="50 276" strokeLinecap="round" transform="rotate(152 70 70)" />
            <circle cx="70" cy="70" r="52" fill="none" stroke="#f0c040" strokeWidth="18" strokeDasharray="6 320" strokeLinecap="round" transform="rotate(207 70 70)" />
            <text x="70" y="66" textAnchor="middle" fontSize="18" fontWeight="800" fontFamily="Manrope" fill="var(--text)">₽284K</text>
            <text x="70" y="82" textAnchor="middle" fontSize="10" fill="#999" fontFamily="Manrope">всего</text>
          </svg>
          <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            {[
              { color: '#FCAE91', label: 'Абонементы', pct: 59, val: '₽167K' },
              { color: '#5BAB72', label: 'Разовые', pct: 24, val: '₽68K' },
              { color: '#4A80C4', label: 'Доп. услуги', pct: 15, val: '₽43K' },
              { color: '#f0c040', label: 'Товары', pct: 2, val: '₽6K' },
            ].map(({ color, label, pct, val }) => (
              <div key={label} style={{
                background: 'var(--bg)', borderRadius: '10px', padding: '12px',
                border: '1px solid var(--border)', transition: 'all 0.2s',
                cursor: 'pointer',
              }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = color; (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLElement).style.transform = 'none'; }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                  <div style={{ width: '8px', height: '8px', borderRadius: '2px', background: color, flexShrink: 0 }} />
                  <span style={{ fontSize: '11px', color: 'var(--text2)', fontWeight: 600 }}>{label}</span>
                </div>
                <div style={{ fontSize: '18px', fontWeight: 800 }}>{val}</div>
                <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '2px' }}>{pct}% от общего</div>
                <ProgressBar value={pct} color={color} height={3} />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* NPS-блок */}
      <div className="card">
        <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '14px' }}>Показатели качества</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
          {[
            { label: 'NPS', value: '72', sub: 'Net Promoter Score', color: '#5BAB72', icon: <Icon.Award /> },
            { label: 'Загрузка', value: '78%', sub: 'Зал занят в среднем', color: 'var(--accent)', icon: <Icon.Zap /> },
            { label: 'Рейтинг', value: '4.8', sub: '214 отзыва', color: '#f0c040', icon: <Icon.Star /> },
            { label: 'Отменено', value: '4.2%', sub: 'Занятий отменено', color: '#D88C9A', icon: <Icon.TrendDown /> },
          ].map(({ label, value, sub, color, icon }) => (
            <div key={label} style={{
              background: 'var(--bg)', borderRadius: 'var(--radius-sm)', padding: '14px 16px',
              border: '1px solid var(--border)', textAlign: 'center',
              transition: 'all 0.2s', cursor: 'pointer',
            }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = color; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; }}
            >
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '6px', color: color }}>{icon}</div>
              <div style={{ fontSize: '24px', fontWeight: 800, color, letterSpacing: '-0.5px' }}>{value}</div>
              <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '3px', fontWeight: 600 }}>{sub}</div>
              <div style={{ fontSize: '10px', color: 'var(--text3)', opacity: 0.7, marginTop: '2px' }}>{label}</div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// ─── ТАБ: ПО ПРОДАЖАМ ─────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════
function TabProdazhi({ period }: { period: Period }) {
  const [selected, setSelected] = useState<number | null>(null);

  return (
    <>
      {/* Хэдер-иллюстрация */}
      <div className="finance-illus" style={{ marginBottom: '20px', position: 'relative', overflow: 'hidden' }}>
        <SalesIllus />
        <div style={{ zIndex: 1 }}>
          <div style={{ fontSize: '11px', color: 'var(--text3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>Общая выручка ({PERIOD_LABELS[period].toLowerCase()})</div>
          <div style={{ fontSize: '42px', fontWeight: 800, letterSpacing: '-2px' }}>
            {period === 'day' ? '₽10.5K' : period === 'week' ? '₽53K' : period === 'year' ? '₽3.4M' : '₽284K'}
          </div>
          <div style={{ display: 'flex', gap: '20px', marginTop: '10px' }}>
            <div><div style={{ fontSize: '18px', fontWeight: 800, color: '#5BAB72' }}>+18%</div><div style={{ fontSize: '10px', color: 'var(--text3)', fontWeight: 600 }}>vs прошлый</div></div>
            <div><div style={{ fontSize: '18px', fontWeight: 800 }}>140</div><div style={{ fontSize: '10px', color: 'var(--text3)', fontWeight: 600 }}>транзакций</div></div>
            <div><div style={{ fontSize: '18px', fontWeight: 800 }}>₽2 030</div><div style={{ fontSize: '10px', color: 'var(--text3)', fontWeight: 600 }}>средний чек</div></div>
          </div>
        </div>
      </div>

      {/* Топ продуктов */}
      <div className="card" style={{ marginBottom: '20px' }}>
        <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '16px' }}>Продажи по продуктам</div>
        {SALES_DATA.map((row, i) => (
          <div key={i} onClick={() => setSelected(selected === i ? null : i)}
            style={{
              display: 'flex', alignItems: 'center', gap: '12px', padding: '12px',
              borderRadius: '10px', cursor: 'pointer', marginBottom: '4px',
              background: selected === i ? 'rgba(252,174,145,0.08)' : 'transparent',
              border: `1px solid ${selected === i ? 'rgba(252,174,145,0.3)' : 'transparent'}`,
              transition: 'all 0.18s',
            }}>
            {/* Ранг */}
            <div style={{
              width: '24px', height: '24px', borderRadius: '6px', flexShrink: 0,
              background: i === 0 ? 'linear-gradient(135deg,#f0c040,#f5a623)' : i === 1 ? 'rgba(252,174,145,0.3)' : 'rgba(26,26,26,0.06)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '11px', fontWeight: 800,
              color: i === 0 ? 'white' : i === 1 ? 'var(--accent)' : 'var(--text3)',
            }}>{i + 1}</div>
            {/* Инфо */}
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px' }}>
                <span style={{ fontSize: '13px', fontWeight: 700 }}>{row.label}</span>
                {row.badge && (
                  <span style={{
                    fontSize: '9px', fontWeight: 800, padding: '1px 6px', borderRadius: '20px',
                    background: row.badge === 'ТОП' ? 'rgba(240,192,64,0.2)' : row.badge === 'РОСТ' ? 'rgba(91,171,114,0.2)' : 'rgba(252,174,145,0.2)',
                    color: row.badge === 'ТОП' ? '#c68a00' : row.badge === 'РОСТ' ? '#4a8a52' : '#d06040',
                  }}>{row.badge}</span>
                )}
              </div>
              <ProgressBar value={Math.round((parseInt(row.revenue.replace(/[₽K]/g,'')) / parseInt(SALES_DATA[0].revenue.replace(/[₽K]/g,''))) * 100)} height={3} />
            </div>
            {/* Метрики */}
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '14px', fontWeight: 800 }}>{row.revenue}</div>
              <div style={{ fontSize: '10px', color: 'var(--text3)' }}>{row.count} прод. · {row.avg}/шт</div>
            </div>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" strokeWidth="2"
              style={{ transform: selected === i ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', flexShrink: 0 }}>
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </div>
        ))}
      </div>

      {/* Динамика чека */}
      <div className="grid-2">
        <div className="card">
          <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '12px' }}>Средний чек по дням</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '6px', height: '100px' }}>
            {[1800, 2200, 1950, 2400, 2100, 1700, 2800].map((v, i) => (
              <div key={i} style={{
                flex: 1, borderRadius: '4px 4px 0 0', transition: 'all 0.2s',
                height: `${(v / 2800) * 100}%`,
                background: v === 2800 ? 'var(--accent)' : v === 1700 ? 'rgba(216,140,154,0.4)' : 'rgba(252,174,145,0.3)',
                cursor: 'pointer',
              }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.opacity = '0.7'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = '1'; }}
                title={`₽${v}`}
              />
            ))}
          </div>
          <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
            {['Пн','Вт','Ср','Чт','Пт','Сб','Вс'].map(d => (
              <div key={d} style={{ flex: 1, textAlign: 'center', fontSize: '10px', color: 'var(--text3)', fontWeight: 600 }}>{d}</div>
            ))}
          </div>
        </div>
        <div className="card">
          <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '12px' }}>Способы оплаты</div>
          {[
            { label: 'Карта онлайн', pct: 54, color: 'var(--accent)', val: '₽153K' },
            { label: 'Наличные', pct: 24, color: '#5BAB72', val: '₽68K' },
            { label: 'Карта на месте', pct: 18, color: '#4A80C4', val: '₽51K' },
            { label: 'Перевод', pct: 4, color: '#D88C9A', val: '₽11K' },
          ].map(({ label, pct, color, val }) => (
            <div key={label} style={{ marginBottom: '10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text2)' }}>{label}</span>
                <span style={{ fontSize: '12px', fontWeight: 800 }}>{val} <span style={{ color: 'var(--text3)', fontWeight: 500 }}>({pct}%)</span></span>
              </div>
              <ProgressBar value={pct} color={color} height={5} />
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// ─── ТАБ: ПО ТРЕНЕРАМ ─────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════
function TabTrenery({ period }: { period: Period }) {
  const [selected, setSelected] = useState<number>(0);
  const t = TRAINER_DATA[selected];

  return (
    <>
      {/* Сетка тренеров */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '20px' }}>
        {TRAINER_DATA.map((trainer, i) => (
          <div key={i} onClick={() => setSelected(i)} style={{
            background: 'var(--card)', border: `1px solid ${selected === i ? trainer.color : 'var(--border)'}`,
            borderRadius: 'var(--radius-lg)', padding: '18px', cursor: 'pointer',
            boxShadow: selected === i ? `0 0 0 3px ${trainer.color}25, var(--dash-shadow)` : 'var(--dash-shadow)',
            transition: 'all 0.2s cubic-bezier(0.34,1.2,0.64,1)',
            transform: selected === i ? 'translateY(-2px)' : 'none',
            position: 'relative', overflow: 'hidden',
          }}>
            {/* Декор */}
            <div style={{
              position: 'absolute', top: 0, left: 0, right: 0, height: '3px',
              background: selected === i ? trainer.color : 'transparent', transition: 'background 0.2s',
            }} />
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
              <TrainerIllus color={trainer.color} />
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '13px', fontWeight: 700 }}>{trainer.name.split(' ')[0]}</div>
                <div style={{ fontSize: '11px', color: 'var(--text3)' }}>{trainer.role}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                <Icon.Star /><span style={{ fontSize: '12px', fontWeight: 700 }}>{trainer.rating}</span>
              </div>
              <div style={{ width: '100%', textAlign: 'center' }}>
                <div style={{ fontSize: '16px', fontWeight: 800, color: trainer.color }}>{trainer.revenue}</div>
                <div style={{ fontSize: '10px', color: 'var(--text3)', fontWeight: 600 }}>{trainer.sessions} занятий</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Детальный блок выбранного тренера */}
      <div className="card" style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '20px' }}>
          <TrainerIllus color={t.color} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '16px', fontWeight: 800 }}>{t.name}</div>
            <div style={{ fontSize: '12px', color: 'var(--text3)' }}>{t.role} · {period === 'day' ? 'сегодня' : period === 'week' ? 'эта неделя' : period === 'month' ? 'этот месяц' : 'этот год'}</div>
          </div>
          <div style={{ display: 'flex', gap: '24px' }}>
            {[
              { label: 'Занятий', val: t.sessions },
              { label: 'Выручка', val: t.revenue },
              { label: 'Удержание', val: `${t.retention}%` },
              { label: 'Рейтинг', val: t.rating },
            ].map(({ label, val }) => (
              <div key={label} style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '20px', fontWeight: 800, color: t.color }}>{val}</div>
                <div style={{ fontSize: '10px', color: 'var(--text3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px' }}>{label}</div>
              </div>
            ))}
          </div>
        </div>
        {/* Загрузка по дням */}
        <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text2)', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Загрузка по дням</div>
        <div style={{ display: 'flex', gap: '6px', height: '60px', alignItems: 'flex-end' }}>
          {[70, 85, 60, 95, 80, 45, 100, 75, 90, 55, 88, 72, 65, 92].map((v, i) => (
            <div key={i} style={{
              flex: 1, borderRadius: '3px 3px 0 0',
              height: `${v}%`, background: v === 100 ? t.color : `${t.color}55`,
              transition: 'all 0.2s', cursor: 'pointer',
            }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = t.color; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = v === 100 ? t.color : `${t.color}55`; }}
              title={`${v}% загрузки`}
            />
          ))}
        </div>

        {/* Прогресс по KPI */}
        <div style={{ marginTop: '20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          {[
            { label: 'Выполнение плана', val: 94, color: t.color },
            { label: 'Удержание клиентов', val: t.retention, color: '#5BAB72' },
            { label: 'Заполняемость групп', val: 82, color: '#4A80C4' },
            { label: 'Отмены занятий', val: 6, color: '#D88C9A' },
          ].map(({ label, val, color }) => (
            <div key={label}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text2)' }}>{label}</span>
                <span style={{ fontSize: '12px', fontWeight: 800, color }}>{val}%</span>
              </div>
              <ProgressBar value={val} color={color} height={6} />
            </div>
          ))}
        </div>
      </div>

      {/* Сравнение тренеров */}
      <div className="card">
        <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '14px' }}>Сравнение по выручке</div>
        {TRAINER_DATA.map((tr, i) => (
          <div key={i} style={{ marginBottom: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
              <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: tr.color, flexShrink: 0 }} />
              <span style={{ fontSize: '12px', fontWeight: 600, width: '130px' }}>{tr.name}</span>
              <div style={{ flex: 1 }}>
                <ProgressBar value={Math.round(tr.sessions / TRAINER_DATA[0].sessions * 100)} color={tr.color} height={7} />
              </div>
              <span style={{ fontSize: '13px', fontWeight: 800, width: '60px', textAlign: 'right' }}>{tr.revenue}</span>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// ─── ТАБ: ПО УСЛУГАМ ──────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════
function TabUslugi({ period }: { period: Period }) {
  const [hovered, setHovered] = useState<number | null>(null);

  return (
    <>
      <div className="grid-2" style={{ marginBottom: '20px' }}>
        {/* Карточки услуг */}
        {SERVICE_DATA.map((svc, i) => (
          <div key={i} className="card" style={{
            cursor: 'pointer', position: 'relative', overflow: 'hidden',
            transition: 'all 0.2s cubic-bezier(0.34,1.2,0.64,1)',
            transform: hovered === i ? 'translateY(-3px)' : 'none',
            boxShadow: hovered === i ? `0 12px 32px -8px ${svc.color}40, var(--dash-shadow)` : 'var(--dash-shadow)',
            border: `1px solid ${hovered === i ? svc.color + '60' : 'var(--border)'}`,
          }}
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => setHovered(null)}
          >
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', background: svc.color }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
              <div>
                <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '3px' }}>{svc.name}</div>
                <div style={{
                  fontSize: '10px', fontWeight: 700, padding: '2px 7px', borderRadius: '20px',
                  background: svc.trend.startsWith('+') ? 'rgba(91,171,114,0.15)' : 'rgba(216,140,154,0.15)',
                  color: svc.trend.startsWith('+') ? '#4a8a52' : '#b25d6e', display: 'inline-block',
                }}>{svc.trend}</div>
              </div>
              {/* Мини-пончик */}
              <svg width="52" height="52" viewBox="0 0 52 52">
                <circle cx="26" cy="26" r="20" fill="none" stroke={`${svc.color}20`} strokeWidth="7" />
                <circle cx="26" cy="26" r="20" fill="none" stroke={svc.color} strokeWidth="7"
                  strokeDasharray={`${svc.share * 1.257} ${125.66 - svc.share * 1.257}`}
                  strokeLinecap="round" transform="rotate(-90 26 26)" />
                <text x="26" y="30" textAnchor="middle" fontSize="11" fontWeight="800" fontFamily="Manrope" fill="var(--text)">{svc.share}%</text>
              </svg>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <div style={{ background: 'var(--bg)', borderRadius: '8px', padding: '8px 10px' }}>
                <div style={{ fontSize: '16px', fontWeight: 800, color: svc.color }}>{svc.revenue}</div>
                <div style={{ fontSize: '10px', color: 'var(--text3)', fontWeight: 600 }}>выручка</div>
              </div>
              <div style={{ background: 'var(--bg)', borderRadius: '8px', padding: '8px 10px' }}>
                <div style={{ fontSize: '16px', fontWeight: 800 }}>{svc.sessions}</div>
                <div style={{ fontSize: '10px', color: 'var(--text3)', fontWeight: 600 }}>занятий</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Детальная таблица */}
      <div className="card">
        <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '16px' }}>Детализация по услугам</div>
        <div style={{
          display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 80px',
          gap: '12px', padding: '0 0 10px', borderBottom: '1px solid var(--border)',
          fontSize: '10px', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.4px',
        }}>
          <span>Услуга</span><span style={{ textAlign: 'right' }}>Занятий</span>
          <span style={{ textAlign: 'right' }}>Выручка</span>
          <span style={{ textAlign: 'right' }}>Средний чек</span>
          <span style={{ textAlign: 'right' }}>Динамика</span>
        </div>
        {SERVICE_DATA.map((svc, i) => (
          <div key={i} style={{
            display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 80px',
            gap: '12px', padding: '12px 0', borderBottom: '1px solid var(--border)',
            alignItems: 'center', cursor: 'pointer',
            transition: 'background 0.15s',
          }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = `${svc.color}08`; (e.currentTarget as HTMLElement).style.borderRadius = '8px'; (e.currentTarget as HTMLElement).style.padding = '12px 8px'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.padding = '12px 0'; }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ width: '8px', height: '8px', borderRadius: '2px', background: svc.color, flexShrink: 0 }} />
              <span style={{ fontSize: '13px', fontWeight: 600 }}>{svc.name}</span>
            </div>
            <span style={{ fontSize: '13px', fontWeight: 700, textAlign: 'right' }}>{svc.sessions}</span>
            <span style={{ fontSize: '13px', fontWeight: 700, textAlign: 'right' }}>{svc.revenue}</span>
            <span style={{ fontSize: '13px', fontWeight: 700, textAlign: 'right', color: 'var(--text2)' }}>
              {`₽${Math.round(parseInt(svc.revenue.replace(/[₽K]/g,'')) * 1000 / svc.sessions)}`}
            </span>
            <div style={{
              textAlign: 'right', fontSize: '11px', fontWeight: 800,
              color: svc.trend.startsWith('+') ? '#5BAB72' : '#D88C9A',
            }}>{svc.trend}</div>
          </div>
        ))}
      </div>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// ─── ТАБ: ВСЕ ─────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════
function TabAll({ period }: { period: Period }) {
  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '20px' }}>
        {[
          { title: 'Клиенты', icon: <Icon.Users />, stats: [{ l: 'Всего', v: '142' }, { l: 'Активных', v: '89' }, { l: 'Новых', v: '12' }, { l: 'Отток', v: '4' }], color: 'var(--accent)' },
          { title: 'Занятия', icon: <Icon.Calendar />, stats: [{ l: 'Проведено', v: '318' }, { l: 'Отменено', v: '14' }, { l: 'Ср. чел.', v: '8.2' }, { l: 'Загрузка', v: '78%' }], color: '#5BAB72' },
          { title: 'Финансы', icon: <Icon.Ruble />, stats: [{ l: 'Выручка', v: '₽284K' }, { l: 'Расходы', v: '₽112K' }, { l: 'Прибыль', v: '₽172K' }, { l: 'Маржа', v: '60.6%' }], color: '#4A80C4' },
        ].map(({ title, icon, stats, color }) => (
          <div key={title} className="card">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', color }}>
              {icon}<span style={{ fontSize: '14px', fontWeight: 700 }}>{title}</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              {stats.map(({ l, v }) => (
                <div key={l} style={{ background: 'var(--bg)', borderRadius: '8px', padding: '10px' }}>
                  <div style={{ fontSize: '16px', fontWeight: 800 }}>{v}</div>
                  <div style={{ fontSize: '10px', color: 'var(--text3)', fontWeight: 600, marginTop: '2px' }}>{l}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Общая лента активности */}
      <div className="card">
        <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '16px' }}>Лента активности за {PERIOD_LABELS[period].toLowerCase()}</div>
        {[
          { icon: <Icon.Users />, text: 'Новый клиент Мария Коваленко — оплатила абонемент на 8 занятий', time: '14:32', color: '#5BAB72' },
          { icon: <Icon.Calendar />, text: 'Групповой пилатес в 11:00 — заполнен на 100% (8/8 мест)', time: '11:02', color: 'var(--accent)' },
          { icon: <Icon.Ruble />, text: 'Выручка перевалила отметку ₽280K за месяц', time: '09:44', color: '#4A80C4' },
          { icon: <Icon.Heart />, text: 'Анна Соколова оставила отзыв ★★★★★', time: 'Вчера', color: '#f0c040' },
          { icon: <Icon.Award />, text: 'Тренер Анна Смирнова выполнила план продаж на 94%', time: 'Вчера', color: 'var(--accent)' },
          { icon: <Icon.Package />, text: 'Продан подарочный сертификат на ₽5 000', time: '3 дня назад', color: '#D88C9A' },
        ].map(({ icon, text, time, color }, i) => (
          <div key={i} style={{
            display: 'flex', gap: '12px', padding: '12px 0',
            borderBottom: i < 5 ? '1px solid var(--border)' : 'none',
          }}>
            <div style={{
              width: '32px', height: '32px', borderRadius: '8px', flexShrink: 0,
              background: `${color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', color,
            }}>{icon}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '13px', color: 'var(--text2)' }}>{text}</div>
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text3)', whiteSpace: 'nowrap', flexShrink: 0, marginTop: '2px' }}>{time}</div>
          </div>
        ))}
      </div>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// ─── ТАБ: СОБЫТИЯ ─────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════
function TabSobytiya({ period }: { period: Period }) {
  const [expanded, setExpanded] = useState<number | null>(null);

  return (
    <>
      {/* Сводка */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '20px' }}>
        {[
          { label: 'Мероприятий', val: '5', sub: 'за период', color: 'var(--accent)' },
          { label: 'Участников', val: '65', sub: 'суммарно', color: '#5BAB72' },
          { label: 'Выручка', val: '₽51K', sub: 'от событий', color: '#4A80C4' },
          { label: 'Предстоит', val: '2', sub: 'в ближайшем', color: '#f0c040' },
        ].map(({ label, val, sub, color }) => (
          <div key={label} className="stat-card">
            <div style={{ fontSize: '11px', color: 'var(--text3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '6px' }}>{label}</div>
            <div style={{ fontSize: '26px', fontWeight: 800, color, letterSpacing: '-0.5px' }}>{val}</div>
            <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '3px' }}>{sub}</div>
          </div>
        ))}
      </div>

      {/* Список событий */}
      <div className="card">
        <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '16px' }}>Все события</div>
        {EVENTS_DATA.map((ev, i) => (
          <div key={i}>
            <div onClick={() => setExpanded(expanded === i ? null : i)} style={{
              display: 'flex', alignItems: 'center', gap: '14px',
              padding: '14px', borderRadius: '10px', cursor: 'pointer',
              background: expanded === i ? `${ev.color}08` : 'transparent',
              border: `1px solid ${expanded === i ? ev.color + '30' : 'transparent'}`,
              transition: 'all 0.18s', marginBottom: '6px',
            }}>
              <EventIllus color={ev.color} />
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 700 }}>{ev.title}</span>
                  <span style={{
                    fontSize: '10px', fontWeight: 700, padding: '2px 7px', borderRadius: '20px',
                    background: ev.status === 'Завершено' ? 'rgba(163,201,168,0.2)' : 'rgba(252,174,145,0.2)',
                    color: ev.status === 'Завершено' ? '#4a8a52' : '#d06040',
                  }}>{ev.status}</span>
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text3)' }}>{ev.date} · {ev.type}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '14px', fontWeight: 800, color: ev.color }}>{ev.revenue}</div>
                <div style={{ fontSize: '11px', color: 'var(--text3)' }}>{ev.attendees} участников</div>
              </div>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" strokeWidth="2"
                style={{ transform: expanded === i ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', flexShrink: 0 }}>
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </div>

            {/* Раскрытая детализация */}
            {expanded === i && (
              <div style={{
                padding: '14px 16px', marginBottom: '10px', background: `${ev.color}05`,
                border: `1px solid ${ev.color}20`, borderRadius: '10px',
                animation: 'fadeSlide 0.2s ease',
              }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '14px' }}>
                  {[
                    { l: 'Дата', v: ev.date },
                    { l: 'Тип', v: ev.type },
                    { l: 'Статус', v: ev.status },
                    { l: 'Участников', v: `${ev.attendees}` },
                    { l: 'Выручка', v: ev.revenue },
                    { l: 'Тренер', v: 'Анна Смирнова' },
                  ].map(({ l, v }) => (
                    <div key={l} style={{ background: 'var(--bg)', borderRadius: '8px', padding: '10px 12px' }}>
                      <div style={{ fontSize: '10px', color: 'var(--text3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '3px' }}>{l}</div>
                      <div style={{ fontSize: '13px', fontWeight: 700 }}>{v}</div>
                    </div>
                  ))}
                </div>
                {ev.status === 'Завершено' && ev.attendees > 0 && (
                  <div>
                    <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '8px' }}>Отзывы</div>
                    <div style={{ display: 'flex', gap: '4px', marginBottom: '8px' }}>
                      {[1,2,3,4,5].map(n => <Icon.Star key={n} />)}<span style={{ fontSize: '13px', fontWeight: 800, marginLeft: '6px' }}>4.9</span>
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text2)', fontStyle: 'italic' }}>"Отличное мероприятие, очень профессионально! Обязательно приду снова."</div>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// ─── ГЛАВНЫЙ КОМПОНЕНТ ────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════
export default function Reports() {
  const [activeTab, setActiveTab] = useState<Tab>('Основные');
  const [period, setPeriod] = useState<Period>('month');

  const TABS: Tab[] = ['Основные', 'По продажам', 'По тренерам', 'По услугам', 'Все', 'События'];
  const showPeriod = activeTab !== 'Основные';

  return (
    <>
      <style>{`
        @keyframes tooltipIn { from { opacity:0; transform:translateY(4px) scale(0.97); } to { opacity:1; transform:none; } }
        .finance-illus {
          background: linear-gradient(135deg, rgba(252,174,145,0.12) 0%, rgba(249,160,139,0.06) 100%);
          border: 1px solid rgba(252,174,145,0.2);
          border-radius: var(--radius-lg);
          padding: 28px 32px;
          display: flex;
          align-items: center;
          gap: 32px;
          position: relative;
          overflow: hidden;
          margin-bottom: 20px;
        }
      `}</style>

      {/* ─── ТАБЫ + ПЕРИОД ─── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div className="tabs" style={{ margin: 0 }}>
          {TABS.map(tab => (
            <div key={tab} className={`tab ${activeTab === tab ? 'active' : ''}`} onClick={() => setActiveTab(tab)}>
              {tab}
            </div>
          ))}
        </div>
        {showPeriod && <PeriodSelector value={period} onChange={setPeriod} />}
      </div>

      {/* ─── КОНТЕНТ ─── */}
      <div key={activeTab} style={{ animation: 'fadeSlide 0.22s ease' }}>
        {activeTab === 'Основные'    && <TabOsnovnye  period={period} />}
        {activeTab === 'По продажам' && <TabProdazhi   period={period} />}
        {activeTab === 'По тренерам' && <TabTrenery    period={period} />}
        {activeTab === 'По услугам'  && <TabUslugi     period={period} />}
        {activeTab === 'Все'         && <TabAll         period={period} />}
        {activeTab === 'События'     && <TabSobytiya    period={period} />}
      </div>
    </>
  );
}