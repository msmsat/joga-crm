import { useState, useEffect, useRef } from 'react';

// ─── ТИПЫ ──────────────────────────────────────────────────────────────────────
type ProgramKey = 'loyalty' | 'discounts' | 'certificates' | 'subscriptions' | 'referral';

interface Program {
  key: ProgramKey;
  title: string;
  desc: string;
  icon: React.JSX.Element;
  accentColor: string;
  accentBg: string;
  accentBorder: string;
  configured: boolean;
  stats?: { value: string; label: string };
}

interface DrawerConfig {
  key: ProgramKey;
  title: string;
}

// ─── MOCK СТАТИСТИКА ─────────────────────────────────────────────────────────
const chartData = [
  { month: 'Янв', revenue: 82000, clients: 64 },
  { month: 'Фев', revenue: 91000, clients: 71 },
  { month: 'Мар', revenue: 88000, clients: 68 },
  { month: 'Апр', revenue: 107000, clients: 85 },
  { month: 'Май', revenue: 124000, clients: 98 },
  { month: 'Июн', revenue: 139000, clients: 112 },
];

const totalGrowth = '+41%';
const revenueFromLoyalty = '₽139K';
const retentionRate = '78%';
const avgCheck = '₽4 820';

// ─── SVG ИКОНКИ ───────────────────────────────────────────────────────────────
const IconTrophy = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 9H4a2 2 0 0 1-2-2V5h4" /><path d="M18 9h2a2 2 0 0 0 2-2V5h-4" />
    <path d="M6 5h12v5a6 6 0 0 1-12 0V5Z" /><path d="M9 19v-3" /><path d="M15 19v-3" />
    <path d="M9 19h6" /><path d="M12 16a6 6 0 0 1-6-6" /><path d="M12 16a6 6 0 0 0 6-6" />
  </svg>
);

const IconPercent = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="9" cy="9" r="2.5" /><circle cx="15" cy="15" r="2.5" />
    <line x1="6" y1="18" x2="18" y2="6" />
  </svg>
);

const IconGift = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="8" width="18" height="4" rx="1" /><path d="M12 8V21" />
    <rect x="3" y="12" width="18" height="9" rx="1" />
    <path d="M12 8c0-2 1-4 3-4s3 2 3 4" /><path d="M12 8c0-2-1-4-3-4s-3 2-3 4" />
  </svg>
);

const IconSubscription = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <line x1="3" y1="9" x2="21" y2="9" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="14" x2="8" y2="14" strokeWidth="2.5" /><line x1="12" y1="14" x2="12" y2="14" strokeWidth="2.5" />
    <line x1="16" y1="14" x2="16" y2="14" strokeWidth="2.5" />
  </svg>
);

const IconShare = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
  </svg>
);

const IconSettings = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);

const IconClose = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const IconCheck = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const IconArrow = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
  </svg>
);

const IconTrend = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" />
  </svg>
);

const IconLock = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
    <circle cx="12" cy="16" r="1.5" />
  </svg>
);

