import { useState, useEffect, useRef } from 'react';

// ─── ТИПЫ ────────────────────────────────────────────────────────────────────
type Tab = typeof FINANCE_TABS[number];

// ─── КОНСТАНТЫ ───────────────────────────────────────────────────────────────
const FINANCE_TABS = [
  'Счета и кассы',
  'Операции',
  'Контрагенты',
  'Документы',
  'Онлайн-платежи',
  'Методы оплаты',
  'Отчёты',
  'Цели',
] as const;

// ─── ИКОНКИ SVG ──────────────────────────────────────────────────────────────
const IconArrowUp = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="19" x2="12" y2="5" /><polyline points="5 12 12 5 19 12" />
  </svg>
);
const IconArrowDown = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="5" x2="12" y2="19" /><polyline points="19 12 12 19 5 12" />
  </svg>
);
const IconPlus = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
    <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);
const IconSearch = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
    <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);
const IconFilter = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
    <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
  </svg>
);
const IconDownload = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);
const IconEdit = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
  </svg>
);
const IconTrash = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
    <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    <path d="M10 11v6" /><path d="M14 11v6" /><path d="M9 6V4h6v2" />
  </svg>
);
const IconDots = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <circle cx="12" cy="5" r="1" fill="currentColor" /><circle cx="12" cy="12" r="1" fill="currentColor" /><circle cx="12" cy="19" r="1" fill="currentColor" />
  </svg>
);
const IconTarget = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
    <circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" />
  </svg>
);
const IconCheck = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);
const IconCreditCard = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
    <rect x="1" y="4" width="22" height="16" rx="2" /><line x1="1" y1="10" x2="23" y2="10" />
  </svg>
);
const IconCash = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
    <rect x="2" y="6" width="20" height="12" rx="2" /><circle cx="12" cy="12" r="2" /><path d="M6 12h.01M18 12h.01" />
  </svg>
);
const IconPhone = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
    <rect x="5" y="2" width="14" height="20" rx="2" /><line x1="12" y1="18" x2="12.01" y2="18" strokeWidth="2.5" />
  </svg>
);
const IconBarChart = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
    <line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" />
  </svg>
);
const IconWorld = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
    <circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" />
    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
  </svg>
);
const IconChevronRight = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <polyline points="9 18 15 12 9 6" />
  </svg>
);
const IconFlag = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
    <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" /><line x1="4" y1="22" x2="4" y2="15" />
  </svg>
);
const IconTrendUp = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" />
  </svg>
);
const IconShield = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
  </svg>
);
const IconLightning = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
  </svg>
);
const IconBuilding = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" />
  </svg>
);
const IconUser = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
  </svg>
);
const IconDoc = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
    <line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" />
  </svg>
);
const IconQR = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
    <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" />
    <line x1="14" y1="14" x2="14" y2="14" strokeWidth="3" /><line x1="17" y1="14" x2="21" y2="14" /><line x1="17" y1="17" x2="17" y2="21" /><line x1="14" y1="17" x2="14" y2="21" /><line x1="21" y1="17" x2="21" y2="21" />
  </svg>
);

// ─── УТИЛИТЫ ─────────────────────────────────────────────────────────────────
const formatRub = (n: number) =>
  '₽' + n.toLocaleString('ru-RU', { minimumFractionDigits: 0 });

// ─── ДОНАЧНЫЕ ДАННЫЕ ──────────────────────────────────────────────────────────
const ACCOUNTS = [
  { id: 1, name: 'Основная касса', type: 'cash', balance: 485200, change: 48200, currency: '₽', color: '#FCAE91' },
  { id: 2, name: 'Расчётный счёт', type: 'bank', balance: 1840000, change: 82400, currency: '₽', color: '#A3C9A8' },
  { id: 3, name: 'Онлайн-кошелёк', type: 'online', balance: 94100, change: 34100, currency: '₽', color: '#7EB5D6' },
];

const OPERATIONS = [
  { id: 1, type: 'income', title: 'Оплата абонемента', client: 'Мария Коваленко', amount: 12000, date: 'Сегодня, 14:32', category: 'Абонементы', method: 'Карта', status: 'completed' },
  { id: 2, type: 'expense', title: 'Возврат средств', client: 'Иван Петров', amount: -2500, date: 'Сегодня, 11:15', category: 'Возврат', method: 'Наличные', status: 'completed' },
  { id: 3, type: 'income', title: 'Разовая запись', client: 'Елена Соколова', amount: 1200, date: 'Вчера, 18:45', category: 'Услуги', method: 'QR', status: 'completed' },
  { id: 4, type: 'expense', title: 'Аренда зала', client: 'Контрагент', amount: -8000, date: 'Вчера, 10:00', category: 'Аренда', method: 'Перевод', status: 'completed' },
  { id: 5, type: 'income', title: 'Оплата сертификата', client: 'Алексей Морозов', amount: 5000, date: '29 июн, 16:20', category: 'Сертификаты', method: 'Карта', status: 'completed' },
  { id: 6, type: 'income', title: 'Групповое занятие', client: 'Группа — 8 чел.', amount: 9600, date: '29 июн, 12:00', category: 'Услуги', method: 'Карта', status: 'completed' },
  { id: 7, type: 'expense', title: 'Зарплата тренеров', client: 'Команда', amount: -120000, date: '28 июн, 09:00', category: 'Зарплата', method: 'Перевод', status: 'completed' },
  { id: 8, type: 'income', title: 'Продление абонемента', client: 'Светлана Иванова', amount: 8500, date: '28 июн, 17:30', category: 'Абонементы', method: 'Карта', status: 'pending' },
];

const COUNTERPARTIES = [
  { id: 1, name: 'ООО «АрендаСтарт»', type: 'Юр. лицо', inn: '7701234567', category: 'Аренда', balance: -8000, deals: 24, color: '#FCAE91' },
  { id: 2, name: 'ИП Соколов Д.В.', type: 'ИП', inn: '500987654321', category: 'Поставщик', balance: -15400, deals: 8, color: '#7EB5D6' },
  { id: 3, name: 'ООО «КлинингПрофи»', type: 'Юр. лицо', inn: '7809876543', category: 'Клининг', balance: -6200, deals: 12, color: '#A3C9A8' },
  { id: 4, name: 'Власова А.С. (бух)', type: 'Физ. лицо', inn: '500123456789', category: 'Бухгалтерия', balance: -25000, deals: 6, color: '#D88C9A' },
];

const DOCUMENTS = [
  { id: 1, title: 'Акт выполненных работ №47', type: 'Акт', date: '30 июн 2025', party: 'ООО «АрендаСтарт»', amount: 8000, status: 'signed', ext: 'PDF' },
  { id: 2, title: 'Счёт-фактура №23', type: 'Счёт', date: '29 июн 2025', party: 'ИП Соколов Д.В.', amount: 15400, status: 'pending', ext: 'PDF' },
  { id: 3, title: 'Договор аренды (продление)', type: 'Договор', date: '01 июн 2025', party: 'ООО «АрендаСтарт»', amount: 96000, status: 'signed', ext: 'DOCX' },
  { id: 4, title: 'Кассовый отчёт — Июнь', type: 'Отчёт', date: '01 июл 2025', party: 'Внутренний', amount: 485200, status: 'draft', ext: 'XLSX' },
  { id: 5, title: 'УПД №112', type: 'УПД', date: '28 июн 2025', party: 'ООО «КлинингПрофи»', amount: 6200, status: 'signed', ext: 'PDF' },
];

