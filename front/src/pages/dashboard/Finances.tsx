import { useState, useRef } from 'react';
import { createPortal } from 'react-dom';

// ─── ТИПЫ ─────────────────────────────────────────────────────────────────────
type Tab = typeof FINANCE_TABS[number];
type ToastType = 'success' | 'error' | 'info';

// ─── КОНСТАНТЫ ────────────────────────────────────────────────────────────────
const FINANCE_TABS = [
  'Счета и кассы', 'Операции', 'Контрагенты', 'Документы',
  'Онлайн-платежи', 'Методы оплаты', 'Отчёты', 'Цели',
] as const;

// ─── ДАННЫЕ ───────────────────────────────────────────────────────────────────
const ACCOUNTS_DATA = [
  { id: 1, name: 'Касса студии', type: 'cash', balance: 485200, change: 48200, color: '#FCAE91', isSystem: true },
  { id: 2, name: 'Расчётный счёт', type: 'bank', balance: 1840000, change: 82400, color: '#A3C9A8', isSystem: true },
  { id: 3, name: 'Онлайн-эквайринг', type: 'online', balance: 94100, change: 34100, color: '#7EB5D6', isSystem: true },
];

const OPERATIONS_DATA = [
  { id: 1, type: 'income', title: 'Оплата абонемента', client: 'Мария Коваленко', amount: 12000, date: 'Сегодня, 14:32', category: 'Абонементы', method: 'Карта', status: 'completed', account: 'Расчётный счёт' },
  { id: 2, type: 'expense', title: 'Возврат средств', client: 'Иван Петров', amount: -2500, date: 'Сегодня, 11:15', category: 'Возврат', method: 'Наличные', status: 'completed', account: 'Основная касса' },
  { id: 3, type: 'income', title: 'Разовая запись', client: 'Елена Соколова', amount: 1200, date: 'Вчера, 18:45', category: 'Услуги', method: 'QR', status: 'completed', account: 'Онлайн-кошелёк' },
  { id: 4, type: 'expense', title: 'Аренда зала', client: 'Контрагент', amount: -8000, date: 'Вчера, 10:00', category: 'Аренда', method: 'Перевод', status: 'completed', account: 'Расчётный счёт' },
  { id: 5, type: 'income', title: 'Оплата сертификата', client: 'Алексей Морозов', amount: 5000, date: '29 июн, 16:20', category: 'Сертификаты', method: 'Карта', status: 'completed', account: 'Расчётный счёт' },
  { id: 6, type: 'income', title: 'Групповое занятие', client: 'Группа — 8 чел.', amount: 9600, date: '29 июн, 12:00', category: 'Услуги', method: 'Карта', status: 'completed', account: 'Расчётный счёт' },
  { id: 7, type: 'expense', title: 'Зарплата тренеров', client: 'Команда', amount: -120000, date: '28 июн, 09:00', category: 'Зарплата', method: 'Перевод', status: 'completed', account: 'Основная касса' },
  { id: 8, type: 'income', title: 'Продление абонемента', client: 'Светлана Иванова', amount: 8500, date: '28 июн, 17:30', category: 'Абонементы', method: 'Карта', status: 'pending', account: 'Расчётный счёт' },
];

const COUNTERPARTIES_DATA = [
  { id: 1, name: 'ООО «АрендаСтарт»', type: 'Юр. лицо', inn: '7701234567', category: 'Аренда', balance: -8000, deals: 24, color: '#FCAE91' },
  { id: 2, name: 'ИП Соколов Д.В.', type: 'ИП', inn: '500987654321', category: 'Поставщик', balance: -15400, deals: 8, color: '#7EB5D6' },
  { id: 3, name: 'ООО «КлинингПрофи»', type: 'Юр. лицо', inn: '7809876543', category: 'Клининг', balance: -6200, deals: 12, color: '#A3C9A8' },
  { id: 4, name: 'Власова А.С. (бух)', type: 'Физ. лицо', inn: '500123456789', category: 'Бухгалтерия', balance: -25000, deals: 6, color: '#D88C9A' },
];

const DOCUMENTS_DATA = [
  { id: 1, title: 'Акт выполненных работ №47', type: 'Акт', date: '30 июн 2025', party: 'ООО «АрендаСтарт»', amount: 8000, status: 'signed', ext: 'PDF' },
  { id: 2, title: 'Счёт-фактура №23', type: 'Счёт', date: '29 июн 2025', party: 'ИП Соколов Д.В.', amount: 15400, status: 'pending', ext: 'PDF' },
  { id: 3, title: 'Договор аренды (продление)', type: 'Договор', date: '01 июн 2025', party: 'ООО «АрендаСтарт»', amount: 96000, status: 'signed', ext: 'DOCX' },
  { id: 4, title: 'Кассовый отчёт — Июнь', type: 'Отчёт', date: '01 июл 2025', party: 'Внутренний', amount: 485200, status: 'draft', ext: 'XLSX' },
  { id: 5, title: 'УПД №112', type: 'УПД', date: '28 июн 2025', party: 'ООО «КлинингПрофи»', amount: 6200, status: 'signed', ext: 'PDF' },
];

const ONLINE_CHANNELS_DATA = [
  { id: 1, name: 'Ссылка на оплату', desc: 'Персональная страница записи и оплаты', icon: 'link', active: true, amount: 124300, sessions: 89 },
  { id: 2, name: 'QR-код', desc: 'Оплата по QR в студии или на сайте', icon: 'qr', active: true, amount: 38500, sessions: 32 },
  { id: 3, name: 'Telegram Pay', desc: 'Встроенная оплата в Telegram-боте', icon: 'telegram', active: false, amount: 0, sessions: 0 },
  { id: 4, name: 'Виджет на сайт', desc: 'JavaScript-виджет для вашего сайта', icon: 'widget', active: true, amount: 57200, sessions: 44 },
];

const PAYMENT_METHODS_DATA = [
  { id: 1, name: 'Банковская карта', desc: 'Visa, MasterCard, МИР', icon: 'card', enabled: true, commission: '1.8%', transactions: 312 },
  { id: 2, name: 'Наличные', desc: 'Приём наличных через кассу', icon: 'cash', enabled: true, commission: '0%', transactions: 87 },
  { id: 3, name: 'СБП (QR)', desc: 'Система быстрых платежей', icon: 'qr', enabled: true, commission: '0.4%', transactions: 56 },
  { id: 4, name: 'Apple Pay / Google Pay', desc: 'NFC и мобильные кошельки', icon: 'nfc', enabled: true, commission: '1.8%', transactions: 134 },
  { id: 5, name: 'Рассрочка (BNPL)', desc: 'Оплата по частям без переплаты', icon: 'bnpl', enabled: false, commission: '3.2%', transactions: 0 },
];

const GOALS_DATA = [
  { id: 1, title: 'Выручка — Июль 2025', target: 900000, current: 540200, deadline: '31 июл 2025', category: 'Выручка', color: '#FCAE91', priority: 'high' },
  { id: 2, title: 'Резервный фонд', target: 500000, current: 125000, deadline: '31 дек 2025', category: 'Резервы', color: '#A3C9A8', priority: 'medium' },
  { id: 3, title: 'Снизить расходы на 15%', target: 100, current: 62, deadline: '31 авг 2025', category: 'Оптимизация', color: '#7EB5D6', priority: 'medium' },
  { id: 4, title: 'Инвестиции в оборудование', target: 250000, current: 250000, deadline: '15 июн 2025', category: 'Инвестиции', color: '#D88C9A', priority: 'low' },
];

// ─── УТИЛИТЫ ──────────────────────────────────────────────────────────────────
const fmt = (n: number) => '₽' + n.toLocaleString('ru-RU');

// ─── TOAST ────────────────────────────────────────────────────────────────────
function Toast({ msg, type, visible }: { msg: string; type: ToastType; visible: boolean }) {
  return (
    <div style={{
      position: 'fixed', 
      bottom: '32px', 
      left: '50%',
      transform: `translateX(-50%) translateY(${visible ? 0 : 20}px)`,
      background: '#1A1A1A', // Строгий глубокий чёрный (Оникс)
      color: '#FFFFFF',
      padding: '12px 20px',
      borderRadius: '12px', // Мягкое скругление по дизайн-системе
      fontSize: '13px', 
      fontWeight: 600,
      fontFamily: "'Manrope', sans-serif",
      boxShadow: '0 16px 40px rgba(0,0,0,0.25), 0 4px 12px rgba(0,0,0,0.15)', // Дорогая многослойная тень
      zIndex: 9999,
      opacity: visible ? 1 : 0, 
      transition: 'all 0.35s cubic-bezier(0.2, 0.8, 0.2, 1)', // Плавный разгон и торможение
      pointerEvents: 'none', 
      whiteSpace: 'nowrap',
      display: 'flex',
      alignItems: 'center',
      gap: '10px'
    }}>
      {/* Элегантные микро-иконки для понимания контекста без заливки всего фона */}
      {type === 'success' && (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#A3C9A8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      )}
      {type === 'error' && (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#D88C9A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      )}
      {type === 'info' && (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#7EB5D6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="16" x2="12" y2="12" />
          <line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
      )}
      
      <span style={{ letterSpacing: '0.2px' }}>{msg}</span>
    </div>
  );
}

function useToast() {
  const [state, setState] = useState({ msg: '', type: 'success' as ToastType, visible: false });
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const show = (msg: string, type: ToastType = 'success') => {
    clearTimeout(timerRef.current);
    setState({ msg, type, visible: true });
    timerRef.current = setTimeout(() => setState(s => ({ ...s, visible: false })), 2500);
  };

  return { toast: state, show };
}

// ─── МОДАЛКА ПОДТВЕРЖДЕНИЯ ────────────────────────────────────────────────────
function ConfirmModal({ open, title, text, onConfirm, onCancel, danger = false }: {
  open: boolean; title: string; text: string;
  onConfirm: () => void; onCancel: () => void; danger?: boolean;
}) {
  if (!open) return null;

  // Используем React Portal, чтобы модалка вырвалась из контейнера таба и заблюрила ВЕСЬ сайт целиком
  return createPortal(
    <div style={{
      position: 'fixed', 
      inset: 0, 
      background: 'rgba(18, 18, 18, 0.45)', // Глубокий премиальный графитовый оверлей
      zIndex: 99999, // Максимальный приоритет над всем сайтом, сайдбаром и шапкой
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'center',
      backdropFilter: 'blur(16px)', // Сверхглубокий шёлковый блюр всего экрана
      WebkitBackdropFilter: 'blur(16px)',
      animation: 'fadeIn 0.2s cubic-bezier(0.2, 0.8, 0.2, 1) both',
      padding: '20px',
      boxSizing: 'border-box'
    }}>
      <div style={{
        background: '#1A1A1A', // Глубокий матовый оникс/графит (Основа брутализма)
        borderRadius: '16px', 
        padding: '32px', 
        width: '400px', 
        maxWidth: '100%',
        // Дорогая неоновая персиковая/розовая подсветка (Glow), которая заставляет карточку левитировать
        boxShadow: danger 
          ? '0 20px 50px -12px rgba(216, 140, 154, 0.25), 0 0 0 1px rgba(255,255,255,0.04)' 
          : '0 20px 50px -12px rgba(249, 160, 139, 0.22), 0 0 0 1px rgba(255,255,255,0.04)',
        border: '1px solid rgba(255, 255, 255, 0.03)', // Тончайшая неоновая нить по краю
        transform: 'scale(1) translateY(0)',
        animation: 'scaleUp 0.3s cubic-bezier(0.34, 1.3, 0.64, 1) both',
        fontFamily: "'Manrope', sans-serif",
      }}>
        
        {/* Анимации для плавного появления */}
        <style>{`
          @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
          @keyframes scaleUp { from { transform: scale(0.95) translateY(10px); } to { transform: scale(1) translateY(0); } }
        `}</style>

        {/* Иконка-предупреждение с точечным неоновым свечением */}
        <div style={{
          width: '44px',
          height: '44px',
          borderRadius: '12px',
          background: danger ? 'rgba(216, 140, 154, 0.12)' : 'rgba(249, 160, 139, 0.12)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: danger ? '#D88C9A' : '#F9A08B', // Пыльная роза или Благородный персик
          marginBottom: '24px',
          boxShadow: danger ? '0 0 20px rgba(216, 140, 154, 0.1)' : '0 0 20px rgba(249, 160, 139, 0.1)'
        }}>
          {danger ? (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/>
              <line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
          ) : (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="16" x2="12" y2="12"/>
              <line x1="12" y1="8" x2="12.01" y2="8"/>
            </svg>
          )}
        </div>

        {/* Контентный блок */}
        <div style={{ marginBottom: '32px' }}>
          <h3 style={{ 
            fontSize: '18px', 
            fontWeight: 800, 
            color: '#FFFFFF', // Чистый белый для контраста на черном матовом фоне
            margin: '0 0 10px 0', 
            letterSpacing: '-0.3px',
            lineHeight: 1.3
          }}>
            {title}
          </h3>
          <p style={{ 
            fontSize: '13.5px', 
            color: '#999999', // Мягкий рассеянный серый текст, чтобы глаза не уставали
            margin: 0, 
            fontWeight: 400, 
            lineHeight: 1.6 
          }}>
            {text}
          </p>
        </div>

        {/* Интерактивные кнопки (Геометрия 8px) */}
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
          <button 
            onClick={onCancel} 
            style={{
              padding: '12px 22px',
              background: 'transparent',
              color: '#CCCCCC',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: "'Manrope', sans-serif",
              transition: 'all 0.2s cubic-bezier(0.2, 0.8, 0.2, 1)'
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)'; e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)'; }}
          >
            Отмена
          </button>
          
          <button 
            onClick={onConfirm} 
            style={{
              padding: '12px 24px',
              background: danger ? '#D88C9A' : '#F9A08B', // Пыльная роза или Персиковый акцент точечно
              color: '#FFFFFF',
              border: 'none',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: 700,
              cursor: 'pointer',
              fontFamily: "'Manrope', sans-serif",
              // Сильное глубокое неоновое свечение под главной кнопкой действия
              boxShadow: danger ? '0 8px 24px rgba(216, 140, 154, 0.3)' : '0 8px 24px rgba(249, 160, 139, 0.25)',
              transition: 'all 0.2s cubic-bezier(0.2, 0.8, 0.2, 1)'
            }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.filter = 'brightness(1.06)'; }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.filter = 'none'; }}
          >
            {danger ? 'Удалить' : 'Подтвердить'}
          </button>
        </div>

      </div>
    </div>,
    document.body // Телепортируем верстку в самый корень приложения, перекрывая сайдбары и весь сайт!
  );
}

// ─── ИКОНКИ SVG ───────────────────────────────────────────────────────────────
const Ico = {
  Up: () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>,
  Down: () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg>,
  Plus: () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  Search: () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
  Filter: () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>,
  Download: () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>,
  Edit: () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
  Trash: () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6M9 6V4h6v2"/></svg>,
  Dots: () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="5" r="1" fill="currentColor"/><circle cx="12" cy="12" r="1" fill="currentColor"/><circle cx="12" cy="19" r="1" fill="currentColor"/></svg>,
  Target: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>,
  Check: () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>,
  Card: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>,
  Cash: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01M18 12h.01"/></svg>,
  Phone: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18" strokeWidth="2.5"/></svg>,
  Bar: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>,
  World: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>,
  Chevron: () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>,
  Building: () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>,
  User: () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
  Doc: () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>,
  QR: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><line x1="14" y1="14" x2="14" y2="14" strokeWidth="3"/><line x1="17" y1="14" x2="21" y2="14"/><line x1="17" y1="17" x2="17" y2="21"/><line x1="14" y1="17" x2="14" y2="21"/><line x1="21" y1="17" x2="21" y2="21"/></svg>,
  Dollar: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>,
  Flag: () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>,
  Copy: () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>,
  X: () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
};

// ─── КНОПКИ ───────────────────────────────────────────────────────────────────
function Btn({ children, onClick, v = 'ghost', size = 'md', style: s }: {
  children: React.ReactNode; onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  v?: 'ghost' | 'primary' | 'danger' | 'soft';
  size?: 'sm' | 'md'; style?: React.CSSProperties;
}) {
  const base: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: '6px',
    padding: size === 'sm' ? '5px 10px' : '8px 14px',
    borderRadius: '8px', fontSize: size === 'sm' ? '11px' : '12px',
    fontWeight: 600, cursor: 'pointer', transition: 'all 0.18s',
    fontFamily: 'var(--font)', border: '1px solid', ...s,
  };
  const variants = {
    ghost: { background: 'transparent', borderColor: 'var(--border)', color: 'var(--text2)' } as React.CSSProperties,
    primary: { background: 'var(--accent)', borderColor: 'var(--accent)', color: '#fff', boxShadow: '0 3px 10px rgba(252,174,145,0.35)' } as React.CSSProperties,
    danger: { background: 'transparent', borderColor: 'rgba(216,140,154,0.4)', color: '#D88C9A' } as React.CSSProperties,
    soft: { background: 'rgba(252,174,145,0.1)', borderColor: 'rgba(252,174,145,0.2)', color: 'var(--accent)' } as React.CSSProperties,
  };
  return (
    <button onClick={onClick} style={{ ...base, ...variants[v] }}
      onMouseEnter={e => { e.currentTarget.style.opacity = '0.8'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
      onMouseLeave={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.transform = 'translateY(0)'; }}
    >
      {children}
    </button>
  );
}

// ─── ТОГЛ ─────────────────────────────────────────────────────────────────────
function Toggle({ on, onChange }: { on: boolean; onChange: () => void }) {
  return (
    <div onClick={onChange} style={{
      width: '44px', height: '24px', borderRadius: '12px', flexShrink: 0,
      background: on ? 'var(--accent)' : 'rgba(26,26,26,0.12)',
      position: 'relative', cursor: 'pointer',
      transition: 'background 0.2s', boxShadow: on ? '0 2px 8px rgba(252,174,145,0.35)' : 'none',
    }}>
      <div style={{
        position: 'absolute', top: '3px',
        left: on ? '23px' : '3px',
        width: '18px', height: '18px', borderRadius: '50%',
        background: 'white', transition: 'left 0.2s cubic-bezier(0.34,1.56,0.64,1)',
        boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
      }} />
    </div>
  );
}

// ─── BADGE ────────────────────────────────────────────────────────────────────
function Badge({ text, color, bg }: { text: string; color: string; bg: string }) {
  return (
    <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 700, background: bg, color }}>
      {text}
    </span>
  );
}