// ─── SVG МИНИ-ГРАФИК ─────────────────────────────────────────────────────────
const MiniChart = ({ data, color }: { data: number[]; color: string }) => {
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const w = 80; const h = 32;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / range) * (h - 4) - 2}`).join(' ');
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.8" />
      {data.map((v, i) => (
        i === data.length - 1 ? (
          <circle key={i} cx={(i / (data.length - 1)) * w} cy={h - ((v - min) / range) * (h - 4) - 2} r="3" fill={color} />
        ) : null
      ))}
    </svg>
  );
};

// ─── ЛИНЕЙНЫЙ ГРАФИК (PREMIUM MINIMALISM) ────────────────────────────────────
// ─── ЛИНЕЙНЫЙ ГРАФИК (PREMIUM MINIMALISM & PERFECT ALIGNMENT) ────────────────
const LineChart = ({ data, color, valueKey }: { data: typeof chartData; color: string; valueKey: 'revenue' | 'clients' }) => {
  const [hovered, setHovered] = useState<number | null>(null);
  const values = data.map(d => d[valueKey]);
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;

  const W = 1000;
  const H = 240; 
  
  // Добавляем оптический отступ по бокам (40px из 1000px = 4%), 
  // чтобы крайние точки и тексты не прилипали к границам и не обрезались
  const padX = 40; 

  // Точный математический расчет координат
  const getSvgX = (i: number) => padX + (i / (values.length - 1)) * (W - padX * 2);
  const getSvgY = (v: number) => H - ((v - min) / range) * (H * 0.7) - (H * 0.15);
  
  // Перевод координаты X в проценты для абсолютного позиционирования HTML-слоев
  const getPctX = (i: number) => (getSvgX(i) / W) * 100;

  const pts = values.map((v, i) => `${getSvgX(i)},${getSvgY(v)}`).join(' ');
  const areapts = `${getSvgX(0)},${H} ` + pts + ` ${getSvgX(values.length - 1)},${H}`;

  const formatValue = (v: number) =>
    valueKey === 'revenue'
      ? `₽${v.toLocaleString('ru-RU')}`
      : `${v} чел.`;

  return (
    <div style={{ position: 'relative', width: '100%', marginTop: '16px' }} onMouseLeave={() => setHovered(null)}>

      <div style={{ position: 'relative', height: '140px' }}>
        
        {/* SVG График */}
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: '100%', height: '100%', overflow: 'visible' }}>
          <defs>
            <linearGradient id={`grad-${valueKey}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.25" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* Мягкий градиент и линия графика */}
          <polygon points={areapts} fill={`url(#grad-${valueKey})`} />
          <polyline points={pts} fill="none" stroke={color} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" style={{ filter: `drop-shadow(0 4px 8px ${color}40)` }} />

          {/* Вертикальные направляющие и точки */}
          {values.map((v, i) => {
            const cx = getSvgX(i);
            const cy = getSvgY(v);
            const isHov = hovered === i;

            return (
              <g key={i}>
                {isHov && (
                  <line x1={cx} y1={cy} x2={cx} y2={H} stroke={color} strokeWidth="2" strokeDasharray="6 6" opacity="0.4" />
                )}
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

        {/* СТРОГИЕ HTML ЗОНЫ НАВЕДЕНИЯ (Perfect Hitboxes) */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '100%' }}>
          {values.map((_, i) => (
            <div key={i} onMouseEnter={() => setHovered(i)} style={{
              position: 'absolute',
              left: `${getPctX(i)}%`,
              top: 0,
              height: '100%',
              width: `${100 / Math.max(1, values.length - 1)}%`,
              transform: 'translateX(-50%)', // Центрируем хитбокс строго по X
              cursor: 'pointer'
            }} />
          ))}
        </div>

        {/* ТУЛТИП (Всегда выровнен по центру точки) */}
        {hovered !== null && (
          <div style={{
            position: 'absolute',
            left: `${getPctX(hovered)}%`,
            top: `calc(${(getSvgY(values[hovered]) / H) * 100}% - 16px)`,
            transform: 'translate(-50%, -100%)',
            background: '#1A1A1A',
            color: '#FFFFFF',
            padding: '8px 14px',
            borderRadius: '10px',
            fontSize: '13px',
            fontWeight: 800,
            letterSpacing: '-0.3px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
            pointerEvents: 'none',
            zIndex: 10,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: "'Manrope', sans-serif",
            whiteSpace: 'nowrap'
          }}>
            {formatValue(values[hovered])}
            <div style={{ position: 'absolute', bottom: '-4px', left: '50%', transform: 'translateX(-50%) rotate(45deg)', width: '10px', height: '10px', background: '#1A1A1A', borderRadius: '2px' }} />
          </div>
        )}
      </div>

      {/* МЕСЯЦА (С абсолютным выравниванием под точками) */}
      <div style={{ position: 'relative', height: '16px', marginTop: '16px' }}>
        {data.map((d, i) => (
          <div key={i} style={{
            position: 'absolute',
            left: `${getPctX(i)}%`,
            transform: 'translateX(-50%)', // Центр слова всегда совпадает с центром точки
            fontSize: '11px',
            fontWeight: 700,
            color: hovered === i ? '#1A1A1A' : '#999999',
            textTransform: 'uppercase',
            letterSpacing: '0.6px',
            transition: 'color 0.2s',
            textAlign: 'center'
          }}>
            {d.month}
          </div>
        ))}
      </div>

    </div>
  );
};

// ─── DRAWER КОНФИГУРАЦИИ ───────────────────────────────────────────────────────
const DrawerContent = ({
  drawerKey
}: {
  drawerKey: ProgramKey;
}) => {
  const [loyaltyExpiry, setLoyaltyExpiry] = useState('1 год');
  const [discountType, setDiscountType] = useState('Процент (%)');
  const [certType, setCertType] = useState('Подарочный');
  const [referralBonus, setReferralBonus] = useState('На депозит');
  const configs: Record<ProgramKey, React.JSX.Element> = {
    loyalty: (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
        <div>
          <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '16px' }}>Основные параметры</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div>
              <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text2)', display: 'block', marginBottom: '6px' }}>Название программы</label>
              <input defaultValue="Velora Club" style={{ width: '100%', padding: '10px 14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: '14px', boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text2)', display: 'block', marginBottom: '6px' }}>Начисление баллов (₽ за 1 балл)</label>
              <input type="number" defaultValue="100" style={{ width: '100%', padding: '10px 14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: '14px', boxSizing: 'border-box' }} />
            </div>
          </div>
        </div>
        <div>
          <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '16px' }}>Уровни</div>
          {[
            { name: 'Серебро', from: '0', to: '10 000', col: '#B0B0C0' },
            { name: 'Золото', from: '10 000', to: '50 000', col: '#f0c040' },
            { name: 'Платина', from: '50 000', to: '∞', col: '#FCAE91' },
          ].map((lvl, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', borderRadius: 'var(--radius-sm)', border: `1px solid ${lvl.col}30`, background: `${lvl.col}08`, marginBottom: '8px' }}>
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: lvl.col, flexShrink: 0 }} />
              <div style={{ flex: 1, fontSize: '13px', fontWeight: 600 }}>{lvl.name}</div>
              <div style={{ fontSize: '12px', color: 'var(--text2)' }}>₽{lvl.from} — ₽{lvl.to}</div>
            </div>
          ))}
        </div>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '16px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Срок действия</div>
            <div
              className="tooltip-wrap"
              onMouseEnter={e => {
                const box = (e.currentTarget as HTMLElement).querySelector('.tooltip-box') as HTMLElement;
                const r = e.currentTarget.getBoundingClientRect();
                box.style.top = `${r.top - 38}px`;
                box.style.left = `${r.left + r.width / 2}px`;
              }}
            >
              <div style={{ width: '15px', height: '15px', borderRadius: '50%', background: 'var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 700, color: 'var(--text3)', cursor: 'default' }}>?</div>
              <div className="tooltip-box">Срок, в течение которого клиент может использовать накопленные баллы</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            {['3 мес', '6 мес', '1 год', 'Бессрочно'].map(opt => (
              <button key={opt} onClick={() => setLoyaltyExpiry(opt)} style={{
                padding: '8px 14px', borderRadius: 'var(--radius-sm)',
                border: `1px solid ${loyaltyExpiry === opt ? 'rgba(252,174,145,0.4)' : 'var(--border)'}`,
                background: loyaltyExpiry === opt ? 'rgba(252,174,145,0.12)' : 'var(--bg)',
                color: loyaltyExpiry === opt ? '#FCAE91' : 'var(--text2)',
                fontSize: '12px', fontWeight: 600, cursor: 'pointer',
              }}>
                {opt}
              </button>
            ))}
          </div>
        </div>
      </div>
    ),
    discounts: (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
        <div>
          <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '16px' }}>Тип скидки</div>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
            {['Процент (%)', 'Фиксированная (₽)', 'Кэшбэк'].map((t) => (
              <button key={t} onClick={() => setDiscountType(t)} style={{
                padding: '8px 14px', borderRadius: 'var(--radius-sm)',
                border: `1px solid ${discountType === t ? 'rgba(91,171,114,0.4)' : 'var(--border)'}`,
                background: discountType === t ? 'rgba(91,171,114,0.1)' : 'var(--bg)',
                color: discountType === t ? '#5BAB72' : 'var(--text2)',
                fontSize: '12px', fontWeight: 600, cursor: 'pointer',
              }}>
                {t}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div>
              <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text2)', display: 'block', marginBottom: '6px' }}>Размер скидки</label>
              <input type="number" defaultValue="10" style={{ width: '100%', padding: '10px 14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: '14px', boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text2)', display: 'block', marginBottom: '6px' }}>Минимальная сумма покупки</label>
              <input type="number" placeholder="Без ограничений" style={{ width: '100%', padding: '10px 14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: '14px', boxSizing: 'border-box' }} />
            </div>
          </div>
        </div>
        <div>
          <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '16px' }}>Условия применения</div>
          {[
            'Применять ко всем услугам',
            'Суммировать с другими скидками',
            'Показывать клиенту в личном кабинете',
          ].map((opt, i) => (
            <label key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 0', cursor: 'pointer', borderBottom: i < 2 ? '1px solid var(--border)' : 'none' }}>
              <div style={{ width: '18px', height: '18px', borderRadius: '5px', background: i === 0 ? '#FCAE91' : 'var(--bg)', border: `1px solid ${i === 0 ? '#FCAE91' : 'var(--border)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: 'white' }}>
                {i === 0 && <IconCheck />}
              </div>
              <span style={{ fontSize: '13px', fontWeight: 500 }}>{opt}</span>
            </label>
          ))}
        </div>
      </div>
    ),
    certificates: (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
        <div>
          <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '16px' }}>Тип сертификата</div>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
            {['Именной', 'Подарочный', 'На услугу'].map((t) => (
              <button key={t} onClick={() => setCertType(t)} style={{
                padding: '8px 14px', borderRadius: 'var(--radius-sm)',
                border: `1px solid ${certType === t ? 'rgba(74,128,196,0.4)' : 'var(--border)'}`,
                background: certType === t ? 'rgba(74,128,196,0.1)' : 'var(--bg)',
                color: certType === t ? '#4A80C4' : 'var(--text2)',
                fontSize: '12px', fontWeight: 600, cursor: 'pointer',
              }}>
                {t}
              </button>
            ))}
          </div>
        </div>
        <div>
          <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '16px' }}>Номиналы</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {['₽1 000', '₽2 500', '₽5 000', '₽10 000', '+ Добавить'].map((v, i) => (
              <button key={v} style={{ padding: '8px 16px', borderRadius: 'var(--radius-sm)', border: i === 4 ? '1px dashed var(--border)' : '1px solid var(--border)', background: 'var(--bg)', color: i === 4 ? 'var(--text3)' : 'var(--text)', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
                {v}
              </button>
            ))}
          </div>
        </div>
        <div>
          <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '16px' }}>Параметры</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div>
              <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text2)', display: 'block', marginBottom: '6px' }}>Срок действия (дней)</label>
              <input type="number" defaultValue="365" style={{ width: '100%', padding: '10px 14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: '14px', boxSizing: 'border-box' }} />
            </div>
          </div>
        </div>
      </div>
    ),
    subscriptions: (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
        <div>
          <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '16px' }}>Пакеты занятий</div>
          {[
            { name: 'Мини', count: '8', price: '7 200', perVisit: '900' },
            { name: 'Стандарт', count: '12', price: '9 600', perVisit: '800' },
            { name: 'Макси', count: '20', price: '14 000', perVisit: '700' },
          ].map((pkg, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--bg)', marginBottom: '8px' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '13px', fontWeight: 700 }}>{pkg.name} — {pkg.count} занятий</div>
                <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '2px' }}>₽{pkg.perVisit} за визит</div>
              </div>
              <div style={{ fontSize: '14px', fontWeight: 800, color: '#FCAE91' }}>₽{pkg.price}</div>
            </div>
          ))}
          <button style={{ width: '100%', padding: '10px', borderRadius: 'var(--radius-sm)', border: '1px dashed var(--border)', background: 'transparent', color: 'var(--text3)', fontSize: '13px', cursor: 'pointer', marginTop: '4px' }}>
            + Добавить пакет
          </button>
        </div>
        <div>
          <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '16px' }}>Настройки</div>
          {['Заморозка абонемента', 'Перенос на другого клиента', 'Автопродление'].map((opt, i) => (
            <label key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 0', cursor: 'pointer', borderBottom: i < 2 ? '1px solid var(--border)' : 'none' }}>
              <div style={{ width: '18px', height: '18px', borderRadius: '5px', background: i === 0 ? '#FCAE91' : 'var(--bg)', border: `1px solid ${i === 0 ? '#FCAE91' : 'var(--border)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: 'white' }}>
                {i === 0 && <IconCheck />}
              </div>
              <span style={{ fontSize: '13px', fontWeight: 500 }}>{opt}</span>
            </label>
          ))}
        </div>
      </div>
    ),
    referral: (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
        <div>
          <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '16px' }}>Бонус за реферала</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div>
              <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text2)', display: 'block', marginBottom: '6px' }}>Бонус рефереру (₽)</label>
              <input type="number" defaultValue="500" style={{ width: '100%', padding: '10px 14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: '14px', boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text2)', display: 'block', marginBottom: '6px' }}>Скидка новому клиенту (%)</label>
              <input type="number" defaultValue="15" style={{ width: '100%', padding: '10px 14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: '14px', boxSizing: 'border-box' }} />
            </div>
          </div>
        </div>
        <div>
          <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '16px' }}>Условие начисления</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {['После первого визита', 'После первой оплаты', 'Сразу при регистрации'].map((opt, i) => (
              <label key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', borderRadius: 'var(--radius-sm)', border: `1px solid ${i === 0 ? 'rgba(252,174,145,0.4)' : 'var(--border)'}`, background: i === 0 ? 'rgba(252,174,145,0.06)' : 'var(--bg)', cursor: 'pointer' }}>
                <div style={{ width: '16px', height: '16px', borderRadius: '50%', border: `2px solid ${i === 0 ? '#FCAE91' : 'var(--border)'}`, background: i === 0 ? '#FCAE91' : 'transparent', flexShrink: 0 }} />
                <span style={{ fontSize: '13px', fontWeight: 500 }}>{opt}</span>
              </label>
            ))}
          </div>
        </div>
        <div>
          <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '16px' }}>Начисление бонуса</div>
          <div style={{ display: 'flex', gap: '8px' }}>
            {['Баллами', 'На депозит', 'Скидкой'].map((t) => (
              <button key={t} onClick={() => setReferralBonus(t)} style={{
                padding: '8px 14px', borderRadius: 'var(--radius-sm)',
                border: `1px solid ${referralBonus === t ? 'rgba(252,174,145,0.4)' : 'var(--border)'}`,
                background: referralBonus === t ? 'rgba(252,174,145,0.12)' : 'var(--bg)',
                color: referralBonus === t ? '#FCAE91' : 'var(--text2)',
                fontSize: '12px', fontWeight: 600, cursor: 'pointer',
              }}>
                {t}
              </button>
            ))}
          </div>
        </div>
      </div>
    ),
  };
  return configs[drawerKey] || null;
};

