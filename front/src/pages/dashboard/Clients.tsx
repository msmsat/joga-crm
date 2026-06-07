import { useState } from 'react';

// ─── ТИПЫ И ДАННЫЕ ────────────────────────────────────────────────────────────
interface ClientData {
  id: number;
  n: string; i: string; c: string; type: string; badge: string; bl: string;
  v: number; spent: string; ab: number; abMax: number;
  phone: string; email: string; bday: string; city: string;
  reg: string; lastVisit: string; points: number; note: string;
  tags: string[];
}

const CATEGORIES = ['Все (142)', 'VIP (18)', 'Активные (89)', 'Новые (12)', 'С абонементом (67)', 'Неактивные (23)', 'День рождения 🎂 (3)'];

const clientsData: ClientData[] = [
  { id: 1, n: 'Мария Коваленко', i: 'МК', c: '#FCAE91', type: 'active-client', badge: 'badge-active', bl: 'Активный', v: 24, spent: '₽48K', ab: 7, abMax: 10, phone: '+7 916 234-56-78', email: 'maria.kovalenko@gmail.com', bday: '14 марта 1992', city: 'Москва', reg: '12 янв 2024', lastVisit: '3 июня 2025', points: 2880, note: 'Предпочитает утренние занятия. Аллергия на латекс.', tags: ['Пилатес', 'Йога'] },
  { id: 2, n: 'Алексей Морозов', i: 'АМ', c: '#f0c040', type: 'vip', badge: 'badge-vip', bl: 'VIP', v: 86, spent: '₽180K', ab: 10, abMax: 10, phone: '+7 905 123-45-67', email: 'a.morozov@corp.ru', bday: '7 июля 1985', city: 'Москва', reg: '3 фев 2023', lastVisit: '4 июня 2025', points: 10320, note: 'Индивидуальный тренер — Ольга. Персональные занятия 2 раза в неделю.', tags: ['Персональный', 'Сила', 'VIP'] },
  { id: 3, n: 'Елена Соколова', i: 'ЕС', c: '#5BAB72', type: 'new-client', badge: 'badge-new', bl: 'Новый', v: 2, spent: '₽4K', ab: 1, abMax: 8, phone: '+7 977 890-12-34', email: 'e.sokolova@yandex.ru', bday: '22 ноября 1998', city: 'Подмосковье', reg: '28 мая 2025', lastVisit: '1 июня 2025', points: 240, note: 'Пришла по рекомендации Марии Коваленко.', tags: ['Новичок', 'Пилатес'] },
  { id: 4, n: 'Дмитрий Попов', i: 'ДП', c: '#4A80C4', type: 'active-client', badge: 'badge-active', bl: 'Активный', v: 18, spent: '₽32K', ab: 5, abMax: 10, phone: '+7 926 567-89-01', email: 'd.popov@mail.ru', bday: '3 апреля 1990', city: 'Москва', reg: '15 сен 2024', lastVisit: '2 июня 2025', points: 2160, note: 'Реабилитация после травмы колена. Запрет: прыжки, бег.', tags: ['Реабилитация', 'Растяжка'] },
  { id: 5, n: 'Наталья Белова', i: 'НБ', c: '#7b6cd4', type: 'active-client', badge: 'badge-active', bl: 'Активный', v: 11, spent: '₽22K', ab: 3, abMax: 8, phone: '+7 903 456-78-90', email: 'nbelova@inbox.ru', bday: '19 июня 1995', city: 'Москва', reg: '7 ноя 2024', lastVisit: '30 мая 2025', points: 1320, note: 'День рождения скоро! Напомнить про поздравление.', tags: ['Йога', 'Медитация'] },
  { id: 6, n: 'Светлана Иванова', i: 'СИ', c: '#D88C9A', type: 'vip', badge: 'badge-vip', bl: 'VIP', v: 54, spent: '₽96K', ab: 8, abMax: 10, phone: '+7 985 321-65-43', email: 's.ivanova@corp.com', bday: '11 февраля 1988', city: 'Москва', reg: '20 мар 2023', lastVisit: '4 июня 2025', points: 6480, note: 'Всегда записывается заранее. Очень пунктуальна.', tags: ['Пилатес', 'VIP', 'Постоянная'] },
];