// ─── SPINNING DONUT ILLUSTRATION ─────────────────────────────────────────────
function DonutIllustration({ total, segments }: { total: number; segments: { pct: number; color: string; label: string }[] }) {
  const r = 46, cx = 60, cy = 60;
  const circ = 2 * Math.PI * r;
  let offset = 0;

  return (
    <svg width="120" height="120" viewBox="0 0 120 120" style={{ filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.06))' }}>
      
      {/* 1. Серая статичная подложка (СТОИТ НА МЕСТЕ) */}
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(26,26,26,0.05)" strokeWidth="12" />
      
      {/* 2. Группа с цветными сегментами (КРУТЯТСЯ ТОЛЬКО ОНИ) */}
      <g>
        {/* Внутренняя анимация SVG, которая вращает только группу с секциями */}
        <animateTransform 
          attributeName="transform" 
          type="rotate" 
          from="0 60 60" 
          to="360 60 60" 
          dur="25s" 
          repeatCount="indefinite" 
        />
        
        {segments.map((seg, i) => {
          const dash = seg.pct * circ;
          const gap = circ - dash;
          const el = (
            <circle key={i} cx={cx} cy={cy} r={r}
              fill="none" stroke={seg.color} strokeWidth="12"
              strokeDasharray={`${dash} ${gap}`}
              strokeDashoffset={-offset * circ}
              strokeLinecap="round"
              transform={`rotate(-90 ${cx} ${cy})`}
              style={{ opacity: 0.9 }}
            />
          );
          offset += seg.pct;
          return el;
        })}
      </g>

      {/* 3. Внутренний круг и текст (СТОЯТ НА МЕСТЕ) */}
      <circle cx={cx} cy={cy} r={32} fill="var(--card)" />
      <text x={cx} y={cy - 6} textAnchor="middle" style={{ fontSize: '11px', fontWeight: 800, fill: 'var(--text)', fontFamily: 'var(--font)', letterSpacing: '-0.5px' }}>
        {total >= 1000000 ? `${(total / 1000000).toFixed(1)}M` : `${(total / 1000).toFixed(0)}K`}
      </text>
      <text x={cx} y={cy + 9} textAnchor="middle" style={{ fontSize: '8px', fill: 'var(--text3)', fontFamily: 'var(--font)', fontWeight: 600 }}>₽ всего</text>
    </svg>
  );
}

export interface AccountItem {
  id: number;
  name: string;
  type: string;
  balance: number;
  change: number;
  color: string;
  isSystem: boolean;
}