const ONLINE_CHANNELS = [
  { id: 1, name: 'Ссылка на оплату', desc: 'Персональная страница записи и оплаты', icon: 'link', active: true, amount: 124300, sessions: 89 },
  { id: 2, name: 'QR-код', desc: 'Оплата по QR в студии или на сайте', icon: 'qr', active: true, amount: 38500, sessions: 32 },
  { id: 3, name: 'Telegram Pay', desc: 'Встроенная оплата в Telegram-боте', icon: 'telegram', active: false, amount: 0, sessions: 0 },
  { id: 4, name: 'Виджет на сайт', desc: 'JavaScript-виджет для вашего сайта', icon: 'widget', active: true, amount: 57200, sessions: 44 },
];

const PAYMENT_METHODS = [
  { id: 1, name: 'Банковская карта', desc: 'Visa, MasterCard, МИР', icon: 'card', enabled: true, commision: '1.8%', transactions: 312 },
  { id: 2, name: 'Наличные', desc: 'Приём наличных через кассу', icon: 'cash', enabled: true, commision: '0%', transactions: 87 },
  { id: 3, name: 'СБП (QR)', desc: 'Система быстрых платежей', icon: 'qr', enabled: true, commision: '0.4%', transactions: 56 },
  { id: 4, name: 'Apple Pay / Google Pay', desc: 'NFC и мобильные кошельки', icon: 'nfc', enabled: true, commision: '1.8%', transactions: 134 },
  { id: 5, name: 'Рассрочка (BNPL)', desc: 'Оплата по частям без переплаты', icon: 'bnpl', enabled: false, commision: '3.2%', transactions: 0 },
];

const REPORT_PERIODS = ['Сегодня', 'Неделя', 'Месяц', 'Квартал', 'Год'];

const GOALS = [
  { id: 1, title: 'Выручка — Июль 2025', target: 900000, current: 540200, deadline: '31 июл 2025', category: 'Выручка', color: '#FCAE91', priority: 'high' },
  { id: 2, title: 'Резервный фонд', target: 500000, current: 125000, deadline: '31 дек 2025', category: 'Резервы', color: '#A3C9A8', priority: 'medium' },
  { id: 3, title: 'Снизить расходы на 15%', target: 100, current: 62, deadline: '31 авг 2025', category: 'Оптимизация', color: '#7EB5D6', priority: 'medium' },
  { id: 4, title: 'Инвестиции в оборудование', target: 250000, current: 250000, deadline: '15 июн 2025', category: 'Инвестиции', color: '#D88C9A', priority: 'low' },
];

// ─── МАЛЕНЬКИЕ КОМПОНЕНТЫ ────────────────────────────────────────────────────
function Badge({ text, color, bg }: { text: string; color: string; bg: string }) {
  return (
    <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 700, background: bg, color, letterSpacing: '0.2px' }}>
      {text}
    </span>
  );
}

function ActionBtn({ children, onClick, variant = 'ghost' }: { children: React.ReactNode; onClick?: () => void; variant?: 'ghost' | 'primary' | 'danger' }) {
  const styles: Record<string, React.CSSProperties> = {
    ghost: { background: 'transparent', border: '1px solid var(--border)', color: 'var(--text2)' },
    primary: { background: 'var(--accent)', border: '1px solid var(--accent)', color: '#fff' },
    danger: { background: 'transparent', border: '1px solid var(--error)', color: 'var(--error)' },
  };
  return (
    <button
      onClick={onClick}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: '6px',
        padding: '7px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: 600,
        cursor: 'pointer', transition: 'all 0.15s',
        ...styles[variant],
      }}
    >
      {children}
    </button>
  );
}