const STATUSES = ['Активный', 'VIP', 'Новый', 'Неактивный', 'Заморожен'];
const STATUS_COLORS: Record<string, string> = {
  'Активный': '#5BAB72', 'VIP': '#f0c040', 'Новый': '#4A80C4',
  'Неактивный': '#999', 'Заморожен': '#7b6cd4'
};

const VISITS_HISTORY = [
  { date: '4 июня', name: 'Утренний пилатес', trainer: 'Ольга С.', paid: '₽1 200' },
  { date: '2 июня', name: 'Стретчинг', trainer: 'Анна Р.', paid: '₽900' },
  { date: '31 мая', name: 'Йога-флоу', trainer: 'Ольга С.', paid: '₽1 200' },
  { date: '28 мая', name: 'Утренний пилатес', trainer: 'Ольга С.', paid: 'Абон.' },
  { date: '25 мая', name: 'Персональная', trainer: 'Дмитрий К.', paid: '₽3 500' },
];

// ─── SVG-ИКОНКИ ───────────────────────────────────────────────────────────────
const IconPhone = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 1.28h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L7.91 9a16 16 0 0 0 7.09 7.09l1.08-1.08a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
  </svg>
);
const IconMail = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
    <polyline points="22,6 12,13 2,6" />
  </svg>
);
const IconCalendar = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <rect x="3" y="4" width="18" height="18" rx="2" />
    <line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
  </svg>
);
const IconEdit = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
  </svg>
);
const IconClose = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);
const IconPlus = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);
const IconNote = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
    <line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" />
  </svg>
);
const IconFreeze = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <line x1="12" y1="2" x2="12" y2="22" /><line x1="2" y1="12" x2="22" y2="12" />
    <path d="M7 7l10 10M17 7L7 17" />
  </svg>
);
const IconTrash = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    <path d="M10 11v6M14 11v6" /><path d="M9 6V4h6v2" />
  </svg>
);
const IconLocation = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" />
  </svg>
);
const IconGift = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <polyline points="20 12 20 22 4 22 4 12" /><rect x="2" y="7" width="20" height="5" />
    <line x1="12" y1="22" x2="12" y2="7" />
    <path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z" />
    <path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" />
  </svg>
);
const IconHistory = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <polyline points="1 4 1 10 7 10" />
    <path d="M3.51 15a9 9 0 1 0 .49-4.5" />
    <polyline points="12 7 12 12 16 14" />
  </svg>
);
const IconMessage = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
);