// ─── ГЛАВНЫЙ КОМПОНЕНТ ────────────────────────────────────────────────────────
export default function Loyalty() {
  const [programs, setPrograms] = useState<Record<ProgramKey, boolean>>({
    loyalty: false,
    discounts: false,
    certificates: false,
    subscriptions: false,
    referral: false,
  });

  const [drawer, setDrawer] = useState<DrawerConfig | null>(null);
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [mounted, setMounted] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setMounted(true); }, []);

  const openDrawer = (key: ProgramKey, title: string) => {
    setDrawer({ key, title });
    requestAnimationFrame(() => setDrawerVisible(true));
  };

  const closeDrawer = () => {
    setDrawerVisible(false);
    setTimeout(() => setDrawer(null), 300);
  };

  const handleSave = (key: ProgramKey) => {
    setPrograms(prev => ({ ...prev, [key]: true }));
    closeDrawer();
  };

  const programsList: Program[] = [
    {
      key: 'loyalty',
      title: 'Карты лояльности',
      desc: 'Накопительная система баллов по уровням',
      icon: <IconTrophy />,
      accentColor: '#FCAE91',
      accentBg: 'rgba(252,174,145,0.08)',
      accentBorder: 'rgba(252,174,145,0.25)',
      configured: programs.loyalty,
      stats: { value: '89', label: 'клиентов' },
    },
    {
      key: 'discounts',
      title: 'Скидки и кэшбэк',
      desc: 'Персональные предложения для клиентов',
      icon: <IconPercent />,
      accentColor: '#5BAB72',
      accentBg: 'rgba(91,171,114,0.08)',
      accentBorder: 'rgba(91,171,114,0.25)',
      configured: programs.discounts,
      stats: { value: '18', label: 'активных' },
    },
    {
      key: 'certificates',
      title: 'Сертификаты',
      desc: 'Подарочные и именные сертификаты',
      icon: <IconGift />,
      accentColor: '#4A80C4',
      accentBg: 'rgba(74,128,196,0.08)',
      accentBorder: 'rgba(74,128,196,0.25)',
      configured: programs.certificates,
      stats: { value: '34', label: 'продано' },
    },
    {
      key: 'subscriptions',
      title: 'Абонементы',
      desc: 'Пакеты на 8, 12, 20 занятий',
      icon: <IconSubscription />,
      accentColor: '#D88C9A',
      accentBg: 'rgba(216,140,154,0.08)',
      accentBorder: 'rgba(216,140,154,0.25)',
      configured: programs.subscriptions,
      stats: { value: '67', label: 'активных' },
    },
    {
      key: 'referral',
      title: 'Реферальная',
      desc: 'Программа «Приведи друга»',
      icon: <IconShare />,
      accentColor: '#9B8EC4',
      accentBg: 'rgba(155,142,196,0.08)',
      accentBorder: 'rgba(155,142,196,0.25)',
      configured: programs.referral,
      stats: { value: '24', label: 'реферала' },
    },
  ];

  const configuredCount = Object.values(programs).filter(Boolean).length;

  const miniChartRevenue = chartData.map(d => d.revenue);
  const miniChartClients = chartData.map(d => d.clients);

  return (
    <>
      <style>{`
        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes drawerIn {
          from { transform: translateX(100%); }
          to   { transform: translateX(0); }
        }
        @keyframes overlayIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes barGrow {
          from { height: 0; }
          to   { height: var(--bar-h); }
        }
        @keyframes pulseRing {
          0%   { transform: scale(1); opacity: 0.6; }
          100% { transform: scale(1.5); opacity: 0; }
        }
        .program-card {
          background: var(--card);
          border-radius: var(--radius);
          border: 1px solid var(--border);
          padding: 24px;
          cursor: pointer;
          transition: box-shadow 0.2s, border-color 0.2s, transform 0.15s;
          position: relative;
          overflow: hidden;
          animation: fadeSlideIn 0.35s ease both;
        }
        .program-card:hover {
          box-shadow: 0 8px 32px -8px rgba(0,0,0,0.08);
          transform: translateY(-1px);
        }
        .program-card.configured:hover { border-color: rgba(252,174,145,0.5); }
        .configure-btn {
          display: flex; align-items: center; gap: 6px;
          padding: 8px 16px;
          border-radius: var(--radius-sm);
          font-size: 12px; font-weight: 700;
          cursor: pointer; border: none;
          transition: opacity 0.15s, transform 0.1s;
        }
        .configure-btn:hover { opacity: 0.85; transform: scale(0.98); }
        .stat-card {
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          padding: 20px 24px;
          animation: fadeSlideIn 0.4s ease both;
        }
        .bar-wrap {
          display: flex; flex-direction: column; align-items: center;
          gap: 6px; flex: 1;
        }
        .bar-col {
          width: 100%; border-radius: 4px 4px 0 0;
          animation: barGrow 0.6s cubic-bezier(.16,1,.3,1) both;
          transform-origin: bottom;
        }
        .drawer-overlay {
          position: fixed; inset: 0;
          background: rgba(0,0,0,0.18);
          z-index: 100;
          animation: overlayIn 0.25s ease;
          backdrop-filter: blur(2px);
        }
        .drawer {
          position: fixed; top: 0; right: 0; bottom: 0;
          width: 420px;
          background: var(--card);
          border-left: 1px solid var(--border);
          z-index: 101;
          display: flex; flex-direction: column;
          box-shadow: -12px 0 48px rgba(0,0,0,0.06);
          transition: transform 0.3s cubic-bezier(.16,1,.3,1);
        }
        .drawer.entering  { transform: translateX(0); }
        .drawer.exiting   { transform: translateX(100%); }
        .drawer-header {
          padding: 24px 28px 20px;
          border-bottom: 1px solid var(--border);
          display: flex; align-items: center; gap: 12px;
        }
        .drawer-body {
          flex: 1; overflow-y: auto; padding: 24px 28px;
        }
        .drawer-footer {
          padding: 16px 28px 24px;
          border-top: 1px solid var(--border);
          display: flex; gap: 10px;
        }
        .badge-configured {
          display: inline-flex; align-items: center; gap: 5px;
          padding: 4px 10px; border-radius: 20px;
          background: rgba(163,201,168,0.15);
          border: 1px solid rgba(163,201,168,0.35);
          color: #5BAB72; font-size: 11px; font-weight: 700;
        }
        .badge-pending {
          display: inline-flex; align-items: center; gap: 5px;
          padding: 4px 10px; border-radius: 20px;
          background: rgba(200,200,200,0.1);
          border: 1px solid var(--border);
          color: var(--text3); font-size: 11px; font-weight: 700;
        }
        .progress-bar-wrap {
          height: 4px; background: var(--border); border-radius: 2px; overflow: hidden; flex: 1;
        }
        .progress-bar-fill {
          height: 100%; border-radius: 2px; background: #FCAE91;
          transition: width 0.6s cubic-bezier(.16,1,.3,1);
        }
        .lock-overlay {
          position: absolute; inset: 0;
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          gap: 8px; z-index: 1;
          border-radius: var(--radius);
        }
        .topbar-btn {
          background: #FCAE91; color: #fff; border: none;
          padding: 9px 20px; border-radius: var(--radius-sm);
          font-size: 13px; font-weight: 700; cursor: pointer;
          transition: opacity 0.15s;
        }
        .topbar-btn:hover { opacity: 0.88; }
        .ghost-btn {
          background: transparent; border: 1px solid var(--border);
          padding: 9px 20px; border-radius: var(--radius-sm);
          font-size: 13px; font-weight: 600; color: var(--text2);
          cursor: pointer; transition: background 0.15s;
        }
        .ghost-btn:hover { background: var(--border); }

        .tooltip-wrap { position: relative; display: inline-flex; }
        .tooltip-wrap .tooltip-box {
          display: none; position: fixed; background: var(--text); color: var(--card);
          font-size: 11px; font-weight: 500; padding: 6px 10px; border-radius: 6px;
          white-space: nowrap; z-index: 9999; pointer-events: none; line-height: 1.5;
          box-shadow: 0 4px 12px rgba(0,0,0,0.15);
          transform: translateX(-50%);
        }
        .tooltip-wrap:hover .tooltip-box { display: block; }
      `}</style>

      {/* ─── ПРОГРЕСС НАСТРОЙКИ ─── */}
      {configuredCount < 5 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '16px',
          background: 'rgba(252,174,145,0.06)', border: '1px solid rgba(252,174,145,0.2)',
          borderRadius: 'var(--radius)', padding: '16px 24px', marginBottom: '24px',
          animation: 'fadeSlideIn 0.3s ease',
        }}>
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <svg width="40" height="40" viewBox="0 0 40 40">
              <circle cx="20" cy="20" r="16" fill="none" stroke="var(--border)" strokeWidth="3" />
              <circle cx="20" cy="20" r="16" fill="none" stroke="#FCAE91" strokeWidth="3"
                strokeDasharray={`${(configuredCount / 5) * 100.5} 100.5`}
                strokeDashoffset="25" strokeLinecap="round"
                style={{ transition: 'stroke-dasharray 0.5s ease' }}
              />
              <text x="20" y="24" textAnchor="middle" fontSize="11" fontWeight="700" fill="#FCAE91">{configuredCount}/5</text>
            </svg>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '2px' }}>Настройте программы лояльности</div>
            <div style={{ fontSize: '12px', color: 'var(--text2)' }}>Настроено {configuredCount} из 5 программ · Каждая программа увеличивает удержание клиентов</div>
          </div>
          {configuredCount === 0 && (
            <button className="configure-btn" style={{ background: '#FCAE91', color: 'white' }} onClick={() => openDrawer('loyalty', 'Карты лояльности')}>
              Начать <IconArrow />
            </button>
          )}
        </div>
      )}

      {configuredCount === 5 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '16px',
          background: 'rgba(91,171,114,0.06)', border: '1px solid rgba(91,171,114,0.25)',
          borderRadius: 'var(--radius)', padding: '16px 24px', marginBottom: '24px',
          animation: 'fadeSlideIn 0.3s ease',
        }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'rgba(91,171,114,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#5BAB72' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12" /></svg>
          </div>
          <div>
            <div style={{ fontSize: '13px', fontWeight: 700 }}>Все программы настроены</div>
            <div style={{ fontSize: '12px', color: 'var(--text2)' }}>Система лояльности работает в полную силу</div>
          </div>
        </div>
      )}

      {/* ─── КАРТОЧКИ ПРОГРАММ ─── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '16px', marginBottom: '24px' }}>
        {programsList.map((prog, i) => (
          <div
            key={prog.key}
            className={`program-card ${prog.configured ? 'configured' : ''}`}
            style={{
              animationDelay: `${i * 0.05}s`,
              borderColor: prog.configured ? prog.accentBorder : 'var(--border)',
              background: prog.configured ? prog.accentBg : 'var(--card)',
              display: 'flex',
              flexDirection: 'column',
            }}
            onClick={() => openDrawer(prog.key, prog.title)}
          >
            {/* Иконка */}
            <div style={{
              width: '40px', height: '40px', borderRadius: '10px',
              background: prog.configured ? `${prog.accentColor}20` : 'var(--border)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: prog.configured ? prog.accentColor : 'var(--text3)',
              marginBottom: '14px',
              transition: 'background 0.2s',
            }}>
              {prog.icon}
            </div>

            <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '4px' }}>{prog.title}</div>
            <div style={{ fontSize: '11px', color: 'var(--text2)', marginBottom: '16px', lineHeight: 1.4, flex: 1 }}>{prog.desc}</div>

            {prog.configured ? (
              <div style={{ marginTop: 'auto' }}>
                <div style={{ fontSize: '22px', fontWeight: 800, color: prog.accentColor, marginBottom: '2px' }}>
                  {prog.stats?.value}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text3)' }}>{prog.stats?.label}</div>
                <div style={{ marginTop: '12px' }}>
                  <span className="badge-configured">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>
                    Активна
                  </span>
                </div>
              </div>
            ) : (
              <div style={{ marginTop: 'auto' }}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '6px',
                  color: 'var(--text3)', marginBottom: '12px',
                }}>
                  <IconLock />
                  <span style={{ fontSize: '12px', fontWeight: 600 }}>Не настроена</span>
                </div>
                <button
                  className="configure-btn"
                  style={{ background: 'var(--border)', color: 'var(--text2)', width: '100%', justifyContent: 'center' }}
                  onClick={e => { e.stopPropagation(); openDrawer(prog.key, prog.title); }}
                >
                  <IconSettings />
                  Настроить
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* ─── СТАТИСТИКА ─── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
        {/* Выручка */}
        <div className="stat-card" style={{ animationDelay: '0.15s' }}>
          {configuredCount === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '140px', gap: '10px', color: 'var(--text3)' }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.4">
                <path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/>
              </svg>
              <div style={{ fontSize: '13px', fontWeight: 600, opacity: 0.5 }}>Программа не подключена</div>
              <div style={{ fontSize: '11px', opacity: 0.35 }}>Данные появятся после настройки</div>
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
                <div>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>Выручка через программы</div>
                  <div style={{ fontSize: '28px', fontWeight: 800, color: 'var(--text)' }}>{revenueFromLoyalty}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginTop: '4px', color: '#5BAB72', fontSize: '12px', fontWeight: 700 }}>
                    <IconTrend />
                    {totalGrowth} за 6 месяцев
                  </div>
                </div>
                <MiniChart data={miniChartRevenue} color="#FCAE91" />
              </div>
              {/* Линейный график вместо свечек */}
              <LineChart data={chartData} color="#FCAE91" valueKey="revenue" />
            </>
          )}
        </div>

        {/* Клиенты */}
        <div className="stat-card" style={{ animationDelay: '0.2s' }}>
          {configuredCount === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '140px', gap: '10px', color: 'var(--text3)' }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.4">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
              </svg>
              <div style={{ fontSize: '13px', fontWeight: 600, opacity: 0.5 }}>Программа не подключена</div>
              <div style={{ fontSize: '11px', opacity: 0.35 }}>Данные появятся после настройки</div>
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
                <div>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>Прирост клиентов</div>
                  <div style={{ fontSize: '28px', fontWeight: 800, color: 'var(--text)' }}>+{chartData[chartData.length - 1].clients - chartData[0].clients}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginTop: '4px', color: '#5BAB72', fontSize: '12px', fontWeight: 700 }}>
                    <IconTrend />
                    +{Math.round(((chartData[chartData.length - 1].clients - chartData[0].clients) / chartData[0].clients) * 100)}% за 6 мес
                  </div>
                </div>
                <MiniChart data={miniChartClients} color="#4A80C4" />
              </div>
              <LineChart data={chartData} color="#4A80C4" valueKey="clients" />
            </>
          )}
        </div>
      </div>

      {/* ─── НИЖНЯЯ СТРОКА: КПИ + УРОВНИ ─── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', opacity: 1, transition: 'opacity 0.4s' }}>
        {/* КПИ карточки */}
        <div className="stat-card" style={{ animationDelay: '0.25s' }}>
          <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '20px' }}>Ключевые показатели</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            {[
              { label: 'Удержание', value: retentionRate, color: '#5BAB72', sub: 'клиентов' },
              { label: 'Средний чек', value: avgCheck, color: '#FCAE91', sub: '+12% к прошл.' },
              { label: 'Реферралов', value: '24', color: '#9B8EC4', sub: 'за 3 мес' },
              { label: 'Сертификатов', value: '₽85K', color: '#4A80C4', sub: 'продано' },
            ].map((kpi, i) => (
              <div key={i} style={{ padding: '14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--bg)' }}>
                <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>{kpi.label}</div>
                <div style={{ fontSize: '20px', fontWeight: 800, color: kpi.color }}>{kpi.value}</div>
                <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '2px' }}>{kpi.sub}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Уровни с прогресс-барами */}
        <div className="stat-card" style={{ animationDelay: '0.3s' }}>
          <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '20px' }}>Распределение по уровням</div>
          {[
            { name: 'Серебро', count: 42, total: 89, col: '#B0B0C0', desc: 'до ₽10K' },
            { name: 'Золото', count: 35, total: 89, col: '#f0c040', desc: '₽10K–50K' },
            { name: 'Платина', count: 12, total: 89, col: '#FCAE91', desc: 'от ₽50K' },
          ].map((lvl, i) => (
            <div key={i} style={{ marginBottom: i < 2 ? '18px' : '0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: lvl.col, flexShrink: 0 }} />
                  <span style={{ fontSize: '13px', fontWeight: 700 }}>{lvl.name}</span>
                  <span style={{ fontSize: '11px', color: 'var(--text3)' }}>{lvl.desc}</span>
                </div>
                <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text2)' }}>{lvl.count}</span>
              </div>
              <div className="progress-bar-wrap">
                <div
                  className="progress-bar-fill"
                  style={{
                    width: mounted ? `${(lvl.count / lvl.total) * 100}%` : '0%',
                    background: lvl.col,
                    transitionDelay: `${0.3 + i * 0.1}s`,
                  }}
                />
              </div>
            </div>
          ))}
          <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', color: 'var(--text3)' }}>Всего клиентов в программе</span>
            <span style={{ fontSize: '16px', fontWeight: 800, color: '#FCAE91' }}>89</span>
          </div>
        </div>
      </div>

      {/* ─── DRAWER ─── */}
      {drawer && (
        <>
          <div className="drawer-overlay" onClick={closeDrawer} />
          <div className={`drawer ${drawerVisible ? 'entering' : 'exiting'}`} ref={drawerRef}>
            <div className="drawer-header">
              <div style={{
                width: '36px', height: '36px', borderRadius: '9px',
                background: 'rgba(252,174,145,0.12)', display: 'flex',
                alignItems: 'center', justifyContent: 'center', color: '#FCAE91', flexShrink: 0,
              }}>
                {programsList.find(p => p.key === drawer.key)?.icon}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '15px', fontWeight: 800 }}>{drawer.title}</div>
                <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '1px' }}>Настройка программы</div>
              </div>
              <button onClick={closeDrawer} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', padding: '4px', display: 'flex', alignItems: 'center' }}>
                <IconClose />
              </button>
            </div>

            <div className="drawer-body">
              <DrawerContent drawerKey={drawer.key}/>
            </div>

            <div className="drawer-footer">
              <button
                className="topbar-btn"
                style={{ flex: 1 }}
                onClick={() => handleSave(drawer.key)}
              >
                Сохранить и активировать
              </button>
              <button className="ghost-btn" onClick={closeDrawer}>Отмена</button>
            </div>
          </div>
        </>
      )}
    </>
  );
}