// ─── TAB: СЧЕТА И КАССЫ ──────────────────────────────────────────────────────
function TabAccounts() {
  const [selected, setSelected] = useState<number | null>(null);
  const total = ACCOUNTS.reduce((s, a) => s + a.balance, 0);

  const donut = { r: 42, cx: 60, cy: 60 };
  const circumference = 2 * Math.PI * donut.r;
  const segments = [
    { pct: ACCOUNTS[0].balance / total, color: '#FCAE91' },
    { pct: ACCOUNTS[1].balance / total, color: '#A3C9A8' },
    { pct: ACCOUNTS[2].balance / total, color: '#7EB5D6' },
  ];
  let offset = 0;

  return (
    <>
      {/* Hero-блок */}
      <div className="finance-illus" style={{ position: 'relative', overflow: 'hidden' }}>
        {/* Декоративные кольца */}
        <svg width="120" height="120" viewBox="0 0 120 120" style={{ position: 'absolute', right: '24px', top: '50%', transform: 'translateY(-50%)' }}>
          {segments.map((seg, i) => {
            const dash = seg.pct * circumference;
            const gap = circumference - dash;
            const el = (
              <circle key={i} cx={donut.cx} cy={donut.cy} r={donut.r}
                fill="none" stroke={seg.color} strokeWidth="11"
                strokeDasharray={`${dash} ${gap}`}
                strokeDashoffset={-offset * circumference}
                strokeLinecap="round"
                transform={`rotate(-90 ${donut.cx} ${donut.cy})`}
                style={{ opacity: 0.85, filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.08))' }}
              />
            );
            offset += seg.pct;
            return el;
          })}
          <circle cx={donut.cx} cy={donut.cy} r={32} fill="white" style={{ filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.06))' }} />
          <text x={donut.cx} y={donut.cy - 6} textAnchor="middle" style={{ fontSize: '11px', fontWeight: 800, fill: '#1A1A1A', fontFamily: 'var(--font)' }}>2.4M</text>
          <text x={donut.cx} y={donut.cy + 10} textAnchor="middle" style={{ fontSize: '8px', fill: '#999', fontFamily: 'var(--font)' }}>₽ всего</text>
        </svg>

        <div style={{ textAlign: 'center', zIndex: 1 }}>
          <div style={{ fontSize: '11px', color: 'var(--text3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '8px' }}>
            Баланс всех счетов
          </div>
          <div style={{ fontSize: '44px', fontWeight: 800, letterSpacing: '-2px', color: 'var(--text)' }}>₽2 419 300</div>
          <div style={{ display: 'flex', gap: '6px', justifyContent: 'center', marginTop: '8px' }}>
            <span style={{ fontSize: '12px', color: '#5BAB72', fontWeight: 600, background: 'rgba(91,171,114,0.1)', padding: '3px 10px', borderRadius: '12px' }}>
              ↑ +₽164 700 сегодня
            </span>
          </div>
        </div>
      </div>

      {/* Карточки счетов */}
      <div className="grid-3 mb-20">
        {ACCOUNTS.map((acc) => (
          <div
            key={acc.id}
            className="card card-sm"
            onClick={() => setSelected(selected === acc.id ? null : acc.id)}
            style={{
              cursor: 'pointer',
              borderColor: selected === acc.id ? acc.color : 'var(--border)',
              borderWidth: selected === acc.id ? 2 : 1,
              transition: 'all 0.2s',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            {/* Цветная полоса сверху */}
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', background: acc.color, opacity: 0.7, borderRadius: '16px 16px 0 0' }} />

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px', paddingTop: '4px' }}>
              <div style={{ fontSize: '11px', color: 'var(--text3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                {acc.name}
              </div>
              <div style={{
                width: '28px', height: '28px', borderRadius: '8px',
                background: acc.color + '22', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {acc.type === 'cash' && <IconCash />}
                {acc.type === 'bank' && <IconCreditCard />}
                {acc.type === 'online' && <IconWorld />}
              </div>
            </div>
            <div style={{ fontSize: '26px', fontWeight: 800, marginBottom: '4px', letterSpacing: '-0.5px' }}>
              {formatRub(acc.balance)}
            </div>
            <div style={{ fontSize: '11px', color: '#5BAB72', fontWeight: 600 }}>
              ↑ +{formatRub(acc.change)} сегодня
            </div>

            {selected === acc.id && (
              <div style={{ marginTop: '14px', paddingTop: '14px', borderTop: '1px solid var(--border)', display: 'flex', gap: '8px' }}>
                <ActionBtn><IconEdit />Редактировать</ActionBtn>
                <ActionBtn><IconBarChart />История</ActionBtn>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Кнопка добавить счёт */}
      <button
        style={{
          width: '100%', border: '1.5px dashed var(--border)', borderRadius: '16px',
          padding: '16px', background: 'transparent', cursor: 'pointer', color: 'var(--text3)',
          fontSize: '13px', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
          transition: 'all 0.15s',
        }}
        onClick={() => alert('Добавить счёт')}
        onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--accent)', e.currentTarget.style.color = 'var(--accent)')}
        onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)', e.currentTarget.style.color = 'var(--text3)')}
      >
        <IconPlus /> Добавить счёт или кассу
      </button>
    </>
  );
}

// ─── TAB: ОПЕРАЦИИ ───────────────────────────────────────────────────────────
function TabOperations() {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'income' | 'expense'>('all');
  const [expanded, setExpanded] = useState<number | null>(null);

  const filtered = OPERATIONS.filter(op => {
    const matchFilter = filter === 'all' || op.type === filter;
    const matchSearch = op.title.toLowerCase().includes(search.toLowerCase()) ||
      op.client.toLowerCase().includes(search.toLowerCase());
    return matchFilter && matchSearch;
  });

  const totalIncome = OPERATIONS.filter(o => o.type === 'income').reduce((s, o) => s + Math.abs(o.amount), 0);
  const totalExpense = OPERATIONS.filter(o => o.type === 'expense').reduce((s, o) => s + Math.abs(o.amount), 0);

  return (
    <>
      {/* Мини-сводка */}
      <div className="grid-3 mb-20" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
        <div className="card card-sm" style={{ borderLeft: '3px solid #A3C9A8' }}>
          <div style={{ fontSize: '11px', color: 'var(--text3)', fontWeight: 600, marginBottom: '4px' }}>ПРИХОД СЕГОДНЯ</div>
          <div style={{ fontSize: '22px', fontWeight: 800, color: '#5BAB72' }}>+{formatRub(totalIncome)}</div>
        </div>
        <div className="card card-sm" style={{ borderLeft: '3px solid #D88C9A' }}>
          <div style={{ fontSize: '11px', color: 'var(--text3)', fontWeight: 600, marginBottom: '4px' }}>РАСХОД СЕГОДНЯ</div>
          <div style={{ fontSize: '22px', fontWeight: 800, color: '#D88C9A' }}>−{formatRub(totalExpense)}</div>
        </div>
        <div className="card card-sm" style={{ borderLeft: '3px solid var(--accent)' }}>
          <div style={{ fontSize: '11px', color: 'var(--text3)', fontWeight: 600, marginBottom: '4px' }}>БАЛАНС ДНЯ</div>
          <div style={{ fontSize: '22px', fontWeight: 800, color: 'var(--accent)' }}>+{formatRub(totalIncome - totalExpense)}</div>
        </div>
      </div>

      {/* Поиск и фильтр */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', alignItems: 'center' }}>
        <div style={{ flex: 1, position: 'relative' }}>
          <div style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)' }}>
            <IconSearch />
          </div>
          <input
            type="text"
            placeholder="Поиск операций..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="search-input"
            style={{ width: '100%', paddingLeft: '36px' }}
          />
        </div>
        {(['all', 'income', 'expense'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              padding: '8px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: 600,
              border: '1px solid',
              borderColor: filter === f ? 'var(--accent)' : 'var(--border)',
              background: filter === f ? 'var(--accent)' : 'transparent',
              color: filter === f ? '#fff' : 'var(--text2)',
              cursor: 'pointer', transition: 'all 0.15s',
            }}
          >
            {f === 'all' ? 'Все' : f === 'income' ? '↑ Приход' : '↓ Расход'}
          </button>
        ))}
        <ActionBtn><IconDownload />Экспорт</ActionBtn>
      </div>

      {/* Список операций */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {filtered.map((op, i) => {
          const isIncome = op.type === 'income';
          const color = isIncome ? '#5BAB72' : '#D88C9A';
          const isOpen = expanded === op.id;
          return (
            <div key={op.id}>
              <div
                onClick={() => setExpanded(isOpen ? null : op.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '12px',
                  padding: '14px 20px',
                  borderBottom: i < filtered.length - 1 ? '1px solid var(--border)' : 'none',
                  cursor: 'pointer',
                  background: isOpen ? 'rgba(252,174,145,0.04)' : 'transparent',
                  transition: 'background 0.15s',
                }}
              >
                {/* Иконка */}
                <div style={{
                  width: '38px', height: '38px', borderRadius: '10px',
                  background: color + '18', flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color,
                }}>
                  {isIncome ? <IconArrowUp /> : <IconArrowDown />}
                </div>

                {/* Инфо */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '2px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {op.title}
                    {op.status === 'pending' && (
                      <span style={{ fontSize: '10px', background: '#FFF3CD', color: '#856404', padding: '1px 7px', borderRadius: '10px', fontWeight: 700 }}>
                        Ожидание
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text3)' }}>{op.client} · {op.category}</div>
                </div>

                {/* Сумма и дата */}
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: '14px', fontWeight: 700, color }}>{isIncome ? '+' : '−'}{formatRub(Math.abs(op.amount))}</div>
                  <div style={{ fontSize: '10px', color: 'var(--text3)', marginTop: '2px' }}>{op.date}</div>
                </div>

                <div style={{ color: 'var(--text3)', transform: isOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }}>
                  <IconChevronRight />
                </div>
              </div>

              {/* Раскрытая детализация */}
              {isOpen && (
                <div style={{
                  background: 'rgba(252,174,145,0.04)', padding: '16px 20px',
                  borderBottom: i < filtered.length - 1 ? '1px solid var(--border)' : 'none',
                  display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px',
                }}>
                  {[
                    ['Метод оплаты', op.method],
                    ['Категория', op.category],
                    ['Статус', op.status === 'completed' ? 'Завершено' : 'Ожидание'],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <div style={{ fontSize: '10px', color: 'var(--text3)', fontWeight: 600, marginBottom: '3px' }}>{label}</div>
                      <div style={{ fontSize: '13px', fontWeight: 600 }}>{value}</div>
                    </div>
                  ))}
                  <div style={{ gridColumn: '1 / -1', display: 'flex', gap: '8px', paddingTop: '8px' }}>
                    <ActionBtn><IconEdit />Изменить</ActionBtn>
                    <ActionBtn><IconDoc />Квитанция</ActionBtn>
                    <ActionBtn variant="danger"><IconTrash />Удалить</ActionBtn>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}

// ─── TAB: КОНТРАГЕНТЫ ────────────────────────────────────────────────────────
function TabCounterparties() {
  const [selected, setSelected] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);

  return (
    <>
      {/* Иллюстрация-хедер */}
      <div className="card mb-20" style={{ padding: '24px 28px', display: 'flex', alignItems: 'center', gap: '28px', background: 'linear-gradient(135deg, rgba(252,174,145,0.07) 0%, transparent 60%)' }}>
        <svg width="80" height="80" viewBox="0 0 80 80" fill="none">
          {/* Стилизованная сеть контрагентов */}
          <circle cx="40" cy="40" r="38" stroke="var(--border)" strokeWidth="1" strokeDasharray="4 4" />
          <circle cx="40" cy="14" r="8" fill="rgba(252,174,145,0.2)" stroke="#FCAE91" strokeWidth="1.5" />
          <circle cx="66" cy="56" r="8" fill="rgba(163,201,168,0.2)" stroke="#A3C9A8" strokeWidth="1.5" />
          <circle cx="14" cy="56" r="8" fill="rgba(126,181,214,0.2)" stroke="#7EB5D6" strokeWidth="1.5" />
          <circle cx="40" cy="40" r="10" fill="rgba(252,174,145,0.15)" stroke="#FCAE91" strokeWidth="2" />
          <line x1="40" y1="22" x2="40" y2="30" stroke="var(--border)" strokeWidth="1.5" />
          <line x1="58" y1="50" x2="50" y2="46" stroke="var(--border)" strokeWidth="1.5" />
          <line x1="22" y1="50" x2="30" y2="46" stroke="var(--border)" strokeWidth="1.5" />
          <text x="40" y="43.5" textAnchor="middle" style={{ fontSize: '9px', fill: '#FCAE91', fontWeight: 700, fontFamily: 'var(--font)' }}>Вы</text>
        </svg>
        <div>
          <div style={{ fontSize: '18px', fontWeight: 800, marginBottom: '4px' }}>4 контрагента</div>
          <div style={{ fontSize: '13px', color: 'var(--text2)', lineHeight: 1.5 }}>
            Юридические лица, ИП и физические лица с которыми ведётся работа.
            Общая задолженность: <span style={{ color: '#D88C9A', fontWeight: 700 }}>₽54 600</span>
          </div>
        </div>
        <div style={{ marginLeft: 'auto', flexShrink: 0 }}>
          <button
            onClick={() => setAdding(true)}
            className="topbar-btn"
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <IconPlus /> Добавить
          </button>
        </div>
      </div>

      {adding && (
        <div className="card mb-20" style={{ border: '1.5px solid var(--accent)', background: 'rgba(252,174,145,0.04)' }}>
          <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '16px' }}>Новый контрагент</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
            {['Название / ФИО', 'ИНН', 'Тип', 'Категория'].map(label => (
              <div key={label}>
                <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text3)', marginBottom: '6px' }}>{label}</div>
                <input className="search-input" style={{ width: '100%' }} placeholder={label} />
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <ActionBtn variant="primary" onClick={() => setAdding(false)}>Сохранить</ActionBtn>
            <ActionBtn onClick={() => setAdding(false)}>Отмена</ActionBtn>
          </div>
        </div>
      )}

      {/* Таблица контрагентов */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {COUNTERPARTIES.map((cp, i) => (
          <div key={cp.id}>
            <div
              onClick={() => setSelected(selected === cp.id ? null : cp.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: '14px',
                padding: '16px 20px',
                borderBottom: i < COUNTERPARTIES.length - 1 ? '1px solid var(--border)' : 'none',
                cursor: 'pointer',
                background: selected === cp.id ? 'rgba(252,174,145,0.04)' : 'transparent',
              }}
            >
              {/* Аватар */}
              <div style={{
                width: '42px', height: '42px', borderRadius: '12px', flexShrink: 0,
                background: cp.color + '22', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '11px', fontWeight: 800, color: cp.color,
              }}>
                {cp.type === 'Физ. лицо' ? <IconUser /> : <IconBuilding />}
              </div>

              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '2px' }}>{cp.name}</div>
                <div style={{ fontSize: '11px', color: 'var(--text3)' }}>{cp.type} · ИНН {cp.inn}</div>
              </div>

              <Badge text={cp.category} color={cp.color} bg={cp.color + '18'} />

              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#D88C9A' }}>{formatRub(Math.abs(cp.balance))}</div>
                <div style={{ fontSize: '10px', color: 'var(--text3)' }}>{cp.deals} сделок</div>
              </div>

              <div style={{ color: 'var(--text3)', transform: selected === cp.id ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }}>
                <IconChevronRight />
              </div>
            </div>

            {selected === cp.id && (
              <div style={{ background: 'rgba(252,174,145,0.04)', padding: '16px 20px', borderBottom: i < COUNTERPARTIES.length - 1 ? '1px solid var(--border)' : 'none' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '14px' }}>
                  {[
                    ['Сделок всего', cp.deals],
                    ['Задолженность', formatRub(Math.abs(cp.balance))],
                    ['Категория', cp.category],
                  ].map(([l, v]) => (
                    <div key={l as string}>
                      <div style={{ fontSize: '10px', color: 'var(--text3)', fontWeight: 600, marginBottom: '3px' }}>{l}</div>
                      <div style={{ fontSize: '14px', fontWeight: 700 }}>{v}</div>
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <ActionBtn><IconDoc />Документы</ActionBtn>
                  <ActionBtn><IconEdit />Редактировать</ActionBtn>
                  <ActionBtn variant="danger"><IconTrash />Удалить</ActionBtn>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
}

// ─── TAB: ДОКУМЕНТЫ ──────────────────────────────────────────────────────────
function TabDocuments() {
  const [search, setSearch] = useState('');

  const statusMeta: Record<string, { label: string; color: string; bg: string }> = {
    signed: { label: 'Подписан', color: '#2d7a47', bg: 'rgba(163,201,168,0.2)' },
    pending: { label: 'Ожидание', color: '#856404', bg: 'rgba(255,193,7,0.15)' },
    draft: { label: 'Черновик', color: '#666', bg: 'rgba(0,0,0,0.06)' },
  };

  const extColors: Record<string, string> = { PDF: '#D88C9A', DOCX: '#7EB5D6', XLSX: '#A3C9A8' };

  const filtered = DOCUMENTS.filter(d =>
    d.title.toLowerCase().includes(search.toLowerCase()) ||
    d.party.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <>
      {/* Счётчики статусов */}
      <div className="grid-3 mb-20" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        {[
          { label: 'Подписано', count: DOCUMENTS.filter(d => d.status === 'signed').length, color: '#A3C9A8' },
          { label: 'Ожидает подписи', count: DOCUMENTS.filter(d => d.status === 'pending').length, color: '#F0C060' },
          { label: 'Черновики', count: DOCUMENTS.filter(d => d.status === 'draft').length, color: '#B0B0B0' },
        ].map(stat => (
          <div key={stat.label} className="card card-sm" style={{ borderTop: `3px solid ${stat.color}` }}>
            <div style={{ fontSize: '32px', fontWeight: 800, marginBottom: '4px' }}>{stat.count}</div>
            <div style={{ fontSize: '12px', color: 'var(--text3)', fontWeight: 600 }}>{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Поиск */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
        <div style={{ flex: 1, position: 'relative' }}>
          <div style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)' }}>
            <IconSearch />
          </div>
          <input type="text" placeholder="Поиск документов..." value={search} onChange={e => setSearch(e.target.value)} className="search-input" style={{ width: '100%', paddingLeft: '36px' }} />
        </div>
        <ActionBtn><IconFilter />Фильтр</ActionBtn>
        <ActionBtn><IconDownload />Скачать всё</ActionBtn>
      </div>

      {/* Список документов */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {filtered.map((doc, i) => {
          const sm = statusMeta[doc.status];
          const extColor = extColors[doc.ext] || '#999';
          return (
            <div
              key={doc.id}
              style={{
                display: 'flex', alignItems: 'center', gap: '14px',
                padding: '16px 20px',
                borderBottom: i < filtered.length - 1 ? '1px solid var(--border)' : 'none',
              }}
            >
              {/* Иконка формата */}
              <div style={{
                width: '42px', height: '48px', borderRadius: '8px', background: extColor + '18',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0, gap: '2px',
              }}>
                <IconDoc />
                <span style={{ fontSize: '8px', fontWeight: 800, color: extColor }}>{doc.ext}</span>
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {doc.title}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text3)' }}>{doc.party} · {doc.date}</div>
              </div>

              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '4px' }}>{formatRub(doc.amount)}</div>
                <Badge text={sm.label} color={sm.color} bg={sm.bg} />
              </div>

              <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                <button style={{ width: '30px', height: '30px', borderRadius: '8px', border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text3)' }} title="Скачать">
                  <IconDownload />
                </button>
                <button style={{ width: '30px', height: '30px', borderRadius: '8px', border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text3)' }} title="Ещё">
                  <IconDots />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Кнопка создать */}
      <div style={{ marginTop: '12px' }}>
        <button
          onClick={() => alert('Создать документ')}
          style={{
            width: '100%', border: '1.5px dashed var(--border)', borderRadius: '16px',
            padding: '16px', background: 'transparent', cursor: 'pointer', color: 'var(--text3)',
            fontSize: '13px', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
            transition: 'all 0.15s',
          }}
          onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--accent)', e.currentTarget.style.color = 'var(--accent)')}
          onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)', e.currentTarget.style.color = 'var(--text3)')}
        >
          <IconPlus /> Создать новый документ
        </button>
      </div>
    </>
  );
}

// ─── TAB: ОНЛАЙН-ПЛАТЕЖИ ─────────────────────────────────────────────────────
function TabOnlinePayments() {
  const [channels, setChannels] = useState(ONLINE_CHANNELS);
  const [copied, setCopied] = useState(false);

  const toggleChannel = (id: number) => {
    setChannels(prev => prev.map(c => c.id === id ? { ...c, active: !c.active } : c));
  };

  const handleCopy = () => {
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const IconsMap: Record<string, React.ReactNode> = {
    link: <IconWorld />,
    qr: <IconQR />,
    widget: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M9 21V9" /></svg>,
    telegram: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M22 2L11 13M22 2L15 22l-4-9-9-4 20-7z" /></svg>,
  };

  const total = channels.filter(c => c.active).reduce((s, c) => s + c.amount, 0);

  return (
    <>
      {/* Иллюстрация воронки онлайн-платежей */}
      <div className="card mb-20" style={{ padding: '0', overflow: 'hidden' }}>
        <div style={{ padding: '24px 28px 20px', background: 'linear-gradient(135deg, rgba(126,181,214,0.08) 0%, transparent 70%)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: '11px', color: 'var(--text3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: '6px' }}>
                Онлайн-оборот за месяц
              </div>
              <div style={{ fontSize: '36px', fontWeight: 800, letterSpacing: '-1px', marginBottom: '6px' }}>{formatRub(total)}</div>
              <div style={{ fontSize: '13px', color: 'var(--text2)' }}>
                {channels.filter(c => c.active).reduce((s, c) => s + c.sessions, 0)} сессий оплаты
              </div>
            </div>

            {/* SVG-иллюстрация: воронка каналов */}
            <svg width="140" height="90" viewBox="0 0 140 90" fill="none">
              {/* Каналы → центр → деньги */}
              <circle cx="20" cy="20" r="12" fill="rgba(126,181,214,0.15)" stroke="#7EB5D6" strokeWidth="1.5" />
              <circle cx="20" cy="45" r="12" fill="rgba(163,201,168,0.15)" stroke="#A3C9A8" strokeWidth="1.5" />
              <circle cx="20" cy="70" r="12" fill="rgba(252,174,145,0.15)" stroke="#FCAE91" strokeWidth="1.5" />
              <text x="20" y="24" textAnchor="middle" style={{ fontSize: '7px', fill: '#7EB5D6', fontWeight: 700, fontFamily: 'var(--font)' }}>QR</text>
              <text x="20" y="49" textAnchor="middle" style={{ fontSize: '7px', fill: '#A3C9A8', fontWeight: 700, fontFamily: 'var(--font)' }}>Link</text>
              <text x="20" y="74" textAnchor="middle" style={{ fontSize: '7px', fill: '#FCAE91', fontWeight: 700, fontFamily: 'var(--font)' }}>Web</text>
              <line x1="32" y1="20" x2="68" y2="42" stroke="var(--border)" strokeWidth="1" strokeDasharray="3 3" />
              <line x1="32" y1="45" x2="68" y2="45" stroke="var(--border)" strokeWidth="1" strokeDasharray="3 3" />
              <line x1="32" y1="70" x2="68" y2="48" stroke="var(--border)" strokeWidth="1" strokeDasharray="3 3" />
              <circle cx="80" cy="45" r="18" fill="rgba(252,174,145,0.12)" stroke="#FCAE91" strokeWidth="2" />
              <text x="80" y="42" textAnchor="middle" style={{ fontSize: '8px', fill: '#FCAE91', fontWeight: 800, fontFamily: 'var(--font)' }}>₽</text>
              <text x="80" y="53" textAnchor="middle" style={{ fontSize: '7px', fill: 'var(--text3)', fontFamily: 'var(--font)' }}>касса</text>
              <line x1="98" y1="45" x2="126" y2="45" stroke="#FCAE91" strokeWidth="1.5" markerEnd="url()" strokeDasharray="3 3" />
              <text x="128" y="42" style={{ fontSize: '8px', fill: '#5BAB72', fontWeight: 700, fontFamily: 'var(--font)' }}>✓</text>
            </svg>
          </div>
        </div>

        {/* Ссылка для оплаты */}
        <div style={{ padding: '14px 28px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ flex: 1, background: 'var(--bg2)', borderRadius: '8px', padding: '8px 12px', fontSize: '12px', color: 'var(--text3)', fontFamily: 'monospace' }}>
            pay.velora.studio/p/velora-pilates
          </div>
          <ActionBtn onClick={handleCopy} variant={copied ? 'primary' : 'ghost'}>
            {copied ? <><IconCheck /> Скопировано</> : <>Копировать ссылку</>}
          </ActionBtn>
        </div>
      </div>

      {/* Каналы */}
      <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: '12px' }}>
        Каналы приёма платежей
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {channels.map(ch => (
          <div
            key={ch.id}
            className="card card-sm"
            style={{
              display: 'flex', alignItems: 'center', gap: '14px',
              opacity: ch.active ? 1 : 0.5, transition: 'opacity 0.2s',
            }}
          >
            <div style={{
              width: '42px', height: '42px', borderRadius: '10px', flexShrink: 0,
              background: ch.active ? 'rgba(252,174,145,0.15)' : 'rgba(0,0,0,0.04)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: ch.active ? 'var(--accent)' : 'var(--text3)',
            }}>
              {IconsMap[ch.icon]}
            </div>

            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '2px' }}>{ch.name}</div>
              <div style={{ fontSize: '12px', color: 'var(--text3)' }}>{ch.desc}</div>
            </div>

            {ch.active && (
              <div style={{ textAlign: 'right', marginRight: '12px' }}>
                <div style={{ fontSize: '14px', fontWeight: 700 }}>{formatRub(ch.amount)}</div>
                <div style={{ fontSize: '10px', color: 'var(--text3)' }}>{ch.sessions} сессий</div>
              </div>
            )}

            {/* Тоггл */}
            <div
              onClick={() => toggleChannel(ch.id)}
              style={{
                width: '44px', height: '24px', borderRadius: '12px', flexShrink: 0,
                background: ch.active ? 'var(--accent)' : 'var(--border)',
                position: 'relative', cursor: 'pointer', transition: 'background 0.2s',
              }}
            >
              <div style={{
                position: 'absolute', top: '3px',
                left: ch.active ? '22px' : '3px',
                width: '18px', height: '18px', borderRadius: '50%',
                background: 'white', transition: 'left 0.2s',
                boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
              }} />
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

// ─── TAB: МЕТОДЫ ОПЛАТЫ ──────────────────────────────────────────────────────
function TabPaymentMethods() {
  const [methods, setMethods] = useState(PAYMENT_METHODS);

  const toggle = (id: number) => setMethods(prev => prev.map(m => m.id === id ? { ...m, enabled: !m.enabled } : m));

  const IconsMap: Record<string, React.ReactNode> = {
    card: <IconCreditCard />,
    cash: <IconCash />,
    qr: <IconQR />,
    nfc: <IconPhone />,
    bnpl: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <rect x="1" y="4" width="22" height="16" rx="2" />
        <path d="M8 10h2l2 4 2-6 2 4" />
      </svg>
    ),
  };

  return (
    <>
      {/* Статистика */}
      <div className="grid-3 mb-20" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        {[
          { label: 'Методов активно', val: methods.filter(m => m.enabled).length + ' из ' + methods.length },
          { label: 'Транзакций за месяц', val: methods.reduce((s, m) => s + m.transactions, 0).toLocaleString('ru-RU') },
          { label: 'Средняя комиссия', val: '1.2%' },
        ].map(s => (
          <div key={s.label} className="card card-sm">
            <div style={{ fontSize: '11px', color: 'var(--text3)', fontWeight: 600, marginBottom: '6px' }}>{s.label}</div>
            <div style={{ fontSize: '24px', fontWeight: 800 }}>{s.val}</div>
          </div>
        ))}
      </div>

      {/* Иллюстрация: распределение по методам */}
      <div className="card mb-20" style={{ padding: '20px 24px' }}>
        <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '14px' }}>Распределение транзакций</div>
        <div style={{ display: 'flex', gap: '0', height: '10px', borderRadius: '10px', overflow: 'hidden', marginBottom: '12px' }}>
          {methods.filter(m => m.transactions > 0).map((m, i) => {
            const total = methods.reduce((s, x) => s + x.transactions, 0);
            const pct = (m.transactions / total) * 100;
            const colors = ['#FCAE91', '#A3C9A8', '#7EB5D6', '#D88C9A', '#B0B8C8'];
            return <div key={m.id} style={{ width: `${pct}%`, background: colors[i % colors.length], transition: 'width 0.4s' }} />;
          })}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
          {methods.filter(m => m.transactions > 0).map((m, i) => {
            const total = methods.reduce((s, x) => s + x.transactions, 0);
            const colors = ['#FCAE91', '#A3C9A8', '#7EB5D6', '#D88C9A', '#B0B8C8'];
            return (
              <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--text2)' }}>
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: colors[i % colors.length] }} />
                {m.name.split(' ')[0]} — {m.transactions} ({Math.round(m.transactions / total * 100)}%)
              </div>
            );
          })}
        </div>
      </div>

      {/* Список методов */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {methods.map(m => (
          <div
            key={m.id}
            className="card card-sm"
            style={{
              display: 'flex', alignItems: 'center', gap: '14px',
              opacity: m.enabled ? 1 : 0.5, transition: 'opacity 0.2s',
            }}
          >
            <div style={{
              width: '42px', height: '42px', borderRadius: '10px', flexShrink: 0,
              background: m.enabled ? 'rgba(252,174,145,0.15)' : 'rgba(0,0,0,0.04)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: m.enabled ? 'var(--accent)' : 'var(--text3)',
            }}>
              {IconsMap[m.icon]}
            </div>

            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '2px' }}>{m.name}</div>
              <div style={{ fontSize: '12px', color: 'var(--text3)' }}>{m.desc}</div>
            </div>

            <div style={{ textAlign: 'center', flexShrink: 0 }}>
              <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text2)' }}>{m.commision}</div>
              <div style={{ fontSize: '10px', color: 'var(--text3)' }}>комиссия</div>
            </div>

            <div style={{ textAlign: 'center', flexShrink: 0, marginLeft: '8px' }}>
              <div style={{ fontSize: '13px', fontWeight: 700 }}>{m.transactions}</div>
              <div style={{ fontSize: '10px', color: 'var(--text3)' }}>операций</div>
            </div>

            <div
              onClick={() => toggle(m.id)}
              style={{
                width: '44px', height: '24px', borderRadius: '12px', flexShrink: 0,
                background: m.enabled ? 'var(--accent)' : 'var(--border)',
                position: 'relative', cursor: 'pointer', transition: 'background 0.2s',
              }}
            >
              <div style={{
                position: 'absolute', top: '3px',
                left: m.enabled ? '22px' : '3px',
                width: '18px', height: '18px', borderRadius: '50%',
                background: 'white', transition: 'left 0.2s',
                boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
              }} />
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

// ─── TAB: ОТЧЁТЫ ─────────────────────────────────────────────────────────────
function TabReports() {
  const [period, setPeriod] = useState('Месяц');

  const months = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн'];
  const income = [420000, 510000, 480000, 620000, 700000, 760000];
  const expense = [210000, 240000, 220000, 290000, 310000, 330000];
  const maxVal = Math.max(...income);

  const cats = [
    { label: 'Абонементы', val: 340000, pct: 44, color: '#FCAE91' },
    { label: 'Услуги', val: 220000, pct: 29, color: '#A3C9A8' },
    { label: 'Сертификаты', val: 100000, pct: 13, color: '#7EB5D6' },
    { label: 'Аренда', val: 60000, pct: 8, color: '#D88C9A' },
    { label: 'Прочее', val: 40000, pct: 6, color: '#B0B8C8' },
  ];

  return (
    <>
      {/* Период */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '20px' }}>
        {REPORT_PERIODS.map(p => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            style={{
              padding: '7px 16px', borderRadius: '8px', fontSize: '12px', fontWeight: 600,
              border: '1px solid', cursor: 'pointer', transition: 'all 0.15s',
              borderColor: period === p ? 'var(--accent)' : 'var(--border)',
              background: period === p ? 'var(--accent)' : 'transparent',
              color: period === p ? '#fff' : 'var(--text2)',
            }}
          >
            {p}
          </button>
        ))}
        <div style={{ marginLeft: 'auto' }}>
          <ActionBtn><IconDownload />Скачать отчёт</ActionBtn>
        </div>
      </div>

      {/* Сводные KPI */}
      <div className="grid-3 mb-20" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        {[
          { label: 'ВЫРУЧКА', val: '₽760 000', delta: '+8.6%', good: true },
          { label: 'РАСХОДЫ', val: '₽330 000', delta: '+6.4%', good: false },
          { label: 'ПРИБЫЛЬ', val: '₽430 000', delta: '+10.3%', good: true },
          { label: 'МАРЖА', val: '56.6%', delta: '+1.2 п.п.', good: true },
        ].map(kpi => (
          <div key={kpi.label} className="card card-sm">
            <div style={{ fontSize: '10px', color: 'var(--text3)', fontWeight: 700, letterSpacing: '0.5px', marginBottom: '6px' }}>{kpi.label}</div>
            <div style={{ fontSize: '22px', fontWeight: 800, marginBottom: '4px' }}>{kpi.val}</div>
            <div style={{ fontSize: '11px', fontWeight: 600, color: kpi.good ? '#5BAB72' : '#D88C9A' }}>{kpi.delta} vs пред.</div>
          </div>
        ))}
      </div>

      {/* Бар-чарт доходы vs расходы */}
      <div className="card mb-20" style={{ padding: '24px 28px' }}>
        <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '20px' }}>Динамика доходов и расходов</div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '12px', height: '140px' }}>
          {months.map((m, i) => (
            <div key={m} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', height: '100%' }}>
              <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end', gap: '3px', width: '100%' }}>
                {/* Доход */}
                <div style={{
                  flex: 1, background: 'rgba(163,201,168,0.6)',
                  height: `${(income[i] / maxVal) * 100}%`,
                  borderRadius: '4px 4px 0 0', minHeight: '4px',
                  transition: 'height 0.4s',
                  position: 'relative',
                }}
                  title={`Доход: ${formatRub(income[i])}`}
                />
                {/* Расход */}
                <div style={{
                  flex: 1, background: 'rgba(216,140,154,0.5)',
                  height: `${(expense[i] / maxVal) * 100}%`,
                  borderRadius: '4px 4px 0 0', minHeight: '4px',
                  transition: 'height 0.4s',
                }}
                  title={`Расход: ${formatRub(expense[i])}`}
                />
              </div>
              <div style={{ fontSize: '10px', color: 'var(--text3)', fontWeight: 600 }}>{m}</div>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '16px', marginTop: '12px' }}>
          {[['Доходы', 'rgba(163,201,168,0.7)'], ['Расходы', 'rgba(216,140,154,0.6)']].map(([label, color]) => (
            <div key={label as string} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--text2)' }}>
              <div style={{ width: '10px', height: '10px', borderRadius: '3px', background: color as string }} />
              {label}
            </div>
          ))}
        </div>
      </div>

      {/* Структура выручки */}
      <div className="card" style={{ padding: '24px 28px' }}>
        <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '16px' }}>Структура выручки</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {cats.map(cat => (
            <div key={cat.label}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                <span style={{ fontSize: '13px', fontWeight: 600 }}>{cat.label}</span>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                  <span style={{ fontSize: '12px', color: 'var(--text3)' }}>{cat.pct}%</span>
                  <span style={{ fontSize: '13px', fontWeight: 700 }}>{formatRub(cat.val)}</span>
                </div>
              </div>
              <div style={{ height: '6px', background: 'var(--border)', borderRadius: '10px', overflow: 'hidden' }}>
                <div style={{ width: `${cat.pct}%`, height: '100%', background: cat.color, borderRadius: '10px', transition: 'width 0.5s' }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

// ─── TAB: ЦЕЛИ ───────────────────────────────────────────────────────────────
function TabGoals() {
  const [goals, setGoals] = useState(GOALS);
  const [addOpen, setAddOpen] = useState(false);

  const priorityMeta: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
    high: { label: 'Высокий', color: '#D88C9A', icon: <IconFlag /> },
    medium: { label: 'Средний', color: '#F0C060', icon: <IconTrendUp /> },
    low: { label: 'Низкий', color: '#A3C9A8', icon: <IconShield /> },
  };

  return (
    <>
      {/* Hero: общий прогресс */}
      <div className="card mb-20" style={{ padding: '28px 32px', background: 'linear-gradient(135deg, rgba(252,174,145,0.08) 0%, rgba(163,201,168,0.06) 100%)', position: 'relative', overflow: 'hidden' }}>
        {/* Декоративная цель-иллюстрация */}
        <svg width="100" height="100" viewBox="0 0 100 100" style={{ position: 'absolute', right: '32px', top: '50%', transform: 'translateY(-50%)', opacity: 0.9 }}>
          <circle cx="50" cy="50" r="44" fill="none" stroke="rgba(252,174,145,0.15)" strokeWidth="2" />
          <circle cx="50" cy="50" r="34" fill="none" stroke="rgba(252,174,145,0.2)" strokeWidth="2" />
          <circle cx="50" cy="50" r="24" fill="none" stroke="rgba(252,174,145,0.3)" strokeWidth="2" />
          <circle cx="50" cy="50" r="14" fill="none" stroke="rgba(252,174,145,0.5)" strokeWidth="2" />
          <circle cx="50" cy="50" r="5" fill="#FCAE91" />
          {/* Стрела */}
          <line x1="75" y1="25" x2="54" y2="48" stroke="#FCAE91" strokeWidth="2" strokeLinecap="round" />
          <polygon points="75,25 68,30 79,32" fill="#FCAE91" />
        </svg>

        <div style={{ maxWidth: '65%' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: '8px' }}>
            Финансовые цели бизнеса
          </div>
          <div style={{ fontSize: '32px', fontWeight: 800, letterSpacing: '-0.5px', marginBottom: '8px' }}>
            {goals.filter(g => {
              const pct = Math.round((g.current / g.target) * 100);
              return pct >= 100;
            }).length} из {goals.length}
          </div>
          <div style={{ fontSize: '13px', color: 'var(--text2)', lineHeight: 1.6 }}>
            целей достигнуто. Отслеживайте прогресс, ставьте амбициозные планки и контролируйте движение к ним каждый день.
          </div>
        </div>
      </div>

      {/* Список целей */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '16px' }}>
        {goals.map(g => {
          const pct = Math.min(100, Math.round((g.current / g.target) * 100));
          const done = pct >= 100;
          const pm = priorityMeta[g.priority];

          return (
            <div key={g.id} className="card" style={{ padding: '20px 24px', borderLeft: `3px solid ${g.color}` }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', marginBottom: '14px' }}>
                {/* Иконка цели */}
                <div style={{
                  width: '40px', height: '40px', borderRadius: '10px', flexShrink: 0,
                  background: g.color + '22',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: g.color,
                }}>
                  {done ? <IconCheck /> : <IconTarget />}
                </div>

                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px', flexWrap: 'wrap' }}>
                    <div style={{ fontSize: '14px', fontWeight: 700 }}>{g.title}</div>
                    {done && <Badge text="Выполнено ✓" color="#2d7a47" bg="rgba(163,201,168,0.2)" />}
                    <Badge text={pm.label} color={pm.color} bg={pm.color + '18'} />
                    <Badge text={g.category} color="var(--text3)" bg="var(--bg2)" />
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text3)' }}>Срок: {g.deadline}</div>
                </div>

                {/* Процент */}
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: '24px', fontWeight: 800, color: done ? '#5BAB72' : g.color, letterSpacing: '-0.5px' }}>
                    {pct}%
                  </div>
                </div>
              </div>

              {/* Прогресс-бар */}
              <div style={{ position: 'relative', marginBottom: '10px' }}>
                <div style={{ height: '8px', background: 'var(--border)', borderRadius: '10px', overflow: 'hidden' }}>
                  <div style={{
                    width: `${pct}%`, height: '100%',
                    background: done ? '#A3C9A8' : g.color,
                    borderRadius: '10px',
                    transition: 'width 0.6s ease',
                    opacity: 0.85,
                  }} />
                </div>
              </div>

              {/* Суммы */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontSize: '12px', color: 'var(--text2)' }}>
                  <span style={{ fontWeight: 700, color: 'var(--text)' }}>
                    {g.category === 'Оптимизация' ? `${g.current}%` : formatRub(g.current)}
                  </span>
                  {' '}из{' '}
                  <span style={{ color: 'var(--text3)' }}>
                    {g.category === 'Оптимизация' ? `${g.target}%` : formatRub(g.target)}
                  </span>
                </div>
                {!done && (
                  <div style={{ fontSize: '12px', color: 'var(--text3)' }}>
                    Осталось: <span style={{ fontWeight: 700, color: g.color }}>
                      {g.category === 'Оптимизация'
                        ? `${g.target - g.current}%`
                        : formatRub(g.target - g.current)}
                    </span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Добавить цель */}
      {addOpen ? (
        <div className="card" style={{ border: '1.5px solid var(--accent)', background: 'rgba(252,174,145,0.04)' }}>
          <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <IconTarget /> Новая финансовая цель
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
            {[
              { label: 'Название цели', placeholder: 'Например: Резервный фонд' },
              { label: 'Целевая сумма', placeholder: '₽ 500 000' },
              { label: 'Дедлайн', placeholder: '31.12.2025' },
              { label: 'Категория', placeholder: 'Резервы' },
            ].map(f => (
              <div key={f.label}>
                <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text3)', marginBottom: '6px' }}>{f.label}</div>
                <input className="search-input" style={{ width: '100%' }} placeholder={f.placeholder} />
              </div>
            ))}
          </div>
          {/* Приоритет */}
          <div style={{ marginBottom: '16px' }}>
            <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text3)', marginBottom: '8px' }}>ПРИОРИТЕТ</div>
            <div style={{ display: 'flex', gap: '8px' }}>
              {[
                { val: 'high', label: 'Высокий', color: '#D88C9A' },
                { val: 'medium', label: 'Средний', color: '#F0C060' },
                { val: 'low', label: 'Низкий', color: '#A3C9A8' },
              ].map(p => (
                <button key={p.val} style={{ padding: '6px 14px', borderRadius: '8px', border: `1px solid ${p.color}44`, background: p.color + '18', color: p.color, fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <ActionBtn variant="primary" onClick={() => setAddOpen(false)}>Создать цель</ActionBtn>
            <ActionBtn onClick={() => setAddOpen(false)}>Отмена</ActionBtn>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setAddOpen(true)}
          style={{
            width: '100%', border: '1.5px dashed var(--border)', borderRadius: '16px',
            padding: '18px', background: 'transparent', cursor: 'pointer', color: 'var(--text3)',
            fontSize: '13px', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
            transition: 'all 0.15s',
          }}
          onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--accent)', e.currentTarget.style.color = 'var(--accent)')}
          onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)', e.currentTarget.style.color = 'var(--text3)')}
        >
          <IconPlus />Добавить финансовую цель
        </button>
      )}
    </>
  );
}

// ─── ГЛАВНЫЙ КОМПОНЕНТ ────────────────────────────────────────────────────────
export default function Finances() {
  const [activeTab, setActiveTab] = useState<Tab>('Счета и кассы');

  const TAB_ICONS: Record<Tab, React.ReactNode> = {
    'Счета и кассы': <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>,
    'Операции': <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><polyline points="17 1 21 5 17 9" /><path d="M3 11V9a4 4 0 0 1 4-4h14" /><polyline points="7 23 3 19 7 15" /><path d="M21 13v2a4 4 0 0 1-4 4H3" /></svg>,
    'Контрагенты': <IconBuilding />,
    'Документы': <IconDoc />,
    'Онлайн-платежи': <IconWorld />,
    'Методы оплаты': <IconCreditCard />,
    'Отчёты': <IconBarChart />,
    'Цели': <IconTarget />,
  };

  const renderTab = () => {
    switch (activeTab) {
      case 'Счета и кассы': return <TabAccounts />;
      case 'Операции': return <TabOperations />;
      case 'Контрагенты': return <TabCounterparties />;
      case 'Документы': return <TabDocuments />;
      case 'Онлайн-платежи': return <TabOnlinePayments />;
      case 'Методы оплаты': return <TabPaymentMethods />;
      case 'Отчёты': return <TabReports />;
      case 'Цели': return <TabGoals />;
      default: return null;
    }
  };

  return (
    <>
      {/* Табы */}
      <div className="finance-tabs-big">
        {FINANCE_TABS.map((t) => (
          <div
            key={t}
            className={`ftab ${activeTab === t ? 'active' : ''}`}
            onClick={() => setActiveTab(t)}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <span style={{ opacity: activeTab === t ? 1 : 0.5 }}>{TAB_ICONS[t]}</span>
            {t}
          </div>
        ))}
      </div>

      {/* Контент */}
      <div key={activeTab}>
        {renderTab()}
      </div>
    </>
  );
}