// ─── TAB: СЧЕТА И КАССЫ (PREMIUM SEAMLESS UX) ──────────────────────────────────
function TabAccounts({ showToast, onNavigateToOperations }: { 
  showToast: (msg: string, t?: ToastType) => void;
  onNavigateToOperations: (accountName: string) => void;
}) {
  // Явно указываем TS, что массив состоит из объектов AccountItem
  const [accounts, setAccounts] = useState<AccountItem[]>(ACCOUNTS_DATA);
  const [selected, setSelected] = useState<number | null>(null);
  const [confirm, setConfirm] = useState<{ open: boolean; id: number | null }>({ open: false, id: null });

  // Редактирование
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [editBalance, setEditBalance] = useState(''); // Стейт для суммы
  const [editType, setEditType] = useState('cash');
  const [isEditInputFocused, setIsEditInputFocused] = useState(false);
  const [isEditBalanceFocused, setIsEditBalanceFocused] = useState(false);

  // История
  const [historyId, setHistoryId] = useState<number | null>(null);

  // Создание нового (Пользовательские счета)
  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newBalance, setNewBalance] = useState(''); // Стейт для начальной суммы
  const [newType, setNewType] = useState('cash');
  const [isNewInputFocused, setIsNewInputFocused] = useState(false);
  const [isNewBalanceFocused, setIsNewBalanceFocused] = useState(false);

  const total = accounts.reduce((s, a) => s + a.balance, 0);
  const segments = accounts.map(a => ({ pct: a.balance / total, color: a.color, label: a.name }));

  const handleDelete = (id: number) => setConfirm({ open: true, id });
  
  const confirmDelete = () => {
    setAccounts(prev => prev.filter(a => a.id !== confirm.id));
    setConfirm({ open: false, id: null });
    showToast('Счёт удалён', 'error');
    setSelected(null);
  };

  const handleUpdate = (id: number) => {
    if (!editName.trim()) return;
    const numBalance = parseInt(editBalance) || 0; // Превращаем строку в число
    
    setAccounts(prev => prev.map(a => a.id === id ? { 
      ...a, 
      name: editName.trim(), 
      type: editType,
      balance: numBalance // Обновляем баланс
    } : a));
    
    setEditingId(null);
    showToast('Настройки сохранены', 'success');
  };

  const handleSaveNew = () => {
    if (!newName.trim()) return;
    const numBalance = parseInt(newBalance) || 0; // Превращаем строку в число
    const colors = ['#FCAE91', '#A3C9A8', '#7EB5D6', '#D88C9A'];
    
    setAccounts(prev => [...prev, { 
      id: Date.now(), 
      name: newName.trim(), 
      type: newType, 
      balance: numBalance, // Ставим начальную сумму
      change: 0, 
      color: colors[prev.length % colors.length],
      isSystem: false // Явно указываем для TS
    }]);
    
    setNewName(''); setNewBalance(''); setNewType('cash'); setAddOpen(false);
    showToast('Копилка успешно создана', 'success');
  };

  // Хелпер для ввода только цифр
  const handleNumberInput = (val: string, setter: (v: string) => void) => {
    setter(val.replace(/\D/g, '')); // Удаляем всё, кроме цифр
  };

  return (
    <>
      <style>{`
        @keyframes cardMorph {
          from { opacity: 0; transform: scale(0.97) translateY(6px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
        .morph-container {
          animation: cardMorph 0.3s cubic-bezier(0.2, 0.8, 0.2, 1) both;
        }
      `}</style>

      {/* Hero-иллюстрация */}
      <div className="finance-illus" style={{ marginBottom: '28px', display: 'flex', alignItems: 'center', padding: '0 32px', gap: '32px' }}>
        <DonutIllustration total={total} segments={segments} />
        <div style={{ flex: 1, textAlign: 'center' }}>
          <div style={{ fontSize: '11px', color: '#666666', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '8px' }}>Общий капитал студии</div>
          <div style={{ fontSize: '40px', fontWeight: 800, letterSpacing: '-2px', color: '#1A1A1A', lineHeight: 1 }}>{fmt(total)}</div>
          <div style={{ marginTop: '12px' }}>
            <span style={{ fontSize: '12px', color: '#5BAB72', fontWeight: 700, background: 'rgba(163,201,168,0.12)', padding: '5px 14px', borderRadius: '20px' }}>
              ↑ +{fmt(accounts.reduce((s, a) => s + a.change, 0))} за сегодня
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', minWidth: '170px' }}>
          {accounts.map(a => (
            <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: a.color, flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '11px', fontWeight: 600, color: '#1A1A1A' }}>{a.name}</div>
                <div style={{ fontSize: '10px', color: '#666666' }}>{total > 0 ? Math.round(a.balance / total * 100) : 0}%</div>
              </div>
              <div style={{ fontSize: '12px', fontWeight: 700, color: a.color }}>{fmt(a.balance)}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Сетка карточек счетов */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '20px', marginBottom: '20px' }}>
        {accounts.map(acc => {
          const TypeIcon = acc.type === 'cash' ? Ico.Cash : acc.type === 'bank' ? Ico.Card : Ico.World;
          const isSelected = selected === acc.id;
          const isEditing = editingId === acc.id;
          const isHistory = historyId === acc.id;

          return (
            <div
              key={acc.id} className="card card-sm"
              onClick={() => { if (!isEditing && !isHistory) setSelected(isSelected ? null : acc.id); }}
              style={{
                cursor: (isEditing || isHistory) ? 'default' : 'pointer', position: 'relative', overflow: 'hidden', padding: '24px', 
                border: isSelected ? `1.5px solid ${acc.color}` : '1.5px solid rgba(26, 26, 26, 0.06)', background: '#FFFFFF',
                transition: 'all 0.25s cubic-bezier(0.2, 0.8, 0.2, 1)', transform: isSelected ? 'translateY(-2px)' : 'none',
                boxShadow: isSelected ? `0 16px 32px ${acc.color}15` : '0 4px 12px rgba(26,26,26,0.02)',
              }}
            >
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', background: acc.color }} />

              {/* РЕЖИМ 1: РЕДАКТИРОВАНИЕ */}
              {isEditing ? (
                <div className="morph-container" onClick={e => e.stopPropagation()}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
                    <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(249, 160, 139, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#F9A08B' }}><Ico.Edit /></div>
                    <div style={{ fontSize: '12px', fontWeight: 800, color: '#1A1A1A' }}>Изменить счёт</div>
                  </div>
                  
                  {/* Строка с Названием и Суммой */}
                  <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                    <input 
                      type="text" value={editName} placeholder="Название" 
                      onChange={e => setEditName(e.target.value)} 
                      onFocus={() => setIsEditInputFocused(true)} onBlur={() => setIsEditInputFocused(false)} 
                      style={{ flex: 1, padding: '10px 12px', background: '#FDFCFB', border: isEditInputFocused ? '1.5px solid #F9A08B' : '1.5px solid rgba(26,26,26,0.08)', borderRadius: '8px', fontSize: '13px', fontWeight: 600, color: '#1A1A1A', outline: 'none', boxShadow: isEditInputFocused ? '0 0 0 3px rgba(249, 160, 139, 0.12)' : 'none', transition: 'all 0.2s', minWidth: 0 }}
                    />
                    <input 
                      type="text" value={editBalance} placeholder="Баланс, ₽" 
                      onChange={e => handleNumberInput(e.target.value, setEditBalance)} 
                      onFocus={() => setIsEditBalanceFocused(true)} onBlur={() => setIsEditBalanceFocused(false)} 
                      style={{ width: '90px', padding: '10px 12px', background: '#FDFCFB', border: isEditBalanceFocused ? '1.5px solid #F9A08B' : '1.5px solid rgba(26,26,26,0.08)', borderRadius: '8px', fontSize: '13px', fontWeight: 700, color: '#1A1A1A', outline: 'none', boxShadow: isEditBalanceFocused ? '0 0 0 3px rgba(249, 160, 139, 0.12)' : 'none', transition: 'all 0.2s', textAlign: 'right' }}
                    />
                  </div>
                  
                  {/* Выбор типа (только для кастомных счетов) */}
                  {!acc.isSystem && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px', marginBottom: '16px' }}>
                      {[ { id: 'cash', icon: <Ico.Cash />, label: 'Наличные' }, { id: 'bank', icon: <Ico.Card />, label: 'Карта' }, { id: 'online', icon: <Ico.World />, label: 'Сеть' } ].map(btn => (
                        <button key={btn.id} type="button" onClick={() => setEditType(btn.id)} style={{ padding: '8px 4px', background: editType === btn.id ? 'rgba(249, 160, 139, 0.05)' : '#FDFCFB', border: editType === btn.id ? '1.5px solid #F9A08B' : '1.5px solid rgba(26,26,26,0.06)', borderRadius: '8px', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', color: editType === btn.id ? '#F9A08B' : '#666666', transition: 'all 0.15s' }}>
                          {btn.icon}<span style={{ fontSize: '9px', fontWeight: 700 }}>{btn.label}</span>
                        </button>
                      ))}
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button onClick={() => handleUpdate(acc.id)} disabled={!editName.trim()} style={{ flex: 1, padding: '10px', background: editName.trim() ? '#F9A08B' : 'rgba(26,26,26,0.04)', border: 'none', borderRadius: '8px', color: '#FFF', fontSize: '12px', fontWeight: 700, cursor: editName.trim() ? 'pointer' : 'not-allowed', transition: 'all 0.2s' }}>Сохранить</button>
                    <button onClick={() => setEditingId(null)} style={{ padding: '10px 14px', background: 'transparent', border: '1px solid rgba(26,26,26,0.08)', borderRadius: '8px', color: '#666666', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>Отмена</button>
                  </div>
                </div>

              // РЕЖИМ 2: ИСТОРИЯ
              ) : isHistory ? (
                <div className="morph-container" onClick={e => e.stopPropagation()}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
                    <button onClick={() => setHistoryId(null)} style={{ width: '28px', height: '28px', borderRadius: '8px', border: '1.5px solid rgba(26,26,26,0.08)', background: '#FDFCFB', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#1A1A1A', cursor: 'pointer', transition: 'all 0.2s' }} onMouseEnter={e => e.currentTarget.style.background = 'rgba(26,26,26,0.04)'} onMouseLeave={e => e.currentTarget.style.background = '#FDFCFB'}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
                    </button>
                    <div style={{ fontSize: '13px', fontWeight: 800, color: '#1A1A1A' }}>История: {acc.name}</div>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                    <div style={{ flex: 1, padding: '10px', background: 'rgba(163,201,168,0.1)', borderRadius: '8px', border: '1px solid rgba(163,201,168,0.2)' }}><div style={{ fontSize: '9px', fontWeight: 800, color: '#7AA080', textTransform: 'uppercase', marginBottom: '4px' }}>Приход (30 дн)</div><div style={{ fontSize: '14px', fontWeight: 800, color: '#4E885B', letterSpacing: '-0.3px' }}>+124.5K</div></div>
                    <div style={{ flex: 1, padding: '10px', background: 'rgba(216,140,154,0.1)', borderRadius: '8px', border: '1px solid rgba(216,140,154,0.2)' }}><div style={{ fontSize: '9px', fontWeight: 800, color: '#BA6D7D', textTransform: 'uppercase', marginBottom: '4px' }}>Расход (30 дн)</div><div style={{ fontSize: '14px', fontWeight: 800, color: '#A5495B', letterSpacing: '-0.3px' }}>-32.1K</div></div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}><div style={{ width: '26px', height: '26px', borderRadius: '6px', background: 'rgba(163,201,168,0.15)', color: '#5BAB72', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Ico.Up /></div><div style={{ flex: 1 }}><div style={{ fontSize: '12px', fontWeight: 700, color: '#1A1A1A', marginBottom: '2px' }}>Оплата услуги</div><div style={{ fontSize: '10px', color: '#999999', fontWeight: 500 }}>Сегодня, 14:32</div></div><div style={{ fontSize: '12px', fontWeight: 800, color: '#5BAB72' }}>+2 500</div></div>
                  </div>
                  <button onClick={() => { setHistoryId(null); onNavigateToOperations(acc.name); }} style={{ width: '100%', padding: '10px', background: 'transparent', border: '1.5px solid rgba(26,26,26,0.08)', borderRadius: '8px', color: '#1A1A1A', fontSize: '12px', fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s' }} onMouseEnter={e => { e.currentTarget.style.borderColor = '#1A1A1A'; }} onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(26,26,26,0.08)'; }}>Открыть все операции</button>
                </div>

              // РЕЖИМ 3: СТАНДАРТНОЕ СОСТОЯНИЕ
              ) : (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px', paddingTop: '4px' }}>
                    <div style={{ fontSize: '11px', color: '#666666', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      {acc.name} 
                      {acc.isSystem && <span style={{ background: 'rgba(26,26,26,0.05)', color: '#666', padding: '2px 6px', borderRadius: '4px', fontSize: '8.5px', fontWeight: 800 }}>СИСТЕМА</span>}
                    </div>
                    <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: acc.color + '18', display: 'flex', alignItems: 'center', justifyContent: 'center', color: acc.color }}><TypeIcon /></div>
                  </div>
                  <div style={{ fontSize: '28px', fontWeight: 800, marginBottom: '6px', letterSpacing: '-0.5px', color: '#1A1A1A' }}>{fmt(acc.balance)}</div>
                  <div style={{ fontSize: '11px', color: '#5BAB72', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}><Ico.Up /> +{fmt(acc.change)} сегодня</div>

                  {isSelected && (
                    <div style={{ marginTop: '18px', paddingTop: '14px', borderTop: '1px solid rgba(26,26,26,0.05)', display: 'flex', gap: '6px', flexWrap: 'wrap' }} onClick={e => e.stopPropagation()}>
                      <Btn size="sm" onClick={() => { 
                        setHistoryId(null); 
                        setEditingId(acc.id); 
                        setEditName(acc.name); 
                        setEditBalance(acc.balance.toString()); // Подтягиваем текущий баланс
                        setEditType(acc.type); 
                      }}><Ico.Edit />Изменить</Btn>
                      <Btn size="sm" onClick={() => { setEditingId(null); setHistoryId(acc.id); }}><Ico.Bar />История</Btn>
                      
                      {!acc.isSystem && (
                        <Btn size="sm" v="danger" onClick={() => handleDelete(acc.id)}><Ico.Trash /></Btn>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })}

        {/* ─── ПЛИТКА СОЗДАНИЯ (Копилки) ─── */}
        <div style={{ border: addOpen ? '1.5px solid #F9A08B' : '1.5px dashed rgba(26,26,26,0.08)', borderRadius: '16px', padding: '24px', background: addOpen ? '#FFFFFF' : 'transparent', boxShadow: addOpen ? '0 12px 28px rgba(249, 160, 139, 0.04)' : 'none', minHeight: '130px', display: 'flex', flexDirection: 'column', justifyContent: 'center', fontFamily: "'Manrope', sans-serif", transition: 'all 0.25s cubic-bezier(0.2, 0.8, 0.2, 1)', boxSizing: 'border-box' }}>
          {addOpen ? (
            <div className="morph-container">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(249, 160, 139, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#F9A08B' }}><Ico.Plus /></div>
                <div style={{ fontSize: '12px', fontWeight: 800, color: '#1A1A1A' }}>Новая копилка</div>
              </div>
              
              {/* Строка с Названием и Балансом */}
              <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                <input 
                  type="text" value={newName} placeholder="Название" 
                  onChange={e => setNewName(e.target.value)} 
                  onFocus={() => setIsNewInputFocused(true)} onBlur={() => setIsNewInputFocused(false)} 
                  style={{ flex: 1, padding: '10px 12px', background: '#FDFCFB', border: isNewInputFocused ? '1.5px solid #F9A08B' : '1.5px solid rgba(26,26,26,0.08)', borderRadius: '8px', fontSize: '13px', fontWeight: 600, color: '#1A1A1A', outline: 'none', boxShadow: isNewInputFocused ? '0 0 0 3px rgba(249, 160, 139, 0.12)' : 'none', transition: 'all 0.2s', minWidth: 0 }}
                />
                <input 
                  type="text" value={newBalance} placeholder="Баланс, ₽" 
                  onChange={e => handleNumberInput(e.target.value, setNewBalance)} 
                  onFocus={() => setIsNewBalanceFocused(true)} onBlur={() => setIsNewBalanceFocused(false)} 
                  style={{ width: '90px', padding: '10px 12px', background: '#FDFCFB', border: isNewBalanceFocused ? '1.5px solid #F9A08B' : '1.5px solid rgba(26,26,26,0.08)', borderRadius: '8px', fontSize: '13px', fontWeight: 700, color: '#1A1A1A', outline: 'none', boxShadow: isNewBalanceFocused ? '0 0 0 3px rgba(249, 160, 139, 0.12)' : 'none', transition: 'all 0.2s', textAlign: 'right' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px', marginBottom: '18px' }}>
                {[ { id: 'cash', icon: <Ico.Cash />, label: 'Наличка' }, { id: 'bank', icon: <Ico.Card />, label: 'Карта' }, { id: 'online', icon: <Ico.World />, label: 'Сеть' } ].map(btn => (
                  <button key={btn.id} type="button" onClick={() => setNewType(btn.id)} style={{ padding: '8px 4px', background: newType === btn.id ? 'rgba(249, 160, 139, 0.05)' : '#FDFCFB', border: newType === btn.id ? '1.5px solid #F9A08B' : '1.5px solid rgba(26,26,26,0.06)', borderRadius: '8px', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', color: newType === btn.id ? '#F9A08B' : '#666666', transition: 'all 0.15s' }}>
                    {btn.icon}<span style={{ fontSize: '9px', fontWeight: 700 }}>{btn.label}</span>
                  </button>
                ))}
              </div>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button onClick={handleSaveNew} disabled={!newName.trim()} style={{ flex: 1, padding: '10px', background: newName.trim() ? '#F9A08B' : 'rgba(26,26,26,0.04)', border: 'none', borderRadius: '8px', color: '#FFF', fontSize: '12px', fontWeight: 700, cursor: newName.trim() ? 'pointer' : 'not-allowed', transition: 'all 0.2s' }}>Создать</button>
                <button onClick={() => { setAddOpen(false); setNewName(''); setNewBalance(''); }} style={{ padding: '10px 14px', background: 'transparent', border: '1px solid rgba(26,26,26,0.08)', borderRadius: '8px', color: '#666666', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>Отмена</button>
              </div>
            </div>
          ) : (
            <button onClick={() => setAddOpen(true)} style={{ width: '100%', height: '100%', background: 'transparent', border: 'none', cursor: 'pointer', color: '#666666', fontSize: '13px', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontFamily: "'Manrope', sans-serif", transition: 'all 0.2s' }} onMouseEnter={e => { e.currentTarget.parentElement!.style.borderColor = '#F9A08B'; e.currentTarget.parentElement!.style.background = 'rgba(249,160,139,0.02)'; e.currentTarget.style.color = '#F9A08B'; }} onMouseLeave={e => { if(!addOpen) { e.currentTarget.parentElement!.style.borderColor = 'rgba(26,26,26,0.08)'; e.currentTarget.parentElement!.style.background = 'transparent'; e.currentTarget.style.color = '#666666'; } }}>
              <Ico.Plus /> Создать копилку
            </button>
          )}
        </div>
      </div>

      {/* Окно подтверждения удаления */}
      <ConfirmModal open={confirm.open} title="Удалить эту копилку?" text="Все средства с неё будут списаны из общей статистики. Это действие нельзя отменить." onConfirm={confirmDelete} onCancel={() => setConfirm({ open: false, id: null })} danger />
    </>
  );
}

// ─── TAB: ОПЕРАЦИИ ───────────────────────────────────────────────────────────
// ─── TAB: ОПЕРАЦИИ (PREMIUM MINIMALISM) ───────────────────────────────────────
function TabOperations({ showToast, initialSearch }: { 
  showToast: (msg: string, t?: ToastType) => void;
  initialSearch: string;
}) {
  const [search, setSearch] = useState(initialSearch || '');
  const [filter, setFilter] = useState<'all' | 'income' | 'expense'>('all');
  const [expanded, setExpanded] = useState<number | null>(null);
  
  // Состояние для красивого фокуса поиска
  const [isSearchFocused, setIsSearchFocused] = useState(false);

  const filtered = OPERATIONS_DATA.filter(op => {
    const matchFilter = filter === 'all' || op.type === filter;
    const matchSearch = !search || 
      op.title.toLowerCase().includes(search.toLowerCase()) || 
      op.client.toLowerCase().includes(search.toLowerCase()) || 
      op.category.toLowerCase().includes(search.toLowerCase()) ||
      (op.account && op.account.toLowerCase().includes(search.toLowerCase()));
    return matchFilter && matchSearch;
  });

  const totalIncome = OPERATIONS_DATA.filter(o => o.type === 'income').reduce((s, o) => s + Math.abs(o.amount), 0);
  const totalExpense = OPERATIONS_DATA.filter(o => o.type === 'expense').reduce((s, o) => s + Math.abs(o.amount), 0);
  const balance = totalIncome - totalExpense;

  return (
    <>
      {/* 1. РОСКОШНЫЕ КАРТОЧКИ СВОДКИ */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px', marginBottom: '28px' }}>
        
        {/* Карточка: Приход */}
        <div style={{ background: '#FFFFFF', borderRadius: '16px', padding: '24px', border: '1px solid rgba(26,26,26,0.04)', boxShadow: '0 12px 32px -4px rgba(26,26,26,0.02)', position: 'relative', overflow: 'hidden', transition: 'transform 0.2s', cursor: 'default' }} onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'} onMouseLeave={e => e.currentTarget.style.transform = 'none'}>
          {/* Мягкий фоновый засвет */}
          <div style={{ position: 'absolute', top: '-20px', right: '-20px', width: '100px', height: '100px', background: 'radial-gradient(circle, rgba(163,201,168,0.15) 0%, transparent 70%)', borderRadius: '50%' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: 'rgba(163,201,168,0.12)', color: '#5BAB72', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Ico.Up />
            </div>
            <div style={{ fontSize: '12px', color: '#666666', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px' }}>Приход сегодня</div>
          </div>
          <div style={{ fontSize: '32px', fontWeight: 800, color: '#1A1A1A', letterSpacing: '-1px' }}>
            <span style={{ color: '#5BAB72', marginRight: '4px' }}>+</span>{fmt(totalIncome)}
          </div>
        </div>

        {/* Карточка: Расход */}
        <div style={{ background: '#FFFFFF', borderRadius: '16px', padding: '24px', border: '1px solid rgba(26,26,26,0.04)', boxShadow: '0 12px 32px -4px rgba(26,26,26,0.02)', position: 'relative', overflow: 'hidden', transition: 'transform 0.2s', cursor: 'default' }} onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'} onMouseLeave={e => e.currentTarget.style.transform = 'none'}>
          <div style={{ position: 'absolute', top: '-20px', right: '-20px', width: '100px', height: '100px', background: 'radial-gradient(circle, rgba(216,140,154,0.12) 0%, transparent 70%)', borderRadius: '50%' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: 'rgba(216,140,154,0.12)', color: '#D88C9A', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Ico.Down />
            </div>
            <div style={{ fontSize: '12px', color: '#666666', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px' }}>Расход сегодня</div>
          </div>
          <div style={{ fontSize: '32px', fontWeight: 800, color: '#1A1A1A', letterSpacing: '-1px' }}>
            <span style={{ color: '#D88C9A', marginRight: '4px' }}>−</span>{fmt(totalExpense)}
          </div>
        </div>

        {/* Карточка: Баланс */}
        <div style={{ background: '#FFFFFF', borderRadius: '16px', padding: '24px', border: '1px solid rgba(26,26,26,0.04)', boxShadow: '0 12px 32px -4px rgba(26,26,26,0.02)', position: 'relative', overflow: 'hidden', transition: 'transform 0.2s', cursor: 'default' }} onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'} onMouseLeave={e => e.currentTarget.style.transform = 'none'}>
          <div style={{ position: 'absolute', top: '-20px', right: '-20px', width: '100px', height: '100px', background: 'radial-gradient(circle, rgba(249,160,139,0.15) 0%, transparent 70%)', borderRadius: '50%' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: 'rgba(249,160,139,0.12)', color: '#F9A08B', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Ico.Dollar />
            </div>
            <div style={{ fontSize: '12px', color: '#666666', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px' }}>Баланс дня</div>
          </div>
          <div style={{ fontSize: '32px', fontWeight: 800, color: '#1A1A1A', letterSpacing: '-1px' }}>
            <span style={{ color: balance >= 0 ? '#F9A08B' : '#D88C9A', marginRight: '4px' }}>{balance >= 0 ? '+' : '−'}</span>{fmt(Math.abs(balance))}
          </div>
        </div>

      </div>

      {/* 2. ЕДИНАЯ ПАНЕЛЬ УПРАВЛЕНИЯ (ACTION ISLAND) */}
      <div style={{ 
        display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px', 
        background: '#FFFFFF', padding: '12px 16px', borderRadius: '16px', 
        border: '1px solid rgba(26,26,26,0.04)', boxShadow: '0 8px 32px -8px rgba(26,26,26,0.04)',
        flexWrap: 'wrap'
      }}>
        
        {/* Поиск */}
        <div style={{ position: 'relative', flex: 1, minWidth: '250px' }}>
          <div style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: isSearchFocused ? '#F9A08B' : '#999999', transition: 'color 0.2s', pointerEvents: 'none' }}>
            <Ico.Search />
          </div>
          <input
            type="text"
            placeholder="Поиск по клиентам, счетам и категориям..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            onFocus={() => setIsSearchFocused(true)}
            onBlur={() => setIsSearchFocused(false)}
            style={{ 
              width: '100%', height: '48px', paddingLeft: '44px', paddingRight: search ? '40px' : '16px',
              background: '#FDFCFB', border: isSearchFocused ? '1.5px solid #F9A08B' : '1.5px solid rgba(26,26,26,0.06)',
              borderRadius: '12px', fontSize: '14px', fontWeight: 500, color: '#1A1A1A', outline: 'none',
              boxShadow: isSearchFocused ? '0 0 0 3px rgba(249, 160, 139, 0.12)' : 'none',
              transition: 'all 0.25s cubic-bezier(0.2, 0.8, 0.2, 1)', boxSizing: 'border-box', fontFamily: "'Manrope', sans-serif"
            }}
          />
          {search && (
            <button onClick={() => setSearch('')} style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', width: '24px', height: '24px', borderRadius: '50%', background: 'rgba(26,26,26,0.06)', border: 'none', cursor: 'pointer', color: '#666', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }} onMouseEnter={e => e.currentTarget.style.background='rgba(26,26,26,0.1)'} onMouseLeave={e => e.currentTarget.style.background='rgba(26,26,26,0.06)'}>
              <Ico.X />
            </button>
          )}
        </div>

        {/* Разделитель */}
        <div style={{ width: '1px', height: '32px', background: 'rgba(26,26,26,0.08)', display: 'none' }} className="desktop-divider" />

        {/* Сегментированные фильтры (iOS style) */}
        <div style={{ display: 'flex', gap: '4px', background: 'rgba(26,26,26,0.03)', padding: '4px', borderRadius: '12px', flexShrink: 0 }}>
          {(['all', 'income', 'expense'] as const).map(f => {
            const isActive = filter === f;
            return (
              <button
                key={f} onClick={() => setFilter(f)}
                style={{
                  padding: '8px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 700,
                  border: 'none', cursor: 'pointer', fontFamily: "'Manrope', sans-serif",
                  background: isActive ? '#FFFFFF' : 'transparent',
                  color: isActive ? '#1A1A1A' : '#666666',
                  boxShadow: isActive ? '0 2px 8px rgba(26,26,26,0.06)' : 'none',
                  transition: 'all 0.2s cubic-bezier(0.2, 0.8, 0.2, 1)',
                }}
              >
                {f === 'all' ? 'Все' : f === 'income' ? 'Приход' : 'Расход'}
              </button>
            );
          })}
        </div>

        {/* Кнопка экспорта */}
        <button 
          onClick={() => showToast('Экспорт запущен', 'info')}
          style={{
            display: 'flex', alignItems: 'center', gap: '8px', height: '40px', padding: '0 16px',
            background: 'transparent', border: '1.5px solid rgba(26,26,26,0.08)', borderRadius: '10px',
            color: '#666666', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: "'Manrope', sans-serif",
            transition: 'all 0.2s cubic-bezier(0.2, 0.8, 0.2, 1)', flexShrink: 0
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(26,26,26,0.03)'; e.currentTarget.style.color = '#1A1A1A'; e.currentTarget.style.borderColor = 'rgba(26,26,26,0.15)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#666666'; e.currentTarget.style.borderColor = 'rgba(26,26,26,0.08)'; }}
        >
          <Ico.Download /> Экспорт
        </button>
      </div>

      {/* 3. СПИСОК ОПЕРАЦИЙ */}
      {filtered.length === 0 ? (
        <div style={{ background: '#FFFFFF', borderRadius: '16px', padding: '64px 20px', textAlign: 'center', border: '1px dashed rgba(26,26,26,0.1)' }}>
          <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'rgba(26,26,26,0.03)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', color: '#999999' }}>
            <Ico.Search />
          </div>
          <div style={{ fontSize: '16px', fontWeight: 800, color: '#1A1A1A', marginBottom: '6px' }}>Операции не найдены</div>
          <div style={{ fontSize: '13px', color: '#666666' }}>Попробуйте изменить параметры поиска или фильтры</div>
        </div>
      ) : (
        <div style={{ background: '#FFFFFF', borderRadius: '16px', border: '1px solid rgba(26,26,26,0.12)', boxShadow: '0 12px 32px -4px rgba(26,26,26,0.02)', overflow: 'hidden' }}>
          {filtered.map((op, i) => {
            const isIncome = op.type === 'income';
            const color = isIncome ? '#5BAB72' : '#D88C9A';
            const bgLight = isIncome ? 'rgba(163,201,168,0.12)' : 'rgba(216,140,154,0.12)';
            const isOpen = expanded === op.id;
            
            return (
              <div key={op.id} style={{ borderBottom: i < filtered.length - 1 ? '1px solid rgba(26,26,26,0.12)' : 'none' }}>
                <div
                  onClick={() => setExpanded(isOpen ? null : op.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '16px', padding: '16px 24px', cursor: 'pointer',
                    background: isOpen ? 'rgba(249,160,139,0.02)' : 'transparent', transition: 'background 0.2s',
                  }}
                  onMouseEnter={e => { if (!isOpen) e.currentTarget.style.background = 'rgba(26,26,26,0.01)'; }}
                  onMouseLeave={e => { if (!isOpen) e.currentTarget.style.background = 'transparent'; }}
                >
                  <div style={{ width: '42px', height: '42px', borderRadius: '12px', background: bgLight, color: color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {isIncome ? <Ico.Up /> : <Ico.Down />}
                  </div>
                  
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '14px', fontWeight: 700, color: '#1A1A1A', marginBottom: '3px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {op.title}
                      {op.status === 'pending' && (
                        <span style={{ fontSize: '10px', background: '#FFF3CD', color: '#856404', padding: '2px 8px', borderRadius: '20px', fontWeight: 700 }}>Ожидание</span>
                      )}
                    </div>
                    <div style={{ fontSize: '12px', color: '#666666' }}>{op.client} <span style={{ opacity: 0.5, margin: '0 4px' }}>•</span> {op.account || op.category}</div>
                  </div>
                  
                  <div style={{ textAlign: 'right', flexShrink: 0, paddingRight: '12px' }}>
                    <div style={{ fontSize: '15px', fontWeight: 800, color: color, letterSpacing: '-0.3px' }}>{isIncome ? '+' : '−'}{fmt(Math.abs(op.amount))}</div>
                    <div style={{ fontSize: '11px', color: '#999999', marginTop: '3px', fontWeight: 500 }}>{op.date}</div>
                  </div>
                  
                  <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: isOpen ? 'rgba(26,26,26,0.06)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999', transition: 'all 0.2s', transform: isOpen ? 'rotate(90deg)' : 'none', flexShrink: 0 }}>
                    <Ico.Chevron />
                  </div>
                </div>

                {/* Раскрывающаяся панель деталей */}
                {isOpen && (
                  <div style={{ background: 'rgba(252,174,145,0.03)', padding: '20px 24px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '24px', borderTop: '1px solid rgba(252,174,145,0.1)' }}>
                    {[['Счёт поступления', op.account || '—'], ['Категория', op.category], ['Метод оплаты', op.method]].map(([l, v]) => (
                      <div key={l as string}>
                        <div style={{ fontSize: '11px', color: '#666666', fontWeight: 700, marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.4px' }}>{l}</div>
                        <div style={{ fontSize: '14px', fontWeight: 700, color: '#1A1A1A' }}>{v}</div>
                      </div>
                    ))}
                    
                    <div style={{ gridColumn: '1 / -1', display: 'flex', gap: '10px', paddingTop: '16px', borderTop: '1px solid rgba(26,26,26,0.05)', marginTop: '-4px' }}>
                      <button onClick={() => showToast('Редактирование открыто')} style={{ padding: '8px 16px', background: '#FFFFFF', border: '1px solid rgba(26,26,26,0.08)', borderRadius: '8px', fontSize: '12px', fontWeight: 700, color: '#1A1A1A', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', transition: 'all 0.2s', boxShadow: '0 2px 6px rgba(0,0,0,0.02)' }} onMouseEnter={e => { e.currentTarget.style.borderColor = '#F9A08B'; e.currentTarget.style.color = '#F9A08B'; }} onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(26,26,26,0.08)'; e.currentTarget.style.color = '#1A1A1A'; }}><Ico.Edit /> Изменить</button>
                      <button onClick={() => showToast('Квитанция скачана', 'success')} style={{ padding: '8px 16px', background: '#FFFFFF', border: '1px solid rgba(26,26,26,0.08)', borderRadius: '8px', fontSize: '12px', fontWeight: 700, color: '#1A1A1A', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', transition: 'all 0.2s', boxShadow: '0 2px 6px rgba(0,0,0,0.02)' }} onMouseEnter={e => { e.currentTarget.style.borderColor = '#F9A08B'; e.currentTarget.style.color = '#F9A08B'; }} onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(26,26,26,0.08)'; e.currentTarget.style.color = '#1A1A1A'; }}><Ico.Doc /> Квитанция</button>
                      <button onClick={() => showToast('Операция удалена', 'error')} style={{ padding: '8px 16px', background: 'transparent', border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: 700, color: '#D88C9A', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', transition: 'all 0.2s', marginLeft: 'auto' }} onMouseEnter={e => { e.currentTarget.style.background = '#FFF5F5'; }} onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}><Ico.Trash /> Удалить</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

// ─── TAB: КОНТРАГЕНТЫ ────────────────────────────────────────────────────────
function TabCounterparties({ showToast }: { showToast: (msg: string, t?: ToastType) => void }) {
  const [counterparties, setCounterparties] = useState(COUNTERPARTIES_DATA);
  const [selected, setSelected] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: '', inn: '', type: 'Юр. лицо', category: '' });
  const [confirm, setConfirm] = useState<{ open: boolean; id: number | null }>({ open: false, id: null });

  const handleAdd = () => {
    if (!form.name.trim()) { showToast('Введите название', 'error'); return; }
    const colors = ['#FCAE91', '#7EB5D6', '#A3C9A8', '#D88C9A'];
    setCounterparties(prev => [...prev, {
      id: Date.now(), name: form.name, inn: form.inn || '—', type: form.type,
      category: form.category || 'Прочее', balance: 0, deals: 0,
      color: colors[prev.length % colors.length],
    }]);
    setForm({ name: '', inn: '', type: 'Юр. лицо', category: '' });
    setAdding(false);
    showToast('Контрагент добавлен', 'success');
  };

  const confirmDelete = () => {
    setCounterparties(prev => prev.filter(c => c.id !== confirm.id));
    setConfirm({ open: false, id: null });
    setSelected(null);
    showToast('Контрагент удалён', 'success');
  };

  const totalDebt = counterparties.reduce((s, c) => s + Math.abs(c.balance), 0);

  return (
    <>
      {/* Хедер */}
      <div className="card" style={{ padding: '24px 28px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '24px', background: 'linear-gradient(135deg, rgba(252,174,145,0.06) 0%, transparent 60%)' }}>
        {/* SVG сеть */}
        <svg width="80" height="80" viewBox="0 0 80 80" fill="none" style={{ flexShrink: 0 }}>
          <circle cx="40" cy="40" r="38" stroke="var(--border)" strokeWidth="1" strokeDasharray="4 4" />
          {[{ cx: 40, cy: 12, c: '#FCAE91' }, { cx: 67, cy: 57, c: '#A3C9A8' }, { cx: 13, cy: 57, c: '#7EB5D6' }].map((n, i) => (
            <g key={i}>
              <circle cx={n.cx} cy={n.cy} r="9" fill={n.c + '22'} stroke={n.c} strokeWidth="1.5" />
              <line x1={n.cx} y1={n.cy} x2="40" y2="40" stroke="var(--border)" strokeWidth="1.2" />
            </g>
          ))}
          <circle cx="40" cy="40" r="11" fill="rgba(252,174,145,0.15)" stroke="#FCAE91" strokeWidth="2" />
          <text x="40" y="44" textAnchor="middle" style={{ fontSize: '9px', fill: '#FCAE91', fontWeight: 800, fontFamily: 'var(--font)' }}>Вы</text>
        </svg>

        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '20px', fontWeight: 800, marginBottom: '4px' }}>{counterparties.length} контрагента</div>
          <div style={{ fontSize: '13px', color: 'var(--text2)', lineHeight: 1.5 }}>
            Общая задолженность: <span style={{ color: '#D88C9A', fontWeight: 700 }}>{fmt(totalDebt)}</span>
          </div>
        </div>

        <Btn v="primary" onClick={() => setAdding(true)}><Ico.Plus /> Добавить</Btn>
      </div>

      {/* Форма добавления */}
      {adding && (
        <div className="card" style={{ border: '1.5px solid var(--accent)', background: 'rgba(252,174,145,0.03)', marginBottom: '16px' }}>
          <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Ico.Building /> Новый контрагент
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
            {[
              { label: 'Название / ФИО', placeholder: 'ООО «Название»', key: 'name' },
              { label: 'ИНН', placeholder: '7701234567', key: 'inn' },
              { label: 'Категория', placeholder: 'Аренда, Поставщик…', key: 'category' },
            ].map(f => (
              <div key={f.key}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text3)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.4px' }}>{f.label}</div>
                <input className="search-input" style={{ width: '100%' }} placeholder={f.placeholder}
                  value={form[f.key as keyof typeof form]}
                  onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                />
              </div>
            ))}
            <div>
              <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text3)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Тип</div>
              <select className="search-input" style={{ width: '100%', appearance: 'none' }}
                value={form.type} onChange={e => setForm(prev => ({ ...prev, type: e.target.value }))}>
                <option>Юр. лицо</option>
                <option>ИП</option>
                <option>Физ. лицо</option>
              </select>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <Btn v="primary" onClick={handleAdd}>Сохранить</Btn>
            <Btn onClick={() => setAdding(false)}>Отмена</Btn>
          </div>
        </div>
      )}

      {/* Список */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {counterparties.map((cp, i) => (
          <div key={cp.id}>
            <div
              onClick={() => setSelected(selected === cp.id ? null : cp.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: '14px', padding: '16px 20px',
                borderBottom: i < counterparties.length - 1 ? '1px solid var(--border)' : 'none',
                cursor: 'pointer', background: selected === cp.id ? 'rgba(252,174,145,0.04)' : 'transparent',
                transition: 'background 0.15s',
              }}
            >
              <div style={{ width: '42px', height: '42px', borderRadius: '12px', flexShrink: 0, background: cp.color + '22', display: 'flex', alignItems: 'center', justifyContent: 'center', color: cp.color }}>
                {cp.type === 'Физ. лицо' ? <Ico.User /> : <Ico.Building />}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '2px' }}>{cp.name}</div>
                <div style={{ fontSize: '11px', color: 'var(--text3)' }}>{cp.type} · ИНН {cp.inn}</div>
              </div>
              <Badge text={cp.category} color={cp.color} bg={cp.color + '18'} />
              <div style={{ textAlign: 'right', marginLeft: '8px' }}>
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#D88C9A' }}>{fmt(Math.abs(cp.balance))}</div>
                <div style={{ fontSize: '10px', color: 'var(--text3)' }}>{cp.deals} сделок</div>
              </div>
              <div style={{ color: 'var(--text3)', transition: 'transform 0.2s', transform: selected === cp.id ? 'rotate(90deg)' : 'none' }}>
                <Ico.Chevron />
              </div>
            </div>

            {selected === cp.id && (
              <div style={{ background: 'rgba(252,174,145,0.03)', padding: '16px 20px', borderBottom: i < counterparties.length - 1 ? '1px solid var(--border)' : 'none' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '14px' }}>
                  {[['Сделок', cp.deals], ['Задолженность', fmt(Math.abs(cp.balance))], ['Категория', cp.category]].map(([l, v]) => (
                    <div key={l as string}>
                      <div style={{ fontSize: '10px', color: 'var(--text3)', fontWeight: 600, marginBottom: '3px', textTransform: 'uppercase' }}>{l}</div>
                      <div style={{ fontSize: '14px', fontWeight: 700 }}>{v}</div>
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <Btn size="sm" onClick={() => showToast('Документы открыты')}><Ico.Doc />Документы</Btn>
                  <Btn size="sm" onClick={() => showToast('Редактирование открыто')}><Ico.Edit />Редактировать</Btn>
                  <Btn size="sm" v="danger" onClick={() => setConfirm({ open: true, id: cp.id })}><Ico.Trash />Удалить</Btn>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      <ConfirmModal
        open={confirm.open}
        title="Удалить контрагента?"
        text="Все связанные документы и история сделок останутся, но контрагент будет удалён из списка."
        onConfirm={confirmDelete}
        onCancel={() => setConfirm({ open: false, id: null })}
        danger
      />
    </>
  );
}

// ─── TAB: ДОКУМЕНТЫ (PREMIUM MINIMALISM & CLOUD STORAGE UX) ────────────────
function TabDocuments({ showToast }: { showToast: (msg: string, t?: ToastType) => void }) {
  const [docs, setDocs] = useState(DOCUMENTS_DATA);
  
  // Поиск и фильтрация
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'signed' | 'pending'>('all');
  const [isSearchFocused, setIsSearchFocused] = useState(false);

  // Создание
  const [addOpen, setAddOpen] = useState(false);
  const [newDoc, setNewDoc] = useState({ title: '', party: '', type: 'Договор', needsSignature: true });
  const [isDragHover, setIsDragHover] = useState(false);
  const [isInputFocused, setIsInputFocused] = useState<{ [key: string]: boolean }>({});

  const statusMeta: Record<string, { label: string; color: string; bg: string }> = {
    signed: { label: 'Подписан', color: '#4E885B', bg: 'rgba(163,201,168,0.2)' },
    pending: { label: 'Ожидает подписи', color: '#D88C9A', bg: 'rgba(216,140,154,0.15)' },
    draft: { label: 'Без подписи', color: '#666666', bg: 'rgba(26,26,26,0.06)' },
  };
  const extColors: Record<string, string> = { PDF: '#D88C9A', DOCX: '#7EB5D6', XLSX: '#A3C9A8' };

  const filtered = docs.filter(d => {
    const matchFilter = filter === 'all' || d.status === filter;
    const matchSearch = !search || d.title.toLowerCase().includes(search.toLowerCase()) || d.party.toLowerCase().includes(search.toLowerCase());
    return matchFilter && matchSearch;
  });

  const handleCreate = () => {
    if (!newDoc.title.trim()) { showToast('Загрузите файл или введите название', 'error'); return; }
    setDocs(prev => [{
      id: Date.now(), 
      title: newDoc.title, 
      type: newDoc.type,
      date: 'Только что',
      party: newDoc.party || 'Внутренний документ', 
      amount: 0,
      status: newDoc.needsSignature ? 'pending' : 'draft', 
      ext: 'PDF',
    }, ...prev]);
    setNewDoc({ title: '', party: '', type: 'Договор', needsSignature: true });
    setAddOpen(false);
    showToast('Документ успешно загружен в базу', 'success');
  };

  const signedCount = docs.filter(d => d.status === 'signed').length;
  const pendingCount = docs.filter(d => d.status === 'pending').length;
  const draftCount = docs.filter(d => d.status === 'draft').length;

  return (
    <>
      <style>{`
        @keyframes cardMorph {
          from { opacity: 0; transform: scale(0.97) translateY(6px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
        .morph-container { animation: cardMorph 0.3s cubic-bezier(0.2, 0.8, 0.2, 1) both; }
        .doc-row:hover { transform: translateX(4px); box-shadow: 0 4px 12px rgba(26,26,26,0.04); border-color: rgba(249,160,139,0.3) !important; }
      `}</style>

      {/* 1. РОСКОШНЫЕ КАРТОЧКИ СВОДКИ */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px', marginBottom: '28px' }}>
        
        {/* Подписано */}
        <div style={{ background: '#FFFFFF', borderRadius: '16px', padding: '24px', border: '1px solid rgba(26,26,26,0.12)', boxShadow: '0 12px 32px -4px rgba(26,26,26,0.02)', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: '-20px', right: '-20px', width: '100px', height: '100px', background: 'radial-gradient(circle, rgba(163,201,168,0.15) 0%, transparent 70%)', borderRadius: '50%' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(163,201,168,0.12)', color: '#5BAB72', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Ico.Check /></div>
            <div style={{ fontSize: '12px', color: '#666666', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px' }}>Подписано</div>
          </div>
          <div style={{ fontSize: '32px', fontWeight: 800, color: '#1A1A1A', letterSpacing: '-1px' }}>{signedCount}</div>
        </div>

        {/* Ожидает подписи */}
        <div style={{ background: '#FFFFFF', borderRadius: '16px', padding: '24px', border: '1px solid rgba(26,26,26,0.12)', boxShadow: '0 12px 32px -4px rgba(26,26,26,0.02)', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: '-20px', right: '-20px', width: '100px', height: '100px', background: 'radial-gradient(circle, rgba(216,140,154,0.12) 0%, transparent 70%)', borderRadius: '50%' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(216,140,154,0.12)', color: '#D88C9A', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Ico.Edit /></div>
            <div style={{ fontSize: '12px', color: '#666666', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px' }}>Ждут подписи</div>
          </div>
          <div style={{ fontSize: '32px', fontWeight: 800, color: '#1A1A1A', letterSpacing: '-1px' }}>
            <span style={{ color: pendingCount > 0 ? '#D88C9A' : '#1A1A1A' }}>{pendingCount}</span>
          </div>
        </div>

        {/* Остальные / Черновики */}
        <div style={{ background: '#FFFFFF', borderRadius: '16px', padding: '24px', border: '1px solid rgba(26,26,26,0.12)', boxShadow: '0 12px 32px -4px rgba(26,26,26,0.02)', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: '-20px', right: '-20px', width: '100px', height: '100px', background: 'radial-gradient(circle, rgba(126,181,214,0.15) 0%, transparent 70%)', borderRadius: '50%' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(126,181,214,0.12)', color: '#7EB5D6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Ico.Doc /></div>
            <div style={{ fontSize: '12px', color: '#666666', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px' }}>Внутренние (Без подписи)</div>
          </div>
          <div style={{ fontSize: '32px', fontWeight: 800, color: '#1A1A1A', letterSpacing: '-1px' }}>{draftCount}</div>
        </div>
      </div>

      {/* 2. ПАНЕЛЬ УПРАВЛЕНИЯ (ACTION ISLAND) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px', background: '#FFFFFF', padding: '12px 16px', borderRadius: '16px', border: '1px solid rgba(26,26,26,0.12)', boxShadow: '0 8px 32px -8px rgba(26,26,26,0.04)', flexWrap: 'wrap' }}>
        
        {/* Поиск */}
        <div style={{ position: 'relative', flex: 1, minWidth: '250px' }}>
          <div style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: isSearchFocused ? '#F9A08B' : '#999999', transition: 'color 0.2s', pointerEvents: 'none' }}><Ico.Search /></div>
          <input type="text" placeholder="Искать по названию или контрагенту..." value={search} onChange={e => setSearch(e.target.value)} onFocus={() => setIsSearchFocused(true)} onBlur={() => setIsSearchFocused(false)} style={{ width: '100%', height: '48px', paddingLeft: '44px', paddingRight: search ? '40px' : '16px', background: '#FDFCFB', border: isSearchFocused ? '1.5px solid #F9A08B' : '1.5px solid rgba(26,26,26,0.06)', borderRadius: '12px', fontSize: '14px', fontWeight: 500, color: '#1A1A1A', outline: 'none', boxShadow: isSearchFocused ? '0 0 0 3px rgba(249, 160, 139, 0.12)' : 'none', transition: 'all 0.25s', boxSizing: 'border-box', fontFamily: "'Manrope', sans-serif" }} />
          {search && (
            <button onClick={() => setSearch('')} style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', width: '24px', height: '24px', borderRadius: '50%', background: 'rgba(26,26,26,0.06)', border: 'none', cursor: 'pointer', color: '#666', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }}><Ico.X /></button>
          )}
        </div>

        {/* Фильтры */}
        <div style={{ display: 'flex', gap: '4px', background: 'rgba(26,26,26,0.03)', padding: '4px', borderRadius: '12px', flexShrink: 0 }}>
          {(['all', 'signed', 'pending'] as const).map(f => {
            const isActive = filter === f;
            return (
              <button key={f} onClick={() => setFilter(f)} style={{ padding: '8px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 700, border: 'none', cursor: 'pointer', fontFamily: "'Manrope', sans-serif", background: isActive ? '#FFFFFF' : 'transparent', color: isActive ? '#1A1A1A' : '#666666', boxShadow: isActive ? '0 2px 8px rgba(26,26,26,0.06)' : 'none', transition: 'all 0.2s' }}>
                {f === 'all' ? 'Все' : f === 'signed' ? 'Подписаны' : 'Ждут подписи'}
              </button>
            );
          })}
        </div>

        {/* Кнопка создания (Плюс) */}
        {!addOpen && (
          <button onClick={() => setAddOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: '8px', height: '44px', padding: '0 20px', background: '#F9A08B', border: 'none', borderRadius: '10px', color: '#FFFFFF', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: "'Manrope', sans-serif", transition: 'all 0.2s', boxShadow: '0 6px 16px rgba(249, 160, 139, 0.25)', flexShrink: 0 }} onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.filter = 'brightness(1.05)'; }} onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.filter = 'none'; }}>
            <Ico.Plus /> Загрузить
          </button>
        )}
      </div>

      {/* 3. ЗОНА ЗАГРУЗКИ НОВОГО ДОКУМЕНТА (DRAG & DROP) */}
      {addOpen && (
        <div className="morph-container card" style={{ padding: '32px', marginBottom: '24px', background: '#FFFFFF', borderRadius: '16px', border: '1px solid rgba(26,26,26,0.12)', boxShadow: '0 16px 40px -8px rgba(26,26,26,0.06)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
            <div style={{ fontSize: '18px', fontWeight: 800, color: '#1A1A1A', letterSpacing: '-0.3px' }}>Добавить документ в базу</div>
            <button onClick={() => setAddOpen(false)} style={{ background: 'none', border: 'none', color: '#999', cursor: 'pointer', transition: 'color 0.2s' }} onMouseEnter={e => e.currentTarget.style.color='#1A1A1A'} onMouseLeave={e => e.currentTarget.style.color='#999'}><Ico.X /></button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '32px' }}>
            {/* Визуальная зона Drag&Drop */}
            <div 
              style={{ border: isDragHover ? '2px dashed #F9A08B' : '2px dashed rgba(26,26,26,0.12)', borderRadius: '16px', background: isDragHover ? 'rgba(249, 160, 139, 0.03)' : 'rgba(26,26,26,0.01)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 20px', cursor: 'pointer', transition: 'all 0.2s' }}
              onMouseEnter={() => setIsDragHover(true)} onMouseLeave={() => setIsDragHover(false)}
              onClick={() => showToast('Выбор файла...', 'info')}
            >
              <div style={{ width: '56px', height: '56px', borderRadius: '16px', background: '#FFFFFF', boxShadow: '0 8px 24px rgba(0,0,0,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#F9A08B', marginBottom: '16px' }}>
                <Ico.Download />
              </div>
              <div style={{ fontSize: '14px', fontWeight: 700, color: '#1A1A1A', marginBottom: '4px' }}>Нажмите или перетащите файл</div>
              <div style={{ fontSize: '12px', color: '#999999' }}>PDF, DOCX, XLSX (до 15 МБ)</div>
            </div>

            {/* Настройки документа */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#666666', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '8px' }}>Название документа</label>
                <input type="text" placeholder="Например: Акт сдачи-приемки №48" value={newDoc.title} onChange={e => setNewDoc(p => ({ ...p, title: e.target.value }))} onFocus={() => setIsInputFocused({ ...isInputFocused, title: true })} onBlur={() => setIsInputFocused({ ...isInputFocused, title: false })} style={{ width: '100%', padding: '12px 16px', background: '#FDFCFB', border: isInputFocused['title'] ? '1.5px solid #F9A08B' : '1.5px solid rgba(26,26,26,0.08)', borderRadius: '8px', fontSize: '13px', fontWeight: 500, color: '#1A1A1A', outline: 'none', boxShadow: isInputFocused['title'] ? '0 0 0 3px rgba(249, 160, 139, 0.12)' : 'none', transition: 'all 0.2s', boxSizing: 'border-box' }} />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#666666', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '8px' }}>Контрагент (Если есть)</label>
                <input type="text" placeholder="Название ИП или ООО" value={newDoc.party} onChange={e => setNewDoc(p => ({ ...p, party: e.target.value }))} onFocus={() => setIsInputFocused({ ...isInputFocused, party: true })} onBlur={() => setIsInputFocused({ ...isInputFocused, party: false })} style={{ width: '100%', padding: '12px 16px', background: '#FDFCFB', border: isInputFocused['party'] ? '1.5px solid #F9A08B' : '1.5px solid rgba(26,26,26,0.08)', borderRadius: '8px', fontSize: '13px', fontWeight: 500, color: '#1A1A1A', outline: 'none', boxShadow: isInputFocused['party'] ? '0 0 0 3px rgba(249, 160, 139, 0.12)' : 'none', transition: 'all 0.2s', boxSizing: 'border-box' }} />
              </div>

              {/* Тумблер: Требует подписания */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', background: 'rgba(26,26,26,0.02)', borderRadius: '10px', border: '1px solid rgba(26,26,26,0.04)', marginTop: '8px' }}>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#1A1A1A' }}>Документ требует подписи?</div>
                  <div style={{ fontSize: '11px', color: '#999999', marginTop: '2px' }}>Статус будет "Ожидает подписи"</div>
                </div>
                <Toggle on={newDoc.needsSignature} onChange={() => setNewDoc(p => ({ ...p, needsSignature: !p.needsSignature }))} />
              </div>

              <button onClick={handleCreate} disabled={!newDoc.title.trim()} style={{ marginTop: 'auto', padding: '14px', background: newDoc.title.trim() ? '#F9A08B' : 'rgba(26,26,26,0.04)', border: 'none', borderRadius: '10px', color: newDoc.title.trim() ? '#FFFFFF' : '#999999', fontSize: '13px', fontWeight: 700, cursor: newDoc.title.trim() ? 'pointer' : 'not-allowed', transition: 'all 0.2s', boxShadow: newDoc.title.trim() ? '0 6px 20px rgba(249, 160, 139, 0.25)' : 'none' }}>
                Сохранить в базу
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4. СПИСОК ДОКУМЕНТОВ */}
      <div style={{ background: '#FFFFFF', borderRadius: '16px', border: '1px solid rgba(26,26,26,0.12)', boxShadow: '0 12px 32px -4px rgba(26,26,26,0.02)', overflow: 'hidden' }}>
        {filtered.length === 0 ? (
          <div style={{ padding: '64px 20px', textAlign: 'center', background: '#FAFAFA' }}>
            <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'rgba(26,26,26,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', color: '#999999' }}><Ico.Doc /></div>
            <div style={{ fontSize: '16px', fontWeight: 800, color: '#1A1A1A', marginBottom: '6px' }}>В этой папке пусто</div>
            <div style={{ fontSize: '13px', color: '#666666' }}>Загрузите новый документ или измените фильтры</div>
          </div>
        ) : filtered.map((doc, i) => {
          const sm = statusMeta[doc.status];
          const extColor = extColors[doc.ext] || '#999';
          
          return (
            <div key={doc.id} className="doc-row" style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '16px 24px', borderBottom: i < filtered.length - 1 ? '1px solid rgba(26,26,26,0.12)' : 'none', background: 'transparent', transition: 'all 0.25s cubic-bezier(0.2, 0.8, 0.2, 1)', borderLeft: '3px solid transparent' }}>
              
              {/* Элегантная иконка формата файла */}
              <div style={{ width: '46px', height: '52px', borderRadius: '10px', background: extColor + '15', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0, gap: '4px', color: extColor, border: `1px solid ${extColor}30` }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                <span style={{ fontSize: '9px', fontWeight: 800, color: extColor, letterSpacing: '0.5px' }}>{doc.ext}</span>
              </div>

              {/* Название и контрагент */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '14px', fontWeight: 700, color: '#1A1A1A', marginBottom: '4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {doc.title}
                </div>
                <div style={{ fontSize: '12px', color: '#666666', fontWeight: 500 }}>
                  <span style={{ color: '#1A1A1A', fontWeight: 600 }}>{doc.party}</span> <span style={{ opacity: 0.5, margin: '0 4px' }}>•</span> Загружен {doc.date}
                </div>
              </div>

              {/* Бейдж статуса */}
              <div style={{ flexShrink: 0, marginRight: '16px' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: sm.bg, color: sm.color, padding: '6px 12px', borderRadius: '8px', fontSize: '11px', fontWeight: 700, border: `1px solid ${sm.color}30` }}>
                  {doc.status === 'signed' ? <Ico.Check /> : doc.status === 'pending' ? <Ico.Edit /> : null}
                  {sm.label}
                </span>
              </div>

              {/* Экшен-кнопки */}
              <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                <button onClick={() => showToast('Скачивание файла...', 'info')} style={{ width: '36px', height: '36px', borderRadius: '10px', background: '#FDFCFB', border: '1px solid rgba(26,26,26,0.08)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666666', transition: 'all 0.2s', boxShadow: '0 2px 6px rgba(0,0,0,0.02)' }} onMouseEnter={e => { e.currentTarget.style.borderColor = '#1A1A1A'; e.currentTarget.style.color = '#1A1A1A'; e.currentTarget.style.transform = 'translateY(-1px)'; }} onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(26,26,26,0.08)'; e.currentTarget.style.color = '#666666'; e.currentTarget.style.transform = 'translateY(0)'; }} title="Скачать">
                  <Ico.Download />
                </button>
                <button onClick={() => showToast('Опции документа открыты')} style={{ width: '36px', height: '36px', borderRadius: '10px', background: '#FDFCFB', border: '1px solid rgba(26,26,26,0.08)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666666', transition: 'all 0.2s', boxShadow: '0 2px 6px rgba(0,0,0,0.02)' }} onMouseEnter={e => { e.currentTarget.style.borderColor = '#1A1A1A'; e.currentTarget.style.color = '#1A1A1A'; e.currentTarget.style.transform = 'translateY(-1px)'; }} onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(26,26,26,0.08)'; e.currentTarget.style.color = '#666666'; e.currentTarget.style.transform = 'translateY(0)'; }} title="Настройки">
                  <Ico.Dots />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

// ─── TAB: ОНЛАЙН-ПЛАТЕЖИ (PREMIUM MINIMALISM & CONTEXT ANALYTICS) ────────────
function TabOnlinePayments({ showToast }: { showToast: (msg: string, t?: ToastType) => void }) {
  const [channels, setChannels] = useState(ONLINE_CHANNELS_DATA);
  const [copied, setCopied] = useState(false);
  
  // Состояние: какой именно график сейчас развернут (храним ID шлюза)
  const [expandedChartId, setExpandedChartId] = useState<number | null>(null);

  const toggle = (id: number) => {
    setChannels(prev => prev.map(c => c.id === id ? { ...c, active: !c.active } : c));
    showToast('Настройки шлюза обновлены', 'success');
  };

  const handleCopy = () => {
    setCopied(true);
    showToast('Ссылка скопирована в буфер', 'success');
    setTimeout(() => setCopied(false), 2000);
  };

  const total = channels.filter(c => c.active).reduce((s, c) => s + c.amount, 0);
  const sessions = channels.filter(c => c.active).reduce((s, c) => s + c.sessions, 0);

  // Генератор реалистичных данных для конкретного шлюза
  const getChartData = (channelAmount: number, isActive: boolean) => {
    if (!isActive || channelAmount === 0) {
      return ['Янв','Фев','Мар','Апр','Май','Июн','Июл','Авг','Сен','Окт','Ноя','Дек'].map(m => ({ m, val: 0 }));
    }
    const base = channelAmount / 5; // Базовая точка для математической кривой
    const curve = [0.4, 0.5, 0.7, 0.6, 0.9, 1.1, 1.4, 1.2, 1.5, 1.8, 2.1, 2.5];
    return curve.map((multiplier, i) => ({
      m: ['Янв','Фев','Мар','Апр','Май','Июн','Июл','Авг','Сен','Окт','Ноя','Дек'][i],
      val: Math.round(base * multiplier)
    }));
  };

  const IconsMap: Record<string, React.ReactNode> = {
    link: <Ico.World />, qr: <Ico.QR />,
    widget: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>,
    telegram: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M22 2L11 13M22 2L15 22l-4-9-9-4 20-7z"/></svg>,
  };

  return (
    <>
      <style>{`
        /* Анимация пульсации центрального узла */
        @keyframes pulseCore {
          0%, 100% { box-shadow: 0 0 0 0 rgba(249,160,139,0.3); }
          50% { box-shadow: 0 0 0 10px rgba(249,160,139,0); }
        }
        /* Анимация плавного разворачивания графика внутри карточки */
        @keyframes expandChartInner {
          from { opacity: 0; transform: translateY(-8px) scaleY(0.95); max-height: 0; margin-top: 0; }
          to { opacity: 1; transform: translateY(0) scaleY(1); max-height: 300px; margin-top: 20px; }
        }
        .chart-container-inner {
          animation: expandChartInner 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
          transform-origin: top;
          overflow: hidden;
        }
      `}</style>

      {/* 1. ГЛАВНЫЙ БЛОК (СВОДКА И АНИМИРОВАННАЯ ИЛЛЮСТРАЦИЯ) */}
      <div style={{ background: '#FFFFFF', borderRadius: '16px', border: '1px solid rgba(26,26,26,0.12)', boxShadow: '0 16px 40px -8px rgba(26,26,26,0.04)', marginBottom: '24px', overflow: 'hidden' }}>
        
        <div style={{ padding: '32px', position: 'relative' }}>
          {/* Мягкий фоновый засвет */}
          <div style={{ position: 'absolute', top: '-40px', right: '-20px', width: '250px', height: '250px', background: 'radial-gradient(circle, rgba(249,160,139,0.08) 0%, transparent 70%)', borderRadius: '50%', pointerEvents: 'none' }} />
          
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '20px' }}>
            <div style={{ zIndex: 2 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(249, 160, 139, 0.12)', color: '#F9A08B', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Ico.World /></div>
                <div style={{ fontSize: '11px', color: '#666666', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px' }}>Суммарный онлайн-оборот</div>
              </div>
              <div style={{ fontSize: '42px', fontWeight: 800, letterSpacing: '-1.5px', color: '#1A1A1A', marginBottom: '6px' }}>{fmt(total)}</div>
              <div style={{ fontSize: '13px', color: '#666666', fontWeight: 500 }}>Обработано <span style={{ color: '#1A1A1A', fontWeight: 700 }}>{sessions}</span> платежных сессий в этом месяце</div>
            </div>

            {/* ПРЕМИАЛЬНАЯ АНИМИРОВАННАЯ SVG ИЛЛЮСТРАЦИЯ (Светящиеся частицы) */}
            <svg width="180" height="110" viewBox="0 0 180 110" fill="none" style={{ zIndex: 2, overflow: 'visible' }}>
              {/* Провода (полупрозрачные направляющие) */}
              <path id="pathQR" d="M35 25 L100 55" stroke="rgba(26,26,26,0.04)" strokeWidth="2.5" strokeLinecap="round" />
              <path id="pathWEB" d="M35 55 L100 55" stroke="rgba(26,26,26,0.04)" strokeWidth="2.5" strokeLinecap="round" />
              <path id="pathTG" d="M35 85 L100 55" stroke="rgba(26,26,26,0.04)" strokeWidth="2.5" strokeLinecap="round" />
              <path id="pathOUT" d="M125 55 L165 55" stroke="rgba(26,26,26,0.04)" strokeWidth="2.5" strokeLinecap="round" />

              {/* Летящие пакеты данных (светящиеся точки с animateMotion) */}
              <circle r="3" fill="#F9A08B" style={{ filter: 'drop-shadow(0 0 6px rgba(249,160,139,0.8))' }}>
                <animateMotion dur="2.5s" repeatCount="indefinite" path="M35 25 L100 55" />
              </circle>
              <circle r="3" fill="#F9A08B" style={{ filter: 'drop-shadow(0 0 6px rgba(249,160,139,0.8))' }}>
                <animateMotion dur="1.8s" repeatCount="indefinite" path="M35 55 L100 55" />
              </circle>
              <circle r="3" fill="#F9A08B" style={{ filter: 'drop-shadow(0 0 6px rgba(249,160,139,0.8))' }}>
                <animateMotion dur="3.2s" repeatCount="indefinite" path="M35 85 L100 55" />
              </circle>
              
              {/* Успешный выходной пакет (Зеленый) */}
              <circle r="3" fill="#5BAB72" style={{ filter: 'drop-shadow(0 0 6px rgba(91,171,114,0.8))' }}>
                <animateMotion dur="1.5s" repeatCount="indefinite" path="M125 55 L165 55" />
              </circle>

              {/* Крайние узлы */}
              <g style={{ transformOrigin: '25px 25px' }}><circle cx="25" cy="25" r="14" fill="#FFFFFF" stroke="rgba(249,160,139,0.5)" strokeWidth="1.5" /><text x="25" y="28" textAnchor="middle" style={{ fontSize: '8px', fill: '#1A1A1A', fontWeight: 800, fontFamily: 'var(--font)' }}>QR</text></g>
              <g style={{ transformOrigin: '25px 55px' }}><circle cx="25" cy="55" r="14" fill="#FFFFFF" stroke="rgba(249,160,139,0.5)" strokeWidth="1.5" /><text x="25" y="58" textAnchor="middle" style={{ fontSize: '8px', fill: '#1A1A1A', fontWeight: 800, fontFamily: 'var(--font)' }}>WEB</text></g>
              <g style={{ transformOrigin: '25px 85px' }}><circle cx="25" cy="85" r="14" fill="#FFFFFF" stroke="rgba(249,160,139,0.5)" strokeWidth="1.5" /><text x="25" y="88" textAnchor="middle" style={{ fontSize: '8px', fill: '#1A1A1A', fontWeight: 800, fontFamily: 'var(--font)' }}>TG</text></g>

              {/* Центральный хаб (Пульсирующий) */}
              <circle cx="112" cy="55" r="22" fill="#FFFFFF" stroke="#F9A08B" strokeWidth="2" style={{ animation: 'pulseCore 2.5s infinite' }} />
              <text x="112" y="51" textAnchor="middle" style={{ fontSize: '12px', fill: '#1A1A1A', fontWeight: 800, fontFamily: 'var(--font)' }}>₽</text>
              <text x="112" y="62" textAnchor="middle" style={{ fontSize: '7px', fill: '#999999', fontFamily: 'var(--font)', fontWeight: 600 }}>шлюз</text>

              {/* Выходной узел успеха */}
              <circle cx="170" cy="55" r="10" fill="rgba(91,171,114,0.15)" stroke="#5BAB72" strokeWidth="1.5" />
              <text x="170" y="58" textAnchor="middle" style={{ fontSize: '8.5px', fill: '#5BAB72', fontWeight: 800, fontFamily: 'var(--font)' }}>✓</text>
            </svg>
          </div>
        </div>

        {/* Нижняя панель: Ссылка */}
        <div style={{ padding: '20px 32px', borderTop: '1px solid rgba(26,26,26,0.05)', background: '#FAFAFA', display: 'flex', alignItems: 'center' }}>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', background: '#FFFFFF', borderRadius: '10px', padding: '6px 6px 6px 16px', border: '1px solid rgba(26,26,26,0.08)', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.02)' }}>
            <div style={{ flex: 1, fontSize: '13px', color: '#1A1A1A', fontFamily: 'monospace', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              pay.velora.studio/p/velora-pilates
            </div>
            <button 
              onClick={handleCopy}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', background: copied ? '#A3C9A8' : '#1A1A1A', color: '#FFFFFF', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s cubic-bezier(0.2, 0.8, 0.2, 1)' }}
            >
              {copied ? <><Ico.Check /> Скопировано</> : <><Ico.Copy /> Копировать</>}
            </button>
          </div>
        </div>
      </div>

      {/* 2. КАНАЛЫ С ВСТРОЕННОЙ АНАЛИТИКОЙ (CONTEXT UX) */}
      <div style={{ fontSize: '12px', fontWeight: 800, color: '#1A1A1A', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: '16px', paddingLeft: '4px' }}>
        Управление шлюзами
      </div>
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {channels.map(ch => {
          const isChartOpen = expandedChartId === ch.id;
          const chartData = getChartData(ch.amount, ch.active);
          const maxVal = Math.max(...chartData.map(d => d.val), 1); // Чтобы избежать деления на ноль

          return (
            <div 
              key={ch.id} 
              style={{ 
                padding: '24px', borderRadius: '16px',
                opacity: ch.active ? 1 : 0.6, 
                background: ch.active ? '#FFFFFF' : 'rgba(26,26,26,0.01)',
                border: isChartOpen ? '1.5px solid #F9A08B' : (ch.active ? '1.5px solid rgba(26,26,26,0.15)' : '1.5px solid rgba(26,26,26,0.12)'),
                boxShadow: isChartOpen ? '0 16px 40px -8px rgba(249,160,139,0.15)' : (ch.active ? '0 8px 24px -4px rgba(26,26,26,0.04)' : 'none'),
                transition: 'all 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)',
                overflow: 'hidden'
              }}
            >
              {/* Шапка карточки */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <div style={{ width: '48px', height: '48px', borderRadius: '12px', flexShrink: 0, background: ch.active ? 'rgba(249, 160, 139, 0.12)' : 'rgba(26,26,26,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: ch.active ? '#F9A08B' : '#999999', transition: 'all 0.3s' }}>
                  {IconsMap[ch.icon]}
                </div>
                
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '15px', fontWeight: 800, color: '#1A1A1A', marginBottom: '2px' }}>{ch.name}</div>
                  <div style={{ fontSize: '12px', color: '#666666', lineHeight: 1.4 }}>{ch.desc}</div>
                </div>
                
                <div style={{ textAlign: 'right', marginRight: '16px', flexShrink: 0 }}>
                  <div style={{ fontSize: '16px', fontWeight: 800, color: '#1A1A1A', letterSpacing: '-0.3px' }}>{fmt(ch.amount)}</div>
                  <div style={{ fontSize: '11px', color: '#999999', fontWeight: 600 }}>{ch.sessions} сессий</div>
                </div>

                {/* Кнопка Аналитики (Только если канал активен) */}
                <button 
                  onClick={() => ch.active && setExpandedChartId(isChartOpen ? null : ch.id)}
                  disabled={!ch.active}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 16px', borderRadius: '10px', fontSize: '12px', fontWeight: 700, cursor: ch.active ? 'pointer' : 'not-allowed', fontFamily: "'Manrope', sans-serif", transition: 'all 0.2s', marginRight: '16px', background: isChartOpen ? '#1A1A1A' : 'transparent', color: isChartOpen ? '#FFFFFF' : '#666666', border: isChartOpen ? '1px solid #1A1A1A' : '1px solid rgba(26,26,26,0.1)' }}
                  onMouseEnter={e => { if(ch.active && !isChartOpen) { e.currentTarget.style.borderColor = '#1A1A1A'; e.currentTarget.style.color = '#1A1A1A'; } }}
                  onMouseLeave={e => { if(ch.active && !isChartOpen) { e.currentTarget.style.borderColor = 'rgba(26,26,26,0.1)'; e.currentTarget.style.color = '#666666'; } }}
                >
                  <Ico.Bar /> Аналитика
                </button>
                
                <Toggle on={ch.active} onChange={() => toggle(ch.id)} />
              </div>

              {/* Разворачивающийся ИНДИВИДУАЛЬНЫЙ график */}
              {isChartOpen && (
                <div className="chart-container-inner" style={{ borderTop: '1px dashed rgba(26,26,26,0.08)', padding: '24px 8px 0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: '#1A1A1A' }}>Статистика транзакций шлюза «{ch.name}»</div>
                    <div style={{ fontSize: '11px', fontWeight: 600, color: '#666666', background: 'rgba(26,26,26,0.04)', padding: '4px 10px', borderRadius: '20px' }}>За последние 12 месяцев</div>
                  </div>
                  
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: '10px', height: '160px' }}>
                    {chartData.map(d => {
                      const heightPct = (d.val / maxVal) * 100;
                      return (
                        <div key={d.m} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', height: '100%', justifyContent: 'flex-end' }}>
                          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'flex-end' }}>
                            <div 
                              title={`Выручка (${d.m}): ${fmt(d.val)}`}
                              style={{ width: '100%', height: `${heightPct}%`, background: 'linear-gradient(180deg, #F9A08B 0%, rgba(249,160,139,0.2) 100%)', borderRadius: '6px 6px 0 0', transition: 'all 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)', cursor: 'pointer' }}
                              onMouseEnter={e => { e.currentTarget.style.opacity = '0.85'; e.currentTarget.style.transform = 'scaleY(1.03)'; e.currentTarget.style.transformOrigin = 'bottom'; }}
                              onMouseLeave={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.transform = 'scaleY(1)'; }}
                            />
                          </div>
                          <div style={{ fontSize: '10px', color: '#999999', fontWeight: 700, textTransform: 'uppercase' }}>{d.m}</div>
                        </div>
                      );
                    })}
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

// ─── TAB: МЕТОДЫ ОПЛАТЫ ──────────────────────────────────────────────────────
function TabPaymentMethods({ showToast }: { showToast: (msg: string, t?: ToastType) => void }) {
  const [methods, setMethods] = useState(PAYMENT_METHODS_DATA);

  const toggle = (id: number) => {
    setMethods(prev => prev.map(m => m.id === id ? { ...m, enabled: !m.enabled } : m));
    showToast('Настройка сохранена', 'success');
  };

  const icons: Record<string, React.ReactNode> = {
    card: <Ico.Card />, cash: <Ico.Cash />, qr: <Ico.QR />, nfc: <Ico.Phone />,
    bnpl: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><rect x="1" y="4" width="22" height="16" rx="2"/><path d="M8 10h2l2 4 2-6 2 4"/></svg>,
  };

  const totalTx = methods.filter(m => m.enabled).reduce((s, m) => s + m.transactions, 0);

  return (
    <>
      {/* Итог */}
      <div className="card card-sm" style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '24px', background: 'linear-gradient(135deg, rgba(252,174,145,0.06) 0%, transparent 60%)' }}>
        <div>
          <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '4px' }}>Активных методов</div>
          <div style={{ fontSize: '28px', fontWeight: 800, letterSpacing: '-0.5px' }}>{methods.filter(m => m.enabled).length}</div>
        </div>
        <div style={{ width: '1px', height: '40px', background: 'var(--border)' }} />
        <div>
          <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '4px' }}>Транзакций за месяц</div>
          <div style={{ fontSize: '28px', fontWeight: 800, letterSpacing: '-0.5px' }}>{totalTx}</div>
        </div>
      </div>

      {/* Методы */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {methods.map(m => (
          <div key={m.id} className="card card-sm" style={{ display: 'flex', alignItems: 'center', gap: '14px', opacity: m.enabled ? 1 : 0.55, transition: 'all 0.2s' }}>
            <div style={{ width: '44px', height: '44px', borderRadius: '12px', flexShrink: 0, background: m.enabled ? 'rgba(252,174,145,0.15)' : 'rgba(0,0,0,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: m.enabled ? 'var(--accent)' : 'var(--text3)', transition: 'all 0.2s' }}>
              {icons[m.icon]}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '2px' }}>{m.name}</div>
              <div style={{ fontSize: '12px', color: 'var(--text3)' }}>{m.desc}</div>
            </div>
            <div style={{ textAlign: 'right', marginRight: '12px' }}>
              <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text2)', marginBottom: '2px' }}>Комиссия: {m.commission}</div>
              <div style={{ fontSize: '11px', color: 'var(--text3)' }}>{m.transactions} транзакций</div>
            </div>
            <Toggle on={m.enabled} onChange={() => toggle(m.id)} />
          </div>
        ))}
      </div>
    </>
  );
}

// ─── TAB: ОТЧЁТЫ (PREMIUM ANALYTICS & INSIGHTS) ──────────────────────────────
function TabReports({ showToast }: { showToast: (msg: string, t?: ToastType) => void }) {
  const [period, setPeriod] = useState('Месяц');
  const [breakdownView, setBreakdownView] = useState<'income' | 'expense'>('expense');
  const [hoveredSeg, setHoveredSegment] = useState<number | null>(null);

  // Данные для основного графика
  const bars = [
    { label: 'Пн', income: 45000, expense: 12000 },
    { label: 'Вт', income: 38000, expense: 8000 },
    { label: 'Ср', income: 72000, expense: 25000 },
    { label: 'Чт', income: 55000, expense: 18000 },
    { label: 'Пт', income: 89000, expense: 15000 },
    { label: 'Сб', income: 120000, expense: 30000 },
    { label: 'Вс', income: 63000, expense: 10000 },
  ];
  const maxVal = Math.max(...bars.map(b => Math.max(b.income, b.expense)));

  // Данные для детализации (Breakdown)
  const expensesData = [
    { id: 1, label: 'Зарплата команды', value: 120000, color: '#D88C9A' },
    { id: 2, label: 'Аренда помещения', value: 80000, color: '#E8A0B0' },
    { id: 3, label: 'Маркетинг и реклама', value: 35000, color: '#F0B4C0' },
    { id: 4, label: 'Налоги и взносы', value: 15000, color: '#F8C8D0' },
  ];
  const incomeData = [
    { id: 1, label: 'Абонементы', value: 250000, color: '#5BAB72' },
    { id: 2, label: 'Разовые визиты', value: 120000, color: '#7AA080' },
    { id: 3, label: 'Продажа товаров (Вода, Мерч)', value: 45000, color: '#9AB5A0' },
    { id: 4, label: 'Сдача в субаренду', value: 67000, color: '#B5C9B8' },
  ];

  const currentBreakdown = breakdownView === 'expense' ? expensesData : incomeData;
  const breakdownTotal = currentBreakdown.reduce((sum, item) => sum + item.value, 0);

  // Отрисовка интерактивного кольца детализации
  const renderDonut = () => {
    const r = 54;
    const circ = 2 * Math.PI * r;
    let offset = 0;

    return (
      <svg width="160" height="160" viewBox="0 0 160 160" style={{ transform: 'rotate(-90deg)', filter: 'drop-shadow(0 8px 16px rgba(0,0,0,0.06))' }}>
        <circle cx="80" cy="80" r={r} fill="none" stroke="rgba(26,26,26,0.03)" strokeWidth="22" />
        {currentBreakdown.map((item) => {
          const pct = item.value / breakdownTotal;
          const dash = pct * circ;
          const gap = circ - dash;
          const isHovered = hoveredSeg === item.id;
          const strokeWidth = isHovered ? 26 : 22; // Кольцо "выпячивается" при наведении
          
          const el = (
            <circle 
              key={item.id} cx="80" cy="80" r={r} fill="none" stroke={item.color} 
              strokeWidth={strokeWidth} strokeDasharray={`${dash} ${gap}`} strokeDashoffset={-offset * circ}
              strokeLinecap="round"
              style={{ transition: 'all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)', cursor: 'pointer', opacity: hoveredSeg === null || hoveredSeg === item.id ? 1 : 0.3 }}
              onMouseEnter={() => setHoveredSegment(item.id)}
              onMouseLeave={() => setHoveredSegment(null)}
            />
          );
          offset += pct;
          return el;
        })}
      </svg>
    );
  };

  return (
    <>
      <style>{`
        .report-bar { transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1); cursor: pointer; position: relative; }
        .report-bar:hover { opacity: 0.85; filter: brightness(1.05); }
        .insight-card { background: linear-gradient(135deg, rgba(249,160,139,0.08) 0%, transparent 100%); border: 1px solid rgba(249,160,139,0.3); border-radius: 16px; padding: 20px 24px; position: relative; overflow: hidden; }
        .insight-card::before { content: ''; position: absolute; top: 0; left: 0; width: 4px; height: 100%; background: #F9A08B; }
      `}</style>

      {/* 1. РОСКОШНЫЕ МЕТРИКИ (TOP CARDS) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
        {[
          { label: 'Выручка', value: '₽482 000', delta: '+12%', good: true, c1: '#A3C9A8', c2: 'rgba(163,201,168,0.15)', icon: <Ico.Up /> },
          { label: 'Расходы', value: '₽118 000', delta: '-4%', good: true, c1: '#D88C9A', c2: 'rgba(216,140,154,0.15)', icon: <Ico.Down /> },
          { label: 'Прибыль', value: '₽364 000', delta: '+18%', good: true, c1: '#F9A08B', c2: 'rgba(249,160,139,0.15)', icon: <Ico.Dollar /> },
          { label: 'Рентабельность', value: '75.5%', delta: '+3.2pp', good: true, c1: '#7EB5D6', c2: 'rgba(126,181,214,0.15)', icon: <Ico.Target /> },
        ].map(m => (
          <div key={m.label} style={{ background: '#FFFFFF', borderRadius: '16px', padding: '24px', border: '1px solid rgba(26,26,26,0.12)', boxShadow: '0 12px 32px -4px rgba(26,26,26,0.02)', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: '-15px', right: '-15px', width: '80px', height: '80px', background: `radial-gradient(circle, ${m.c2} 0%, transparent 70%)`, borderRadius: '50%' }} />
            
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <div style={{ fontSize: '12px', fontWeight: 700, color: '#666666', textTransform: 'uppercase', letterSpacing: '0.6px' }}>{m.label}</div>
              <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: m.c2, color: m.c1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {m.icon}
              </div>
            </div>
            
            <div style={{ fontSize: '28px', fontWeight: 800, letterSpacing: '-0.5px', color: '#1A1A1A', marginBottom: '8px' }}>{m.value}</div>
            <div style={{ fontSize: '12px', fontWeight: 700, color: m.good ? '#5BAB72' : '#D88C9A', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ padding: '2px 6px', background: m.good ? 'rgba(91,171,114,0.1)' : 'rgba(216,140,154,0.1)', borderRadius: '6px' }}>{m.delta}</span> к прошлому периоду
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '24px', marginBottom: '24px' }}>
        
        {/* 2. ГЛАВНЫЙ ГРАФИК (REVENUE VS EXPENSE) */}
        <div style={{ background: '#FFFFFF', borderRadius: '16px', border: '1px solid rgba(26,26,26,0.12)', boxShadow: '0 12px 32px -4px rgba(26,26,26,0.02)', padding: '28px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '32px' }}>
            <div>
              <div style={{ fontSize: '18px', fontWeight: 800, color: '#1A1A1A', letterSpacing: '-0.3px', marginBottom: '4px' }}>Движение средств</div>
              <div style={{ fontSize: '12px', color: '#666666', fontWeight: 500 }}>Анализ доходов и расходов</div>
            </div>
            
            {/* iOS-style Переключатель периодов */}
            <div style={{ display: 'flex', gap: '4px', background: 'rgba(26,26,26,0.03)', border: '1px solid rgba(26,26,26,0.04)', borderRadius: '10px', padding: '4px' }}>
              {['Неделя', 'Месяц', 'Год'].map(p => (
                <button key={p} onClick={() => setPeriod(p)} style={{ padding: '6px 14px', borderRadius: '6px', fontSize: '12px', fontWeight: 700, border: 'none', cursor: 'pointer', fontFamily: "'Manrope', sans-serif", background: period === p ? '#FFFFFF' : 'transparent', color: period === p ? '#1A1A1A' : '#666666', boxShadow: period === p ? '0 2px 8px rgba(26,26,26,0.06)' : 'none', transition: 'all 0.2s' }}>{p}</button>
              ))}
            </div>
          </div>

          {/* Гистограмма */}
          <div style={{ flex: 1, display: 'flex', gap: '16px', alignItems: 'flex-end', height: '240px' }}>
            {bars.map(b => (
              <div key={b.label} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', height: '100%', justifyContent: 'flex-end' }}>
                
                {/* Группа столбиков (Приход и Расход) */}
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: '4px', width: '100%', height: '100%' }}>
                  <div 
                    title={`Доход: ${fmt(b.income)}`} 
                    className="report-bar"
                    style={{ flex: 1, height: `${(b.income / maxVal) * 100}%`, background: 'linear-gradient(180deg, #A3C9A8 0%, rgba(163,201,168,0.4) 100%)', borderRadius: '6px 6px 4px 4px', minHeight: '4px' }} 
                  />
                  <div 
                    title={`Расход: ${fmt(b.expense)}`} 
                    className="report-bar"
                    style={{ flex: 1, height: `${(b.expense / maxVal) * 100}%`, background: 'linear-gradient(180deg, #D88C9A 0%, rgba(216,140,154,0.4) 100%)', borderRadius: '6px 6px 4px 4px', minHeight: '4px' }} 
                  />
                </div>
                <div style={{ fontSize: '11px', color: '#999999', fontWeight: 700, textTransform: 'uppercase' }}>{b.label}</div>
              </div>
            ))}
          </div>

          {/* Легенда */}
          <div style={{ display: 'flex', gap: '20px', marginTop: '24px', paddingTop: '20px', borderTop: '1px solid rgba(26,26,26,0.04)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', fontWeight: 600, color: '#666666' }}>
              <div style={{ width: '12px', height: '12px', borderRadius: '4px', background: '#A3C9A8' }} /> Доходы
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', fontWeight: 600, color: '#666666' }}>
              <div style={{ width: '12px', height: '12px', borderRadius: '4px', background: '#D88C9A' }} /> Расходы
            </div>
            <div style={{ marginLeft: 'auto' }}>
              <Btn size="sm" onClick={() => showToast('Отчёт экспортируется...', 'info')}><Ico.Download /> Экспорт PDF</Btn>
            </div>
          </div>
        </div>

        {/* 3. ИНТЕРАКТИВНАЯ ДЕТАЛИЗАЦИЯ (BREAKDOWN) */}
        <div style={{ background: '#FFFFFF', borderRadius: '16px', border: '1px solid rgba(26,26,26,0.12)', boxShadow: '0 12px 32px -4px rgba(26,26,26,0.02)', padding: '28px', display: 'flex', flexDirection: 'column' }}>
          
          <div style={{ display: 'flex', gap: '4px', background: 'rgba(26,26,26,0.03)', border: '1px solid rgba(26,26,26,0.12)', borderRadius: '10px', padding: '4px', marginBottom: '24px' }}>
            <button onClick={() => setBreakdownView('expense')} style={{ flex: 1, padding: '8px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: 700, border: 'none', cursor: 'pointer', fontFamily: "'Manrope', sans-serif", background: breakdownView === 'expense' ? '#FFFFFF' : 'transparent', color: breakdownView === 'expense' ? '#1A1A1A' : '#666666', boxShadow: breakdownView === 'expense' ? '0 2px 8px rgba(26,26,26,0.06)' : 'none', transition: 'all 0.2s' }}>Структура расходов</button>
            <button onClick={() => setBreakdownView('income')} style={{ flex: 1, padding: '8px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: 700, border: 'none', cursor: 'pointer', fontFamily: "'Manrope', sans-serif", background: breakdownView === 'income' ? '#FFFFFF' : 'transparent', color: breakdownView === 'income' ? '#1A1A1A' : '#666666', boxShadow: breakdownView === 'income' ? '0 2px 8px rgba(26,26,26,0.06)' : 'none', transition: 'all 0.2s' }}>Структура доходов</button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '32px', position: 'relative' }}>
            {renderDonut()}
            <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center' }}>
              <div style={{ fontSize: '10px', color: '#999999', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '2px' }}>Всего</div>
              <div style={{ fontSize: '18px', fontWeight: 800, color: '#1A1A1A', letterSpacing: '-0.5px' }}>{fmt(breakdownTotal)}</div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', flex: 1, overflowY: 'auto' }}>
            {currentBreakdown.map((item) => {
              const isHovered = hoveredSeg === item.id;
              const pct = Math.round((item.value / breakdownTotal) * 100);
              
              return (
                <div 
                  key={item.id}
                  style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px', borderRadius: '10px', background: isHovered ? 'rgba(26,26,26,0.02)' : 'transparent', cursor: 'pointer', transition: 'all 0.2s', border: '1px solid', borderColor: isHovered ? 'rgba(26,26,26,0.06)' : 'transparent' }}
                  onMouseEnter={() => setHoveredSegment(item.id)}
                  onMouseLeave={() => setHoveredSegment(null)}
                >
                  <div style={{ width: '12px', height: '12px', borderRadius: '4px', background: item.color, flexShrink: 0, transform: isHovered ? 'scale(1.2)' : 'scale(1)', transition: 'transform 0.2s' }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: '#1A1A1A' }}>{item.label}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '13px', fontWeight: 800, color: '#1A1A1A' }}>{fmt(item.value)}</div>
                    <div style={{ fontSize: '11px', color: '#999999', fontWeight: 600 }}>{pct}%</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

      </div>

      {/* 4. БЛОК SMART INSIGHTS (AI Аналитика) */}
      <div className="insight-card">
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'linear-gradient(135deg, #F9A08B 0%, #FCAE91 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#FFFFFF', flexShrink: 0, boxShadow: '0 8px 24px rgba(249,160,139,0.3)' }}>
            {/* Иконка "Магии / AI" */}
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
              <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
              <line x1="12" y1="22.08" x2="12" y2="12"></line>
            </svg>
          </div>
          <div>
            <div style={{ fontSize: '15px', fontWeight: 800, color: '#1A1A1A', marginBottom: '6px' }}>Финансовая сводка и инсайты</div>
            <div style={{ fontSize: '13px', color: '#666666', lineHeight: 1.6 }}>
              Отличный месяц! Ваша <strong>чистая прибыль выросла на 18%</strong>. Мы заметили, что доля оплат абонементов онлайн увеличилась в 2 раза по сравнению с прошлым кварталом. При этом расходы на аренду и зарплату остались в пределах нормы (менее 50% от выручки). Рекомендуем рассмотреть создание резервного фонда.
            </div>
            <div style={{ marginTop: '12px', display: 'flex', gap: '12px' }}>
              <span style={{ display: 'inline-flex', padding: '4px 10px', background: 'rgba(255,255,255,0.6)', border: '1px solid rgba(249,160,139,0.2)', borderRadius: '6px', fontSize: '11px', fontWeight: 700, color: '#F9A08B' }}>Совет: Открыть копилку</span>
              <span style={{ display: 'inline-flex', padding: '4px 10px', background: 'rgba(255,255,255,0.6)', border: '1px solid rgba(249,160,139,0.2)', borderRadius: '6px', fontSize: '11px', fontWeight: 700, color: '#F9A08B' }}>Посмотреть план расходов</span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// ─── TAB: ЦЕЛИ (PREMIUM GOALS & TRACKING) ────────────────────────────────────
function TabGoals({ showToast }: { showToast: (msg: string, t?: ToastType) => void }) {
  // Добавляем к базовым данным режим трекинга для демонстрации
  const [goals, setGoals] = useState(() => GOALS_DATA.map((g, i) => ({
    ...g, 
    trackingMode: (i === 1 || i === 3) ? 'manual' : 'auto' // Для примера некоторые ручные, некоторые авто
  })));
  
  const [confirm, setConfirm] = useState<{ open: boolean; id: number | null }>({ open: false, id: null });

  // Создание
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ title: '', target: '', deadline: '', category: '', priority: 'medium', trackingMode: 'auto' });
  const [isInputFocused, setIsInputFocused] = useState<{ [key: string]: boolean }>({});

  // Ручное пополнение (In-place)
  const [fundGoalId, setFundGoalId] = useState<number | null>(null);
  const [fundAmount, setFundAmount] = useState('');
  const [isFundFocused, setIsFundFocused] = useState(false);

  const handleAdd = () => {
    if (!form.title.trim() || !form.target) { showToast('Заполните название и сумму', 'error'); return; }
    const colors = ['#FCAE91', '#A3C9A8', '#7EB5D6', '#D88C9A'];
    setGoals(prev => [{
      id: Date.now(), title: form.title, target: parseInt(form.target),
      current: 0, deadline: form.deadline || 'Без срока',
      category: form.category || 'Прочее', color: colors[prev.length % colors.length],
      priority: form.priority, trackingMode: form.trackingMode as 'auto' | 'manual'
    }, ...prev]); // Добавляем в начало!
    setForm({ title: '', target: '', deadline: '', category: '', priority: 'medium', trackingMode: 'auto' });
    setAddOpen(false);
    showToast('Цель успешно создана', 'success');
  };

  const confirmDelete = () => {
    setGoals(prev => prev.filter(g => g.id !== confirm.id));
    setConfirm({ open: false, id: null });
    showToast('Цель удалена', 'error');
  };

  const handleFund = (id: number) => {
    const val = parseInt(fundAmount) || 0;
    if (val <= 0) return;
    setGoals(prev => prev.map(g => g.id === id ? { ...g, current: g.current + val } : g));
    setFundGoalId(null);
    setFundAmount('');
    showToast('Средства успешно внесены', 'success');
  };

  const handleNumberInput = (val: string, setter: (v: string) => void) => setter(val.replace(/\D/g, ''));

  const priorityColors: Record<string, string> = { high: '#D88C9A', medium: '#F0C060', low: '#A3C9A8' };
  const priorityLabels: Record<string, string> = { high: 'Высокий приоритет', medium: 'Средний приоритет', low: 'Низкий приоритет' };

  // Статистика
  const activeGoals = goals.filter(g => g.current < g.target).length;
  const doneGoals = goals.filter(g => g.current >= g.target).length;
  const avgProgress = Math.round(goals.reduce((s, g) => s + Math.min(g.current / g.target * 100, 100), 0) / (goals.length || 1));

  return (
    <>
      <style>{`
        @keyframes cardMorph { from { opacity: 0; transform: scale(0.97) translateY(6px); } to { opacity: 1; transform: scale(1) translateY(0); } }
        .morph-container { animation: cardMorph 0.3s cubic-bezier(0.2, 0.8, 0.2, 1) both; }
        .goal-card:hover { transform: translateY(-3px); box-shadow: 0 16px 32px -8px rgba(26,26,26,0.06); }
      `}</style>

      {/* 1. РОСКОШНЫЕ КАРТОЧКИ СВОДКИ */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px', marginBottom: '28px' }}>
        <div style={{ background: '#FFFFFF', borderRadius: '16px', padding: '24px', border: '1px solid rgba(26,26,26,0.12)', boxShadow: '0 12px 32px -4px rgba(26,26,26,0.02)', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: '-20px', right: '-20px', width: '100px', height: '100px', background: 'radial-gradient(circle, rgba(249,160,139,0.15) 0%, transparent 70%)', borderRadius: '50%' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(249,160,139,0.12)', color: '#F9A08B', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Ico.Target /></div>
            <div style={{ fontSize: '12px', color: '#666666', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px' }}>Цели в работе</div>
          </div>
          <div style={{ fontSize: '32px', fontWeight: 800, color: '#1A1A1A', letterSpacing: '-1px' }}>{activeGoals}</div>
        </div>

        <div style={{ background: '#FFFFFF', borderRadius: '16px', padding: '24px', border: '1px solid rgba(26,26,26,0.12)', boxShadow: '0 12px 32px -4px rgba(26,26,26,0.02)', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: '-20px', right: '-20px', width: '100px', height: '100px', background: 'radial-gradient(circle, rgba(163,201,168,0.15) 0%, transparent 70%)', borderRadius: '50%' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(163,201,168,0.12)', color: '#5BAB72', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Ico.Check /></div>
            <div style={{ fontSize: '12px', color: '#666666', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px' }}>Выполнено</div>
          </div>
          <div style={{ fontSize: '32px', fontWeight: 800, color: '#1A1A1A', letterSpacing: '-1px' }}>{doneGoals}</div>
        </div>

        <div style={{ background: '#FFFFFF', borderRadius: '16px', padding: '24px', border: '1px solid rgba(26,26,26,0.12)', boxShadow: '0 12px 32px -4px rgba(26,26,26,0.02)', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: '-20px', right: '-20px', width: '100px', height: '100px', background: 'radial-gradient(circle, rgba(126,181,214,0.15) 0%, transparent 70%)', borderRadius: '50%' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(126,181,214,0.12)', color: '#7EB5D6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Ico.Bar /></div>
            <div style={{ fontSize: '12px', color: '#666666', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px' }}>Общий прогресс</div>
          </div>
          <div style={{ fontSize: '32px', fontWeight: 800, color: '#1A1A1A', letterSpacing: '-1px' }}>{avgProgress}%</div>
        </div>
      </div>

      {/* 2. ПАНЕЛЬ УПРАВЛЕНИЯ (ACTION ISLAND) С КНОПКОЙ */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px', background: '#FFFFFF', padding: '12px 16px', borderRadius: '16px', border: '1px solid rgba(26,26,26,0.12)', boxShadow: '0 8px 32px -8px rgba(26,26,26,0.04)' }}>
        <div style={{ fontSize: '14px', fontWeight: 800, color: '#1A1A1A', paddingLeft: '8px' }}>Отслеживание планов</div>
        {!addOpen && (
          <button onClick={() => setAddOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: '8px', height: '44px', padding: '0 20px', background: '#F9A08B', border: 'none', borderRadius: '10px', color: '#FFFFFF', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: "'Manrope', sans-serif", transition: 'all 0.2s', boxShadow: '0 6px 16px rgba(249, 160, 139, 0.25)' }} onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.filter = 'brightness(1.05)'; }} onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.filter = 'none'; }}>
            <Ico.Plus /> Создать цель
          </button>
        )}
      </div>

      {/* 3. ЗОНА СОЗДАНИЯ ЦЕЛИ (С ВЫБОРОМ ЛОГИКИ ТРЕКИНГА) */}
      {addOpen && (
        <div className="morph-container" style={{ padding: '32px', marginBottom: '24px', background: '#FFFFFF', borderRadius: '16px', border: '1px solid rgba(26,26,26,0.12)', boxShadow: '0 16px 40px -8px rgba(26,26,26,0.06)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
            <div style={{ fontSize: '18px', fontWeight: 800, color: '#1A1A1A', letterSpacing: '-0.3px' }}>Новая финансовая цель</div>
            <button onClick={() => setAddOpen(false)} style={{ background: 'none', border: 'none', color: '#999', cursor: 'pointer', transition: 'color 0.2s' }} onMouseEnter={e => e.currentTarget.style.color='#1A1A1A'} onMouseLeave={e => e.currentTarget.style.color='#999'}><Ico.X /></button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '32px' }}>
            
            {/* Левая колонка: Основные данные */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#666666', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '8px' }}>Название цели</label>
                <input type="text" placeholder="Например: Покупка новых реформеров" value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} onFocus={() => setIsInputFocused({ ...isInputFocused, title: true })} onBlur={() => setIsInputFocused({ ...isInputFocused, title: false })} style={{ width: '100%', padding: '12px 16px', background: '#FDFCFB', border: isInputFocused['title'] ? '1.5px solid #F9A08B' : '1.5px solid rgba(26,26,26,0.08)', borderRadius: '8px', fontSize: '13px', fontWeight: 500, color: '#1A1A1A', outline: 'none', boxShadow: isInputFocused['title'] ? '0 0 0 3px rgba(249, 160, 139, 0.12)' : 'none', transition: 'all 0.2s', boxSizing: 'border-box' }} />
              </div>
              <div style={{ display: 'flex', gap: '16px' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#666666', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '8px' }}>Целевая сумма, ₽</label>
                  <input type="text" placeholder="500000" value={form.target} onChange={e => handleNumberInput(e.target.value, val => setForm(p => ({ ...p, target: val })))} onFocus={() => setIsInputFocused({ ...isInputFocused, target: true })} onBlur={() => setIsInputFocused({ ...isInputFocused, target: false })} style={{ width: '100%', padding: '12px 16px', background: '#FDFCFB', border: isInputFocused['target'] ? '1.5px solid #F9A08B' : '1.5px solid rgba(26,26,26,0.08)', borderRadius: '8px', fontSize: '13px', fontWeight: 700, color: '#1A1A1A', outline: 'none', boxShadow: isInputFocused['target'] ? '0 0 0 3px rgba(249, 160, 139, 0.12)' : 'none', transition: 'all 0.2s', boxSizing: 'border-box' }} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#666666', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '8px' }}>Дедлайн</label>
                  <input type="text" placeholder="Например: 31 дек 2025" value={form.deadline} onChange={e => setForm(p => ({ ...p, deadline: e.target.value }))} onFocus={() => setIsInputFocused({ ...isInputFocused, deadline: true })} onBlur={() => setIsInputFocused({ ...isInputFocused, deadline: false })} style={{ width: '100%', padding: '12px 16px', background: '#FDFCFB', border: isInputFocused['deadline'] ? '1.5px solid #F9A08B' : '1.5px solid rgba(26,26,26,0.08)', borderRadius: '8px', fontSize: '13px', fontWeight: 500, color: '#1A1A1A', outline: 'none', boxShadow: isInputFocused['deadline'] ? '0 0 0 3px rgba(249, 160, 139, 0.12)' : 'none', transition: 'all 0.2s', boxSizing: 'border-box' }} />
                </div>
              </div>
            </div>

            {/* Правая колонка: Логика трекинга */}
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#666666', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '12px' }}>Как отслеживать прогресс?</label>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {/* Опция 1: Автоматически */}
                <div onClick={() => setForm(p => ({ ...p, trackingMode: 'auto' }))} style={{ padding: '16px', borderRadius: '12px', border: form.trackingMode === 'auto' ? '2px solid #F9A08B' : '2px solid rgba(26,26,26,0.06)', background: form.trackingMode === 'auto' ? 'rgba(249,160,139,0.04)' : '#FDFCFB', cursor: 'pointer', transition: 'all 0.2s', display: 'flex', gap: '12px' }}>
                  <div style={{ color: form.trackingMode === 'auto' ? '#F9A08B' : '#999', marginTop: '2px' }}><Ico.Bar /></div>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: '#1A1A1A', marginBottom: '2px' }}>Автоматически (Метрика CRM)</div>
                    <div style={{ fontSize: '11px', color: '#666666', lineHeight: 1.4 }}>Свяжите цель с общей выручкой или прибылью. CRM сама будет двигать прогресс-бар.</div>
                  </div>
                </div>

                {/* Опция 2: Вручную */}
                <div onClick={() => setForm(p => ({ ...p, trackingMode: 'manual' }))} style={{ padding: '16px', borderRadius: '12px', border: form.trackingMode === 'manual' ? '2px solid #F9A08B' : '2px solid rgba(26,26,26,0.06)', background: form.trackingMode === 'manual' ? 'rgba(249,160,139,0.04)' : '#FDFCFB', cursor: 'pointer', transition: 'all 0.2s', display: 'flex', gap: '12px' }}>
                  <div style={{ color: form.trackingMode === 'manual' ? '#F9A08B' : '#999', marginTop: '2px' }}><Ico.Edit /></div>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: '#1A1A1A', marginBottom: '2px' }}>Вручную (Личная копилка)</div>
                    <div style={{ fontSize: '11px', color: '#666666', lineHeight: 1.4 }}>В карточке появится кнопка "Внести средства". Прогресс зависит только от вас.</div>
                  </div>
                </div>
              </div>

              <button onClick={handleAdd} disabled={!form.title.trim() || !form.target} style={{ marginTop: 'auto', padding: '14px', background: form.title.trim() && form.target ? '#F9A08B' : 'rgba(26,26,26,0.04)', border: 'none', borderRadius: '10px', color: form.title.trim() && form.target ? '#FFFFFF' : '#999999', fontSize: '13px', fontWeight: 700, cursor: form.title.trim() && form.target ? 'pointer' : 'not-allowed', transition: 'all 0.2s', boxShadow: form.title.trim() && form.target ? '0 6px 20px rgba(249, 160, 139, 0.25)' : 'none' }}>
                Создать цель
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4. СПИСОК ЦЕЛЕЙ (GRID LAYOUT) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '20px' }}>
        {goals.map(g => {
          const pct = Math.min(Math.round(g.current / g.target * 100), 100);
          const done = pct >= 100;
          const pcol = priorityColors[g.priority] || '#999';
          const isFunding = fundGoalId === g.id;

          return (
            <div key={g.id} className="goal-card" style={{ background: done ? 'rgba(163,201,168,0.03)' : '#FFFFFF', border: done ? '1px solid rgba(163,201,168,0.4)' : '1px solid rgba(26,26,26,0.15)', borderRadius: '16px', padding: '24px', transition: 'all 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)', position: 'relative', overflow: 'hidden' }}>
              
              {/* Шапка карточки */}
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '16px' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                    {done && <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '10px', fontWeight: 800, color: '#4E885B', background: 'rgba(163,201,168,0.2)', padding: '4px 8px', borderRadius: '6px', textTransform: 'uppercase' }}><Ico.Check /> Цель достигнута</span>}
                    {!done && <span style={{ fontSize: '10px', fontWeight: 800, color: pcol, background: pcol + '15', padding: '4px 8px', borderRadius: '6px', textTransform: 'uppercase' }}>{priorityLabels[g.priority]}</span>}
                    {g.trackingMode === 'auto' && !done && <span style={{ fontSize: '10px', fontWeight: 800, color: '#666', background: 'rgba(26,26,26,0.06)', padding: '4px 8px', borderRadius: '6px', textTransform: 'uppercase' }}>Авто-сбор</span>}
                  </div>
                  <div style={{ fontSize: '16px', fontWeight: 800, color: '#1A1A1A', marginBottom: '4px', lineHeight: 1.3 }}>{g.title}</div>
                  <div style={{ fontSize: '12px', color: '#999999', fontWeight: 500 }}>Крайний срок: {g.deadline}</div>
                </div>

                <button onClick={() => setConfirm({ open: true, id: g.id })} style={{ width: '32px', height: '32px', borderRadius: '8px', border: '1px solid transparent', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999', transition: 'all 0.2s' }} onMouseEnter={e => { e.currentTarget.style.background = '#FFF5F5'; e.currentTarget.style.color = '#D88C9A'; }} onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#999'; }} title="Удалить цель">
                  <Ico.Trash />
                </button>
              </div>

              {/* Прогресс-бар (Утолщенный, премиальный) */}
              <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: '8px' }}>
                <div style={{ fontSize: '24px', fontWeight: 800, color: done ? '#5BAB72' : g.color, letterSpacing: '-0.5px' }}>{pct}%</div>
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#1A1A1A' }}>
                  {fmt(g.current)} <span style={{ color: '#999', fontWeight: 500 }}>/ {fmt(g.target)}</span>
                </div>
              </div>
              <div style={{ height: '12px', background: 'rgba(26,26,26,0.04)', borderRadius: '12px', overflow: 'hidden', marginBottom: '20px', border: '1px solid rgba(26,26,26,0.02)' }}>
                <div style={{ width: `${pct}%`, height: '100%', background: done ? '#5BAB72' : g.color, borderRadius: '12px', transition: 'width 1s cubic-bezier(0.34,1.2,0.64,1)', boxShadow: 'inset 0 -2px 4px rgba(0,0,0,0.1)' }} />
              </div>

              {/* Подвал карточки: Экшены */}
              {!done && (
                <div style={{ borderTop: '1px dashed rgba(26,26,26,0.08)', paddingTop: '16px' }}>
                  {g.trackingMode === 'manual' ? (
                    // РЕЖИМ РУЧНОГО ТРЕКИНГА (IN-PLACE MORPHING)
                    isFunding ? (
                      <div className="morph-container" style={{ display: 'flex', gap: '8px' }}>
                        <input 
                          type="text" value={fundAmount} placeholder="Сумма, ₽" autoFocus
                          onChange={e => handleNumberInput(e.target.value, setFundAmount)}
                          onFocus={() => setIsFundFocused(true)} onBlur={() => setIsFundFocused(false)}
                          style={{ flex: 1, padding: '10px 12px', background: '#FDFCFB', border: isFundFocused ? `1.5px solid ${g.color}` : '1.5px solid rgba(26,26,26,0.08)', borderRadius: '8px', fontSize: '13px', fontWeight: 700, color: '#1A1A1A', outline: 'none', transition: 'all 0.2s', boxSizing: 'border-box' }}
                        />
                        <button onClick={() => handleFund(g.id)} disabled={!fundAmount} style={{ padding: '0 16px', background: fundAmount ? g.color : 'rgba(26,26,26,0.04)', border: 'none', borderRadius: '8px', color: '#FFF', fontSize: '12px', fontWeight: 700, cursor: fundAmount ? 'pointer' : 'not-allowed', transition: 'all 0.2s' }}>Внести</button>
                        <button onClick={() => setFundGoalId(null)} style={{ width: '36px', background: 'transparent', border: '1px solid rgba(26,26,26,0.08)', borderRadius: '8px', color: '#666', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Ico.X /></button>
                      </div>
                    ) : (
                      <button onClick={() => setFundGoalId(g.id)} style={{ width: '100%', padding: '12px', background: g.color + '15', border: 'none', borderRadius: '10px', color: g.color, fontSize: '13px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', transition: 'all 0.2s' }} onMouseEnter={e => e.currentTarget.style.background = g.color + '25' } onMouseLeave={e => e.currentTarget.style.background = g.color + '15' }>
                        <Ico.Plus /> Внести средства
                      </button>
                    )
                  ) : (
                    // РЕЖИМ АВТОМАТИЧЕСКОГО ТРЕКИНГА
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#999', fontSize: '11px', fontWeight: 600 }}>
                      <Ico.Bar /> Значение обновляется автоматически из модуля Отчетов
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <ConfirmModal open={confirm.open} title="Удалить цель?" text="Прогресс по этой цели будет утерян. Действие нельзя отменить." onConfirm={confirmDelete} onCancel={() => setConfirm({ open: false, id: null })} danger />
    </>
  );
}

// ─── TAB ИКОНКИ ───────────────────────────────────────────────────────────────
const TAB_ICONS: Record<Tab, React.ReactNode> = {
  'Счета и кассы': <Ico.Dollar />,
  'Операции': <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>,
  'Контрагенты': <Ico.Building />,
  'Документы': <Ico.Doc />,
  'Онлайн-платежи': <Ico.World />,
  'Методы оплаты': <Ico.Card />,
  'Отчёты': <Ico.Bar />,
  'Цели': <Ico.Target />,
};

// ─── ГЛАВНЫЙ КОМПОНЕНТ ────────────────────────────────────────────────────────
export default function Finances() {
  const [activeTab, setActiveTab] = useState<Tab>('Счета и кассы');
  const [operationsSearch, setOperationsSearch] = useState(''); // Общий стейт для сквозного фильтра
  const { toast, show: showToast } = useToast();

  const renderTab = () => {
    const props = { showToast };
    switch (activeTab) {
      case 'Счета и кассы': 
        return <TabAccounts 
          showToast={showToast} 
          onNavigateToOperations={(name) => {
            setOperationsSearch(name); // Записываем имя счёта
            setActiveTab('Операции'); // Переключаем вкладку
          }} 
        />;
      case 'Операции': 
        return <TabOperations showToast={showToast} initialSearch={operationsSearch} />;
      case 'Контрагенты': return <TabCounterparties {...props} />;
      case 'Документы': return <TabDocuments {...props} />;
      case 'Онлайн-платежи': return <TabOnlinePayments {...props} />;
      case 'Методы оплаты': return <TabPaymentMethods {...props} />;
      case 'Отчёты': return <TabReports {...props} />;
      case 'Цели': return <TabGoals {...props} />;
      default: return null;
    }
  };

  return (
    <>
      {/* Вкладки */}
      <div className="finance-tabs-big">
        {FINANCE_TABS.map(t => (
          <div
            key={t}
            className={`ftab ${activeTab === t ? 'active' : ''}`}
            onClick={() => {
              // Если пользователь кликает на вкладку Операции вручную — сбрасываем старый фильтр счетов
              if (t === 'Операции' && activeTab !== 'Операции') {
                setOperationsSearch('');
              }
              setActiveTab(t);
            }}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
          >
            <span style={{ opacity: activeTab === t ? 1 : 0.5, transition: 'opacity 0.18s' }}>{TAB_ICONS[t]}</span>
            {t}
          </div>
        ))}
      </div>

      {/* Контент с анимацией смены таба */}
      <div key={activeTab} style={{ animation: 'fadeSlide 0.22s ease both' }}>
        {renderTab()}
      </div>

      {/* Toast */}
      <Toast msg={toast.msg} type={toast.type} visible={toast.visible} />
    </>
  );
}