// ─── ЛОЯЛЬНОСТЬ — ИЛЛЮСТРАЦИЯ SVG ─────────────────────────────────────────────
function LoyaltyIllus({ points }: { points: number }) {
  const tier = points >= 8000 ? 'Platinum' : points >= 3000 ? 'Gold' : points >= 1000 ? 'Silver' : 'Bronze';
  const tierColors: Record<string, [string, string]> = {
    Platinum: ['#e8e8ff', '#9090d0'],
    Gold: ['#fff8d6', '#f0c040'],
    Silver: ['#f0f0f0', '#aaaaaa'],
    Bronze: ['#fde8d8', '#c87941'],
  };
  const [bg, stroke] = tierColors[tier];
  const r = 36;
  const circ = 2 * Math.PI * r;
  const maxPoints = tier === 'Platinum' ? 15000 : tier === 'Gold' ? 8000 : tier === 'Silver' ? 3000 : 1000;
  const pct = Math.min(points / maxPoints, 1);
  const dash = pct * circ;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '14px 16px', background: `${bg}60`, borderRadius: '12px', border: `1px solid ${stroke}40`, marginBottom: '12px' }}>
      <svg width="84" height="84" viewBox="0 0 84 84">
        <circle cx="42" cy="42" r={r} fill="none" stroke={`${stroke}22`} strokeWidth="6" />
        <circle cx="42" cy="42" r={r} fill="none" stroke={stroke} strokeWidth="6"
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
          transform="rotate(-90 42 42)" style={{ transition: 'stroke-dasharray 1s ease' }} />
        <text x="42" y="38" textAnchor="middle" fill={stroke} fontSize="10" fontWeight="800" fontFamily="Manrope">{tier}</text>
        <text x="42" y="52" textAnchor="middle" fill={stroke} fontSize="9" fontWeight="600" fontFamily="Manrope">{points.toLocaleString()}</text>
        <text x="42" y="62" textAnchor="middle" fill={`${stroke}99`} fontSize="7" fontWeight="500" fontFamily="Manrope">баллов</text>
      </svg>
      <div>
        <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text)' }}>Уровень {tier}</div>
        <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '2px', lineHeight: 1.5 }}>
          До следующего: {(maxPoints - points).toLocaleString()} баллов
        </div>
        <div style={{ fontSize: '11px', color: 'var(--text2)', marginTop: '6px' }}>
          <span style={{ background: `${stroke}22`, color: stroke, padding: '2px 8px', borderRadius: '20px', fontWeight: 700, fontSize: '10px' }}>
            ×{pct >= 1 ? '2.0' : pct >= 0.6 ? '1.5' : '1.0'} к баллам
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── АБОНЕМЕНТ — SVG ПРОГРЕСС-КАРТОЧКА ────────────────────────────────────────
function AbonementCard({ ab, abMax, c }: { ab: number; abMax: number; c: string }) {
  const pct = (ab / abMax) * 100;
  const isLow = pct <= 30;
  return (
    <div style={{ padding: '14px 16px', background: isLow ? 'rgba(216,140,154,0.06)' : 'rgba(91,171,114,0.05)', borderRadius: '12px', border: `1px solid ${isLow ? 'rgba(216,140,154,0.2)' : 'rgba(91,171,114,0.18)'}`, marginBottom: '12px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
        <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text)' }}>Абонемент</div>
        <div style={{ fontSize: '11px', color: isLow ? '#D88C9A' : '#5BAB72', fontWeight: 700 }}>
          {ab}/{abMax} занятий
        </div>
      </div>
      <div style={{ position: 'relative', height: '8px', background: 'rgba(26,26,26,0.06)', borderRadius: '10px', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: isLow ? 'linear-gradient(90deg,#D88C9A,#c07080)' : `linear-gradient(90deg,${c},${c}bb)`, borderRadius: '10px', transition: 'width 0.6s ease' }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px' }}>
        {Array.from({ length: abMax }).map((_, i) => (
          <div key={i} style={{ width: '6px', height: '6px', borderRadius: '50%', background: i < ab ? c : 'rgba(26,26,26,0.1)', transition: 'background 0.3s' }} />
        ))}
      </div>
      {isLow && (
        <div style={{ marginTop: '10px', fontSize: '11px', color: '#D88C9A', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
          Осталось мало занятий — предложить продление
        </div>
      )}
    </div>
  );
}

// ─── АКТИВНОСТЬ МИНИ-ЧАРТ ─────────────────────────────────────────────────────
function ActivityChart({ c }: { c: string }) {
  const bars = [40, 65, 30, 80, 55, 90, 45, 70, 85, 60, 75, 95].map(h => Math.round(h * 0.9 + Math.random() * 10));
  const max = Math.max(...bars);
  return (
    <div style={{ padding: '14px 16px', background: 'rgba(26,26,26,0.02)', borderRadius: '12px', border: '1px solid var(--border)', marginBottom: '12px' }}>
      <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text)', marginBottom: '10px', display: 'flex', justifyContent: 'space-between' }}>
        <span>Активность (3 мес.)</span>
        <span style={{ fontSize: '11px', color: 'var(--text3)', fontWeight: 500 }}>12 занятий</span>
      </div>
      <svg width="100%" height="48" viewBox={`0 0 ${bars.length * 16} 48`} preserveAspectRatio="none">
        {bars.map((h, i) => {
          const barH = (h / max) * 38;
          return (
            <g key={i}>
              <rect x={i * 16 + 2} y={44 - barH} width="12" height={barH} rx="3"
                fill={`${c}30`} />
              <rect x={i * 16 + 2} y={44 - barH} width="12" height={Math.min(barH, 4)} rx="3"
                fill={c} />
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ─── ОСНОВНАЯ ПАНЕЛЬ КЛИЕНТА ───────────────────────────────────────────────────
function ClientPanel({ client, onClose }: { client: ClientData; onClose: () => void }) {
  const [activeTab, setActiveTab] = useState<'info' | 'visits' | 'notes'>('info');
  const [status, setStatus] = useState(client.bl);
  const [showStatusDD, setShowStatusDD] = useState(false);
  const [showBooking, setShowBooking] = useState(false);
  const sc = STATUS_COLORS[status] || '#999';

  return (
    <div style={{
      flex: 1, background: '#fff',
      height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column'
    }}>
      {/* ─ Шапка панели ─ */}
      <div style={{ padding: '20px 20px 0', borderBottom: '1px solid var(--border)', background: '#fdfcfb' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <div style={{
              width: '52px', height: '52px', borderRadius: '14px',
              background: `linear-gradient(135deg,${client.c},${client.c}bb)`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '18px', fontWeight: 800, color: '#fff',
              boxShadow: `0 8px 20px -4px ${client.c}55`
            }}>{client.i}</div>
            <div>
              <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.3px' }}>{client.n}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', position: 'relative' }}>
                  <button onClick={() => setShowStatusDD(v => !v)} style={{
                    fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '20px',
                    border: `1px solid ${sc}44`, background: `${sc}18`, color: sc, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: '4px', fontFamily: 'Manrope'
                  }}>
                    <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: sc, display: 'inline-block' }} />
                    {status}
                    <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="6 9 12 15 18 9" /></svg>
                  </button>
                  {showStatusDD && (
                    <div style={{
                      position: 'absolute', top: '100%', left: 0, marginTop: '4px',
                      background: '#fff', borderRadius: '10px', border: '1px solid var(--border)',
                      boxShadow: '0 8px 24px -4px rgba(0,0,0,0.12)', zIndex: 10, overflow: 'hidden', minWidth: '140px'
                    }}>
                      {STATUSES.map(s => (
                        <div key={s} onClick={() => { setStatus(s); setShowStatusDD(false); }} style={{
                          padding: '8px 12px', fontSize: '12px', fontWeight: 600,
                          color: STATUS_COLORS[s], cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px',
                          transition: 'background 0.15s'
                        }} onMouseEnter={e => (e.currentTarget.style.background = `${STATUS_COLORS[s]}12`)}
                          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                          <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: STATUS_COLORS[s] }} />
                          {s}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <span style={{ fontSize: '10px', color: 'var(--text3)' }}>·</span>
                <span style={{ fontSize: '11px', color: 'var(--text3)' }}>с {client.reg}</span>
              </div>
            </div>
          </div>
          <button onClick={onClose} style={{
            width: '30px', height: '30px', borderRadius: '8px', border: '1px solid var(--border)',
            background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--text3)', transition: 'all 0.2s'
          }} onMouseEnter={e => { e.currentTarget.style.background = 'rgba(26,26,26,0.06)'; e.currentTarget.style.color = 'var(--text)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text3)'; }}>
            <IconClose />
          </button>
        </div>

        {/* Быстрые действия */}
        <div style={{ display: 'flex', gap: '6px', marginBottom: '14px' }}>
          {[
            { icon: <IconPhone />, label: 'Позвонить', color: '#5BAB72' },
            { icon: <IconMessage />, label: 'Сообщение', color: '#4A80C4' },
            { icon: <IconCalendar />, label: 'Записать', color: 'var(--peach)', primary: true },
            { icon: <IconGift />, label: 'Бонус', color: '#f0c040' },
          ].map(({ icon, label, color, primary }) => (
            <button key={label} onClick={() => label === 'Записать' && setShowBooking(true)} style={{
              flex: 1, padding: '8px 4px', borderRadius: '10px', fontSize: '10px', fontWeight: 700,
              border: primary ? 'none' : '1px solid var(--border)',
              background: primary ? 'linear-gradient(135deg,var(--peach),#F5866E)' : 'transparent',
              color: primary ? '#fff' : color, cursor: 'pointer', fontFamily: 'Manrope',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px',
              transition: 'all 0.2s', boxShadow: primary ? '0 4px 14px -2px rgba(249,160,139,0.4)' : 'none'
            }} onMouseEnter={e => { if (!primary) { e.currentTarget.style.background = `${color}12`; e.currentTarget.style.borderColor = color; } }}
              onMouseLeave={e => { if (!primary) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'var(--border)'; } }}>
              {icon}
              {label}
            </button>
          ))}
        </div>

        {/* Табы */}
        <div style={{ display: 'flex', gap: '0', borderBottom: 'none' }}>
          {(['info', 'visits', 'notes'] as const).map(t => {
            const labels = { info: 'Профиль', visits: 'Визиты', notes: 'Заметки' };
            return (
              <button key={t} onClick={() => setActiveTab(t)} style={{
                flex: 1, padding: '9px 8px', fontSize: '12px', fontWeight: 700,
                border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: 'Manrope',
                color: activeTab === t ? 'var(--peach)' : 'var(--text3)',
                borderBottom: `2px solid ${activeTab === t ? 'var(--peach)' : 'transparent'}`,
                transition: 'all 0.2s'
              }}>{labels[t]}</button>
            );
          })}
        </div>
      </div>

      {/* ─ Тело панели ─ */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>

        {activeTab === 'info' && (
          <div style={{ animation: 'fadeSlide 0.2s ease both' }}>
            {/* Контактная информация */}
            <div style={{ marginBottom: '14px' }}>
              <div style={{ fontSize: '10px', fontWeight: 800, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.7px', marginBottom: '8px' }}>Контакты</div>
              {[
                { icon: <IconPhone />, val: client.phone, sub: 'Телефон' },
                { icon: <IconMail />, val: client.email, sub: 'Email' },
                { icon: <IconCalendar />, val: client.bday, sub: 'День рождения' },
                { icon: <IconLocation />, val: client.city, sub: 'Город' },
              ].map(({ icon, val, sub }) => (
                <div key={sub} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 10px', borderRadius: '9px', marginBottom: '2px', transition: 'background 0.15s', cursor: 'default' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(26,26,26,0.03)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                  <div style={{ width: '28px', height: '28px', borderRadius: '7px', background: 'rgba(26,26,26,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text3)', flexShrink: 0 }}>{icon}</div>
                  <div>
                    <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)' }}>{val}</div>
                    <div style={{ fontSize: '10px', color: 'var(--text3)' }}>{sub}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Статистика */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginBottom: '14px' }}>
              {[
                { v: client.v, l: 'Визитов', svg: <IconHistory /> },
                { v: client.spent, l: 'Потрачено', svg: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg> },
                { v: client.ab + '/' + client.abMax, l: 'Абонемент', svg: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="1" y="4" width="22" height="16" rx="2" /><line x1="1" y1="10" x2="23" y2="10" /></svg> },
              ].map(({ v, l, svg }) => (
                <div key={l} style={{ padding: '12px 10px', background: 'rgba(26,26,26,0.02)', borderRadius: '10px', border: '1px solid var(--border)', textAlign: 'center' }}>
                  <div style={{ color: 'var(--text3)', marginBottom: '6px', display: 'flex', justifyContent: 'center' }}>{svg}</div>
                  <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.5px' }}>{v}</div>
                  <div style={{ fontSize: '10px', color: 'var(--text3)', marginTop: '1px' }}>{l}</div>
                </div>
              ))}
            </div>

            <LoyaltyIllus points={client.points} />
            <AbonementCard ab={client.ab} abMax={client.abMax} c={client.c} />
            <ActivityChart c={client.c} />

            {/* Теги */}
            <div style={{ marginBottom: '14px' }}>
              <div style={{ fontSize: '10px', fontWeight: 800, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.7px', marginBottom: '8px' }}>Теги</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {client.tags.map(tag => (
                  <span key={tag} style={{ fontSize: '11px', fontWeight: 600, padding: '3px 10px', borderRadius: '20px', background: `${client.c}18`, color: client.c, border: `1px solid ${client.c}30` }}>{tag}</span>
                ))}
                <button style={{ fontSize: '11px', fontWeight: 600, padding: '3px 10px', borderRadius: '20px', background: 'transparent', border: '1px dashed var(--border)', color: 'var(--text3)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px', fontFamily: 'Manrope', transition: 'all 0.2s' }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--peach)'; e.currentTarget.style.color = 'var(--peach)'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text3)'; }}>
                  <IconPlus /> Добавить
                </button>
              </div>
            </div>

            {/* Опасная зона */}
            <div style={{ padding: '12px', borderRadius: '10px', border: '1px solid rgba(216,140,154,0.2)', background: 'rgba(216,140,154,0.03)', display: 'flex', gap: '6px' }}>
              <button style={{ flex: 1, padding: '7px', borderRadius: '8px', fontSize: '11px', fontWeight: 700, border: '1px solid rgba(123,108,212,0.25)', background: 'rgba(123,108,212,0.06)', color: '#7b6cd4', cursor: 'pointer', fontFamily: 'Manrope', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', transition: 'all 0.2s' }}>
                <IconFreeze /> Заморозить
              </button>
              <button style={{ flex: 1, padding: '7px', borderRadius: '8px', fontSize: '11px', fontWeight: 700, border: '1px solid rgba(216,140,154,0.3)', background: 'rgba(216,140,154,0.06)', color: '#D88C9A', cursor: 'pointer', fontFamily: 'Manrope', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', transition: 'all 0.2s' }}>
                <IconTrash /> Удалить
              </button>
            </div>
          </div>
        )}

        {activeTab === 'visits' && (
          <div style={{ animation: 'fadeSlide 0.2s ease both' }}>
            <div style={{ fontSize: '10px', fontWeight: 800, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.7px', marginBottom: '12px' }}>
              История визитов · последние 5
            </div>
            {VISITS_HISTORY.map((vis, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '11px 12px', borderRadius: '10px', marginBottom: '4px', border: '1px solid var(--border)', background: '#fff', transition: 'all 0.15s', cursor: 'default' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = `${client.c}50`; e.currentTarget.style.boxShadow = `0 4px 12px -4px ${client.c}22`; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = 'none'; }}>
                <div style={{ width: '34px', height: '34px', borderRadius: '9px', background: `${client.c}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={client.c} strokeWidth="1.8"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text)' }}>{vis.name}</div>
                  <div style={{ fontSize: '10px', color: 'var(--text3)', marginTop: '1px' }}>{vis.trainer} · {vis.date}</div>
                </div>
                <div style={{ fontSize: '12px', fontWeight: 700, color: vis.paid.startsWith('₽') ? '#5BAB72' : 'var(--text3)' }}>{vis.paid}</div>
              </div>
            ))}
            <button style={{ width: '100%', padding: '10px', marginTop: '8px', borderRadius: '10px', border: '1px dashed var(--border)', background: 'transparent', fontSize: '12px', fontWeight: 600, color: 'var(--text3)', cursor: 'pointer', fontFamily: 'Manrope', transition: 'all 0.2s' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--peach)'; e.currentTarget.style.color = 'var(--peach)'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text3)'; }}>
              Показать все визиты →
            </button>
          </div>
        )}

        {activeTab === 'notes' && (
          <div style={{ animation: 'fadeSlide 0.2s ease both' }}>
            <div style={{ fontSize: '10px', fontWeight: 800, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.7px', marginBottom: '12px' }}>Заметки администратора</div>
            <div style={{ padding: '12px 14px', borderRadius: '12px', background: 'rgba(249,160,139,0.05)', border: '1px solid rgba(249,160,139,0.18)', marginBottom: '14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                <span style={{ fontSize: '11px', color: 'var(--text3)' }}>Заметка · {client.reg}</span>
                <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', display: 'flex', alignItems: 'center' }}><IconEdit /></button>
              </div>
              <div style={{ fontSize: '13px', color: 'var(--text)', lineHeight: 1.6 }}>{client.note}</div>
            </div>
            <button style={{ width: '100%', padding: '10px', borderRadius: '10px', border: '1px dashed var(--border)', background: 'transparent', fontSize: '12px', fontWeight: 600, color: 'var(--text3)', cursor: 'pointer', fontFamily: 'Manrope', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', transition: 'all 0.2s' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--peach)'; e.currentTarget.style.color = 'var(--peach)'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text3)'; }}>
              <IconNote /> Добавить заметку
            </button>
          </div>
        )}
      </div>

      {/* ─ Быстрая запись ─ */}
      {showBooking && (
        <div style={{ padding: '16px 20px', borderTop: '1px solid var(--border)', background: '#fff', animation: 'panelSlideIn 0.25s ease both' }}>
          <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '10px', display: 'flex', justifyContent: 'space-between' }}>
            Быстрая запись
            <button onClick={() => setShowBooking(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)' }}><IconClose /></button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '10px' }}>
            {['Утренний пилатес', 'Йога-флоу', 'Стретчинг', 'Персональная'].map(cls => (
              <button key={cls} style={{
                padding: '9px 10px', borderRadius: '9px', border: '1px solid var(--border)',
                background: 'rgba(26,26,26,0.02)', fontSize: '11px', fontWeight: 600,
                color: 'var(--text)', cursor: 'pointer', fontFamily: 'Manrope', textAlign: 'left', transition: 'all 0.2s'
              }} onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--peach)'; e.currentTarget.style.background = 'rgba(249,160,139,0.05)'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'rgba(26,26,26,0.02)'; }}>
                {cls}
              </button>
            ))}
          </div>
          <button style={{ width: '100%', padding: '11px', borderRadius: '10px', border: 'none', background: 'linear-gradient(135deg,var(--peach),#F5866E)', color: '#fff', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'Manrope', boxShadow: '0 4px 14px -2px rgba(249,160,139,0.4)', transition: 'all 0.2s' }}>
            Записать на занятие →
          </button>
        </div>
      )}
    </div>
  );
}

// ─── КОМПОНЕНТ СТРАНИЦЫ ────────────────────────────────────────────────────────
export default function Clients() {
  const [activeCat, setActiveCat] = useState('Все (142)');
  const [activeClient, setActiveClient] = useState<ClientData | null>(null); // 🔥 Хранит данные (не удаляем сразу)
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const filteredClients = clientsData.filter(cl => {
    const q = searchQuery.toLowerCase();
    return cl.n.toLowerCase().includes(q) || 
           cl.phone.includes(q) || 
           cl.email.toLowerCase().includes(q) ||
           cl.tags.some(tag => tag.toLowerCase().includes(q));
  });

  return (
    <>
      <style>{`
        @keyframes panelSlideIn {
          from { opacity: 0; transform: translateX(32px); }
          to { opacity: 1; transform: translateX(0); }
        }
        @keyframes gridShift {
          from { transform: translateX(0); }
          to { transform: translateX(0); }
        }
        .client-panel-container {
          display: flex;
          align-items: flex-start;
          gap: 0;
          transition: all 0.38s cubic-bezier(0.16,1,0.3,1);
        }
        .client-grid-wrap {
          flex: 1;
          min-width: 0;
          transition: all 0.38s cubic-bezier(0.16,1,0.3,1);
        }
        .client-card {
          transition: transform 0.2s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.2s ease, border-color 0.2s ease !important;
        }
        .client-card:hover {
          transform: translateY(-3px) scale(1.01);
        }
        .client-card.selected-card {
          border-color: var(--peach) !important;
          box-shadow: 0 0 0 3px rgba(249,160,139,0.15), 0 12px 32px -8px rgba(249,160,139,0.25) !important;
        }
        .loyalty-svg-chip {
          display: flex; align-items: center; gap: 5px;
          padding: 5px 10px; background: rgba(249,160,139,0.08);
          border: 1px solid rgba(249,160,139,0.22); border-radius: 20px;
          font-size: 11px; font-weight: 700; color: var(--peach);
        }
        /* 🔥 Стили премиального поиска-чипа */
        .search-chip {
          display: flex; align-items: center; gap: 8px;
          padding: 6px 14px; background: var(--card);
          border: 1px solid var(--border2); border-radius: 20px;
          width: 260px; transition: all 0.2s cubic-bezier(0.34,1.56,0.64,1);
        }
        .search-chip:focus-within {
          border-color: var(--peach);
          box-shadow: 0 0 0 3px rgba(249,160,139,0.15);
          width: 280px; /* При фокусе поиск слегка расширяется */
        }
        .search-chip input {
          border: none; background: transparent; outline: none;
          font-size: 12px; font-weight: 600; color: var(--text);
          width: 100%; font-family: 'Manrope', sans-serif;
        }
        .search-chip input::placeholder {
          color: var(--text3); font-weight: 500;
        }
        .right-panel-wrapper {
          width: 0;
          opacity: 0;
          transform: translateX(20px); /* Чуть больше вылет для красивого скольжения */
          /* 🔥 Премиальная кривая: дает ощутимый разгон и мягко тормозит БЕЗ рывков назад */
          transition: 
            width 0.35s cubic-bezier(0.2, 0.8, 0.2, 1), 
            opacity 0.25s ease-out, 
            transform 0.35s cubic-bezier(0.2, 0.8, 0.2, 1); 
          overflow: hidden;
          flex-shrink: 0;
          background: #fff;
          border-left: 0px solid transparent;
        }
        .right-panel-wrapper.is-open {
          width: 420px;
          opacity: 1;
          transform: translateX(0);
          border-left: 1px solid var(--border);
        }
        .right-panel-inner {
          width: 420px;
          height: 100%;
          display: flex;
          flex-direction: column;
        }
          .right-panel-wrapper {
          width: 0;
          opacity: 0;
          transform: translateX(20px);
          transition: 
            width 0.35s cubic-bezier(0.2, 0.8, 0.2, 1), 
            opacity 0.25s ease-out, 
            transform 0.35s cubic-bezier(0.2, 0.8, 0.2, 1); 
          overflow: hidden;
          flex-shrink: 0;
          background: #fff;
          border-left: 0px solid transparent;
          height: calc(100vh - 120px); /* 🔥 Ограничиваем высоту экраном */
        }
        
        .right-panel-inner {
          width: 420px;
          height: 100%; /* 🔥 Занимает всю доступную высоту контейнера */
          display: flex;
          flex-direction: column;
          overflow: hidden; /* Важно: внутренности не должны вылезать */
        }
          .right-panel-wrapper {
          width: 0;
          opacity: 0;
          transform: translateX(20px);
          /* Добавляем внешний отступ, чтобы не прилипало к списку */
          margin-left: 0px; 
          
          transition: 
            width 0.35s cubic-bezier(0.2, 0.8, 0.2, 1), 
            opacity 0.25s ease-out, 
            transform 0.35s cubic-bezier(0.2, 0.8, 0.2, 1),
            margin-left 0.35s ease; /* Анимация для отступа */
            
          overflow: hidden;
          flex-shrink: 0;
          background: #fff;
          /* Убираем border-left в пользу тени, так стильнее */
          border-left: none; 
          box-shadow: -10px 0 30px rgba(0,0,0,0.03); /* Мягкая тень вместо линии */
          height: calc(100vh - 120px);
        }

        .right-panel-wrapper.is-open {
          width: 420px;
          opacity: 1;
          transform: translateX(0);
          margin-left: 20px; /* 🔥 Вот тот самый «воздух» между сеткой и панелью */
        }
      `}</style>

      <div className="category-chips" style={{ marginBottom: '16px' }}>
        {CATEGORIES.map((cat, i) => (
          <div key={i} className={`cat-chip ${activeCat === cat ? 'active' : ''}`} onClick={() => setActiveCat(cat)}>
            {cat}
          </div>
        ))}
        <div className="search-chip">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" strokeWidth="2.5">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input 
            type="text" 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Поиск по имени, номеру или тегу..." 
          />
        </div>
      </div>

      <div className="client-panel-container">
        <div className="client-grid-wrap">
          <div className="clients-grid" style={{ transition: 'all 0.38s cubic-bezier(0.16,1,0.3,1)' }}>
            {filteredClients.map((cl) => (
              <div
                key={cl.id}
                className={`client-card ${cl.type}${activeClient?.id === cl.id && isPanelOpen ? ' selected-card' : ''}`}
                onClick={() => {
                  if (activeClient?.id === cl.id && isPanelOpen) {
                    setIsPanelOpen(false); // 🔥 Плавное закрытие
                  } else {
                    setActiveClient(cl);
                    setIsPanelOpen(true);  // 🔥 Плавное открытие
                  }
                }}
                style={{ cursor: 'pointer' }}
              >
                <div className="client-card-top">
                  <div className="client-ava" style={{ background: `linear-gradient(135deg,${cl.c},${cl.c}bb)` }}>{cl.i}</div>
                  <div>
                    <div className="client-name">{cl.n}</div>
                    <div className="client-visits">{cl.v} визитов</div>
                  </div>
                  <div className={`client-badge ${cl.badge}`}>{cl.bl}</div>
                </div>

                <div className="client-stats">
                  <div className="client-stat"><div className="v">{cl.v}</div><div className="l">Визиты</div></div>
                  <div className="client-stat"><div className="v">{cl.spent}</div><div className="l">Итого</div></div>
                  <div className="client-stat">
                    <div className="v">{cl.ab}/{cl.abMax}</div>
                    <div className="l">Абон.</div>
                  </div>
                </div>

                <div className="abonement-label">
                  <span>Абонемент</span><span>{cl.ab}/{cl.abMax} занятий</span>
                </div>
                <div className="abonement-bar">
                  <div className="abonement-fill" style={{ width: `${(cl.ab / cl.abMax) * 100}%` }}></div>
                </div>

                <div className="loyalty-svg-chip">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                  </svg>
                  {(cl.v * 12).toLocaleString()} баллов
                  <span style={{ marginLeft: 'auto', fontSize: '9px', color: 'var(--text3)', fontWeight: 500 }}>
                    {cl.v >= 50 ? 'Gold' : cl.v >= 20 ? 'Silver' : 'Bronze'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className={`right-panel-wrapper ${isPanelOpen ? 'is-open' : ''}`}>
          <div className="right-panel-inner">
            {activeClient && (
              <ClientPanel
                key={activeClient.id}
                client={activeClient}
                onClose={() => setIsPanelOpen(false)}
              />
            )}
          </div>
        </div>
      </div>
    </>
  );
}