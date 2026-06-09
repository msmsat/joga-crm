import { useState } from 'react';

// ─── SVG ИКОНКИ ─────────────────────────────────────────────────────────────
const Icon = {
  Telegram: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21.5 2.5L2 10l7 2.5M21.5 2.5L14 22l-5-9.5M21.5 2.5L9 12.5" />
    </svg>
  ),
  Instagram: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="20" height="20" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="0.5" fill="currentColor" />
    </svg>
  ),
  WhatsApp: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  ),
  Email: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
      <polyline points="22,6 12,13 2,6" />
    </svg>
  ),
  SMS: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  ),
  Push: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  ),
  Client: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  ),
  Trainer: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.85" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  Admin: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  ),
  Owner: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  ),
  Check: () => (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),
  Bell: () => (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  ),
  Calendar: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  ),
  Money: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="1" x2="12" y2="23" />
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  ),
  Star: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  ),
  Gift: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 12 20 22 4 22 4 12" />
      <rect x="2" y="7" width="20" height="5" />
      <line x1="12" y1="22" x2="12" y2="7" />
      <path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z" />
      <path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" />
    </svg>
  ),
  AlertTriangle: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  ),
  TrendUp: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
      <polyline points="17 6 23 6 23 12" />
    </svg>
  ),
  UserX: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="8.5" cy="7" r="4" />
      <line x1="18" y1="8" x2="23" y2="13" />
      <line x1="23" y1="8" x2="18" y2="13" />
    </svg>
  ),
  Clock: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  ),
  CreditCard: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="4" width="22" height="16" rx="2" />
      <line x1="1" y1="10" x2="23" y2="10" />
    </svg>
  ),
  Refresh: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 4 23 10 17 10" />
      <polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
  ),
  FileText: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
    </svg>
  ),
  Users: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.85" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  BarChart: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  ),
  Lock: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  ),
  Package: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <line x1="16.5" y1="9.4" x2="7.5" y2="4.21" />
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
      <line x1="12" y1="22.08" x2="12" y2="12" />
    </svg>
  ),
};

// ─── ТИПЫ КАНАЛОВ ─────────────────────────────────────────────────────────────
type ChannelKey = 'telegram' | 'instagram' | 'whatsapp' | 'email' | 'sms' | 'push';

const CHANNELS: { key: ChannelKey; label: string; sub: string; IconComp: () => React.JSX.Element; color: string }[] = [
  { key: 'telegram',  label: 'Telegram',   sub: '@VeloraNotifyBot',       IconComp: Icon.Telegram,  color: '#4A80C4' },
  { key: 'instagram', label: 'Instagram',  sub: 'Direct сообщения',       IconComp: Icon.Instagram, color: '#E1306C' },
  { key: 'whatsapp',  label: 'WhatsApp',   sub: '+7 (999) 123-45-67',     IconComp: Icon.WhatsApp,  color: '#5BAB72' },
  { key: 'email',     label: 'Email',      sub: 'admin@velora.studio',     IconComp: Icon.Email,     color: '#F9A08B' },
  { key: 'sms',       label: 'SMS',        sub: 'через МТС Коннект',       IconComp: Icon.SMS,       color: '#9B8EC4' },
  { key: 'push',      label: 'Push',       sub: 'Мобильное приложение',    IconComp: Icon.Push,      color: '#4AAFBC' },
];

// ─── РОЛИ ─────────────────────────────────────────────────────────────────────
type Role = 'client' | 'trainer' | 'admin' | 'owner';

const ROLES: { key: Role; label: string; IconComp: () => React.JSX.Element; color: string; bg: string }[] = [
  { key: 'client',  label: 'Клиент',         IconComp: Icon.Client,  color: '#F9A08B', bg: 'rgba(249,160,139,0.1)' },
  { key: 'trainer', label: 'Тренер',         IconComp: Icon.Trainer, color: '#4A80C4', bg: 'rgba(74,128,196,0.1)' },
  { key: 'admin',   label: 'Администратор',  IconComp: Icon.Admin,   color: '#5BAB72', bg: 'rgba(91,171,114,0.1)' },
  { key: 'owner',   label: 'Владелец',       IconComp: Icon.Owner,   color: '#9B8EC4', bg: 'rgba(155,142,196,0.1)' },
];

// ─── УВЕДОМЛЕНИЯ ПО РОЛЯМ ─────────────────────────────────────────────────────
type NotifEvent = {
  id: string;
  icon: () => React.JSX.Element;
  title: string;
  desc: string;
  color: string;
};

const NOTIF_EVENTS: Record<Role, NotifEvent[]> = {
  client: [
    { id: 'c1',  icon: Icon.Calendar,      title: 'Подтверждение записи',         desc: 'При успешной записи на занятие',          color: '#F9A08B' },
    { id: 'c2',  icon: Icon.AlertTriangle, title: 'Напоминание о занятии',         desc: 'За 24 часа и за 2 часа',                  color: '#f0c040' },
    { id: 'c3',  icon: Icon.UserX,         title: 'Отмена занятия',               desc: 'Если тренер или студия отменяет',          color: '#D88C9A' },
    { id: 'c4',  icon: Icon.Money,         title: 'Успешная оплата',              desc: 'Квитанция после списания средств',          color: '#5BAB72' },
    { id: 'c5',  icon: Icon.Package,       title: 'Осталось мало занятий',        desc: 'Когда осталось 1–2 визита в абонементе',   color: '#f0c040' },
    { id: 'c6',  icon: Icon.AlertTriangle, title: 'Абонемент истекает',           desc: 'За 3 дня до окончания срока',              color: '#e08060' },
    { id: 'c7',  icon: Icon.Gift,          title: 'День рождения',                desc: 'Поздравление и специальный оффер',          color: '#F9A08B' },
    { id: 'c8',  icon: Icon.Star,          title: 'Запрос отзыва',                desc: 'После посещения занятия',                  color: '#9B8EC4' },
    { id: 'c9',  icon: Icon.Refresh,       title: 'Возврат средств',              desc: 'При отмене и оформлении возврата',          color: '#4A80C4' },
    { id: 'c10', icon: Icon.CreditCard,    title: 'Задолженность по оплате',      desc: 'Напоминание об неоплаченном занятии',       color: '#D88C9A' },
  ],
  trainer: [
    { id: 't1',  icon: Icon.Calendar,      title: 'Новая запись к тренеру',       desc: 'Клиент записался на персональное занятие', color: '#F9A08B' },
    { id: 't2',  icon: Icon.UserX,         title: 'Отмена записи клиентом',       desc: 'Клиент отменил занятие менее чем за 2 ч',  color: '#D88C9A' },
    { id: 't3',  icon: Icon.AlertTriangle, title: 'Напоминание о занятии',        desc: 'За 1 час до начала',                       color: '#f0c040' },
    { id: 't4',  icon: Icon.Users,         title: 'Список участников группы',     desc: 'За 30 мин. до группового занятия',         color: '#4A80C4' },
    { id: 't5',  icon: Icon.Clock,         title: 'Изменение в расписании',       desc: 'Администратор изменил слот или локацию',   color: '#9B8EC4' },
    { id: 't6',  icon: Icon.Money,         title: 'Начисление зарплаты',          desc: 'Еженедельный расчёт выплат',               color: '#5BAB72' },
    { id: 't7',  icon: Icon.FileText,      title: 'Новый отзыв о тренере',        desc: 'Клиент оставил оценку после занятия',      color: '#F9A08B' },
    { id: 't8',  icon: Icon.Gift,          title: 'День рождения клиента',        desc: 'Напоминание, чтобы поздравить лично',      color: '#e08060' },
  ],
  admin: [
    { id: 'a1',  icon: Icon.Calendar,      title: 'Новая онлайн-запись',          desc: 'Клиент записался через сайт или виджет',   color: '#F9A08B' },
    { id: 'a2',  icon: Icon.UserX,         title: 'Отмена в последний момент',    desc: 'Менее чем за 1 час до занятия',            color: '#D88C9A' },
    { id: 'a3',  icon: Icon.Users,         title: 'Новый клиент в системе',       desc: 'Регистрация нового пользователя',          color: '#5BAB72' },
    { id: 'a4',  icon: Icon.Money,         title: 'Оплата получена',              desc: 'Любое успешное списание средств',           color: '#5BAB72' },
    { id: 'a5',  icon: Icon.AlertTriangle, title: 'Задолженность клиента',        desc: 'Прошло 3+ дней без оплаты',                color: '#f0c040' },
    { id: 'a6',  icon: Icon.Package,       title: 'Абонементы на исходе',         desc: 'Группа клиентов с ≤1 занятием',            color: '#e08060' },
    { id: 'a7',  icon: Icon.Clock,         title: 'Конфликт расписания',          desc: 'Наложение занятий в журнале',              color: '#D88C9A' },
    { id: 'a8',  icon: Icon.FileText,      title: 'Отчёт за день',               desc: 'Итоговая сводка в конце рабочего дня',     color: '#4A80C4' },
    { id: 'a9',  icon: Icon.Lock,          title: 'Попытка входа',               desc: 'Авторизация с нового устройства',           color: '#9B8EC4' },
    { id: 'a10', icon: Icon.Refresh,       title: 'Возврат средств',              desc: 'Администратор оформил возврат',            color: '#4A80C4' },
  ],
  owner: [
    { id: 'o1',  icon: Icon.TrendUp,       title: 'Ежедневная сводка',            desc: 'Выручка, записи, посещаемость за день',    color: '#F9A08B' },
    { id: 'o2',  icon: Icon.BarChart,      title: 'Еженедельный отчёт',          desc: 'KPI: рост клиентов, LTV, конверсия',       color: '#4A80C4' },
    { id: 'o3',  icon: Icon.Money,         title: 'Крупный платёж',              desc: 'Списание свыше заданного порога',           color: '#5BAB72' },
    { id: 'o4',  icon: Icon.AlertTriangle, title: 'Аномалия в данных',           desc: 'Резкое падение записей или выручки',        color: '#D88C9A' },
    { id: 'o5',  icon: Icon.Users,         title: 'Новый сотрудник добавлен',    desc: 'Администратор создал новый аккаунт',        color: '#9B8EC4' },
    { id: 'o6',  icon: Icon.CreditCard,    title: 'Продление тарифа',            desc: 'Напоминание об оплате подписки Velora',     color: '#f0c040' },
    { id: 'o7',  icon: Icon.Lock,          title: 'Изменение прав доступа',      desc: 'Права сотрудника были изменены',           color: '#e08060' },
    { id: 'o8',  icon: Icon.Star,          title: 'Достигнут KPI',               desc: 'Выполнен целевой показатель месяца',        color: '#5BAB72' },
    { id: 'o9',  icon: Icon.FileText,      title: 'Экспорт данных',              desc: 'Кто-то выгрузил базу клиентов',             color: '#D88C9A' },
  ],
};

// ─── ТИП ДЛЯ СОСТОЯНИЙ ПЕРЕКЛЮЧАТЕЛЕЙ ────────────────────────────────────────
type Toggles = Record<string, Record<ChannelKey, boolean>>;

function buildInitialToggles(): Toggles {
  const result: Toggles = {};
  const INITIAL: Record<Role, Partial<Record<ChannelKey, string[]>>> = {
    client:  { telegram: ['c1','c2','c3','c4','c7'], whatsapp: ['c1','c2','c5'], email: ['c4','c9'] },
    trainer: { telegram: ['t1','t2','t3','t4','t5'], email: ['t6','t7'] },
    admin:   { telegram: ['a1','a2','a3','a4','a5','a7'], email: ['a5','a6','a8'], push: ['a1','a3'] },
    owner:   { telegram: ['o1','o2','o3','o4'], email: ['o1','o2','o6'], push: ['o4'] },
  };
  (Object.entries(NOTIF_EVENTS) as [Role, NotifEvent[]][]).forEach(([role, events]) => {
    events.forEach(ev => {
      result[ev.id] = {} as Record<ChannelKey, boolean>;
      CHANNELS.forEach(ch => {
        const ids = (INITIAL[role] ?? {})[ch.key] ?? [];
        result[ev.id][ch.key] = ids.includes(ev.id);
      });
    });
  });
  return result;
}

// ─── TOGGLE SWITCH ────────────────────────────────────────────────────────────
function ToggleSwitch({ on, onChange }: { on: boolean; onChange: () => void }) {
  return (
    <button
      onClick={onChange}
      style={{
        position: 'relative',
        width: '40px',
        height: '22px',
        borderRadius: '11px',
        border: 'none',
        cursor: 'pointer',
        background: on ? 'var(--peach)' : '#E5E3DF',
        transition: 'background 0.25s cubic-bezier(0.4,0,0.2,1)',
        flexShrink: 0,
        padding: 0,
      }}
      aria-checked={on}
      role="switch"
    >
      <span style={{
        position: 'absolute',
        top: '3px',
        left: on ? '21px' : '3px',
        width: '16px',
        height: '16px',
        borderRadius: '50%',
        background: '#fff',
        transition: 'left 0.25s cubic-bezier(0.4,0,0.2,1)',
        boxShadow: '0 1px 4px rgba(0,0,0,0.18)',
      }} />
    </button>
  );
}

// ─── MINI CHECKBOX (С КОНТЕКСТНЫМ ЦВЕТОМ И СВЕЧЕНИЕМ) ─────────────────────────
function MiniCheck({ on, onChange, color }: { on: boolean; onChange: () => void; color?: string }) {
  const c = color || 'var(--peach)';
  return (
    <button
      onClick={onChange}
      style={{
        width: '24px',
        height: '24px',
        borderRadius: '8px',
        border: `1.5px solid ${on ? c : 'rgba(26,26,26,0.15)'}`,
        background: on ? c : '#FDFCFB',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        transition: 'all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1)',
        transform: on ? 'scale(1.05)' : 'scale(1)',
        boxShadow: on ? `0 4px 12px ${c}40` : 'inset 0 2px 4px rgba(0,0,0,0.02)',
        flexShrink: 0,
        padding: 0,
      }}
    >
      {on && (
        <span style={{ color: '#fff', lineHeight: 1 }}>
          <Icon.Check />
        </span>
      )}
    </button>
  );
}

// ─── ИЛЛЮСТРАЦИЯ ──────────────────────────────────────────────────────────────
function NotifIllustration() {
  return (
    <div style={{
      position: 'relative',
      height: '160px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
      borderRadius: '16px',
      background: 'linear-gradient(135deg, rgba(252,174,145,0.12) 0%, rgba(74,128,196,0.08) 100%)',
      marginBottom: '24px',
    }}>
      {/* Декоративные кольца */}
      <div style={{
        position: 'absolute',
        width: '180px', height: '180px',
        borderRadius: '50%',
        border: '1.5px solid rgba(249,160,139,0.18)',
        animation: 'notifPulse 3s ease-in-out infinite',
      }} />
      <div style={{
        position: 'absolute',
        width: '130px', height: '130px',
        borderRadius: '50%',
        border: '1.5px solid rgba(249,160,139,0.25)',
        animation: 'notifPulse 3s ease-in-out infinite 0.5s',
      }} />
      <div style={{
        position: 'absolute',
        width: '80px', height: '80px',
        borderRadius: '50%',
        border: '1.5px solid rgba(249,160,139,0.35)',
        animation: 'notifPulse 3s ease-in-out infinite 1s',
      }} />

      {/* Центральная иконка */}
      <div style={{
        width: '52px', height: '52px',
        borderRadius: '16px',
        background: 'rgba(249,160,139,0.15)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#F9A08B',
        backdropFilter: 'blur(8px)',
        border: '1px solid rgba(249,160,139,0.3)',
        zIndex: 2,
      }}>
        <Icon.Bell />
      </div>

      {/* Плавающие чипы */}
      {[
        { label: 'Telegram', top: '18px', right: '40px', color: '#4A80C4', delay: '0s' },
        { label: 'WhatsApp', bottom: '18px', right: '30px', color: '#5BAB72', delay: '0.4s' },
        { label: 'Email', top: '28px', left: '28px', color: '#F9A08B', delay: '0.8s' },
        { label: 'SMS', bottom: '28px', left: '40px', color: '#9B8EC4', delay: '1.2s' },
      ].map(chip => (
        <div key={chip.label} style={{
          position: 'absolute',
          top: chip.top, right: (chip as any).right, bottom: chip.bottom, left: (chip as any).left,
          background: '#fff',
          border: `1px solid ${chip.color}30`,
          borderRadius: '20px',
          padding: '4px 10px',
          fontSize: '11px',
          fontWeight: 600,
          color: chip.color,
          fontFamily: 'var(--font)',
          animation: `notifFloat 3s ease-in-out infinite ${chip.delay}`,
          boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
          zIndex: 3,
        }}>
          {chip.label}
        </div>
      ))}

      <style>{`
        @keyframes notifPulse {
          0%, 100% { opacity: 0.4; transform: scale(1); }
          50% { opacity: 0.7; transform: scale(1.04); }
        }
        @keyframes notifFloat {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-4px); }
        }
      `}</style>
    </div>
  );
}

// ─── ОСНОВНОЙ КОМПОНЕНТ ───────────────────────────────────────────────────────
export default function Notifications() {
  const [channels, setChannels] = useState<Record<ChannelKey, boolean>>({
    telegram: true, instagram: false, whatsapp: true, email: true, sms: false, push: false,
  });
  const [activeRole, setActiveRole] = useState<Role>('client');
  const [animDir, setAnimDir] = useState<'left' | 'right'>('right');
  const [animating, setAnimating] = useState(false);
  const [toggles, setToggles] = useState<Toggles>(buildInitialToggles);

  const toggleChannel = (key: ChannelKey) =>
    setChannels(prev => ({ ...prev, [key]: !prev[key] }));

  const toggleCheck = (evId: string, chKey: ChannelKey) =>
    setToggles(prev => ({
      ...prev,
      [evId]: { ...prev[evId], [chKey]: !prev[evId][chKey] },
    }));

  const switchRole = (role: Role) => {
    if (role === activeRole || animating) return;
    const idx = ROLES.findIndex(r => r.key === role);
    const curIdx = ROLES.findIndex(r => r.key === activeRole);
    setAnimDir(idx > curIdx ? 'right' : 'left');
    setAnimating(true);
    setTimeout(() => {
      setActiveRole(role);
      setAnimating(false);
    }, 200);
  };

  const currentRole = ROLES.find(r => r.key === activeRole)!;
  const events = NOTIF_EVENTS[activeRole];
  const activeChannels = CHANNELS.filter(c => channels[c.key]);

  const countActive = (role: Role) =>
    NOTIF_EVENTS[role].reduce((sum, ev) => {
      const hasActive = CHANNELS.some(ch => channels[ch.key] && toggles[ev.id]?.[ch.key]);
      return sum + (hasActive ? 1 : 0);
    }, 0);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: '24px', alignItems: 'start' }}>
      
      {/* CSS для премиальных hover-эффектов матрицы */}
      <style>{`
        .notif-row { transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1); border-left: 3px solid transparent; }
        .notif-row:hover { background: rgba(26,26,26,0.02) !important; transform: translateX(2px); border-left-color: var(--peach); }
      `}</style>

      {/* ─── ЛЕВАЯ КОЛОНКА ─── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        <NotifIllustration />
        <div className="card" style={{ padding: '20px' }}>
          <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '0.08em', color: '#999999', textTransform: 'uppercase', marginBottom: '16px' }}>
            Каналы доставки
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {CHANNELS.map(ch => (
              <div
                key={ch.key}
                style={{
                  display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px',
                  borderRadius: '12px', background: channels[ch.key] ? `${ch.color}0D` : 'transparent',
                  transition: 'background 0.2s', cursor: 'default',
                }}
              >
                <div style={{
                  width: '32px', height: '32px', borderRadius: '8px',
                  background: channels[ch.key] ? `${ch.color}18` : 'rgba(26,26,26,0.04)',
                  color: channels[ch.key] ? ch.color : '#999999',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'all 0.2s', flexShrink: 0,
                }}>
                  <ch.IconComp />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: channels[ch.key] ? '#1A1A1A' : '#999999' }}>
                    {ch.label}
                  </div>
                  <div style={{ fontSize: '11px', color: '#999999', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {ch.sub}
                  </div>
                </div>
                <ToggleSwitch on={channels[ch.key]} onChange={() => toggleChannel(ch.key)} />
              </div>
            ))}
          </div>
        </div>

        <div style={{ padding: '16px', borderRadius: '12px', background: 'rgba(249,160,139,0.08)', border: '1px solid rgba(249,160,139,0.2)', fontSize: '12px', color: '#666666', lineHeight: 1.6 }}>
          <span style={{ color: '#F9A08B', fontWeight: 800 }}>Совет:</span> Настройте отдельно для каждой роли, что и куда отправлять — Velora учтёт это автоматически.
        </div>
      </div>

      {/* ─── ПРАВАЯ КОЛОНКА ─── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

        {/* Табы ролей (ОТЦЕНТРОВАННЫЕ ПО ГОРИЗОНТАЛИ) */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
          {ROLES.map(role => {
            const cnt = countActive(role.key);
            const isActive = activeRole === role.key;
            return (
              <button
                key={role.key}
                onClick={() => switchRole(role.key)}
                style={{
                  padding: '14px 16px', borderRadius: '16px',
                  border: isActive ? `1.5px solid ${role.color}50` : '1.5px solid rgba(26,26,26,0.08)',
                  background: isActive ? role.bg : '#FFFFFF', cursor: 'pointer',
                  display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '12px',
                  transition: 'all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1)',
                  transform: isActive ? 'translateY(-2px)' : 'translateY(0)',
                  boxShadow: isActive ? `0 12px 24px -8px ${role.color}30` : '0 2px 8px rgba(0,0,0,0.02)',
                  fontFamily: "'Manrope', sans-serif", textAlign: 'left',
                }}
              >
                <div style={{
                  width: '38px', height: '38px', borderRadius: '10px',
                  background: isActive ? `${role.color}22` : 'rgba(26,26,26,0.04)',
                  color: isActive ? role.color : '#999999',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'all 0.25s', flexShrink: 0
                }}>
                  <role.IconComp />
                </div>
                <div style={{ flex: 1, overflow: 'hidden' }}>
                  <div style={{ fontSize: '14px', fontWeight: 800, color: isActive ? '#1A1A1A' : '#666666', lineHeight: 1.2, whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                    {role.label}
                  </div>
                  <div style={{ fontSize: '11px', color: isActive ? role.color : '#999999', marginTop: '3px', fontWeight: 600 }}>
                    {cnt} активных
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Матрица уведомлений */}
        <div className="card" style={{ padding: '0', overflow: 'hidden', border: '1px solid rgba(26,26,26,0.08)' }}>
          <div style={{ padding: '24px', borderBottom: '1px solid rgba(26,26,26,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: currentRole.bg, color: currentRole.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <currentRole.IconComp />
              </div>
              <div>
                <div style={{ fontSize: '16px', fontWeight: 800, color: '#1A1A1A' }}>
                  Сценарии для: {currentRole.label}
                </div>
                <div style={{ fontSize: '12px', color: '#666666', marginTop: '2px' }}>
                  Настройте каналы для {events.length} системных триггеров
                </div>
              </div>
            </div>
          </div>

          <div style={{
            opacity: animating ? 0 : 1,
            transform: animating ? `translateX(${animDir === 'right' ? '16px' : '-16px'})` : 'translateX(0)',
            transition: animating ? 'none' : 'opacity 0.22s ease, transform 0.22s cubic-bezier(0.4,0,0.2,1)',
          }}>
            
            {/* Заголовок столбцов (С ИКОНКАМИ ВМЕСТО ТЕКСТА) */}
            {activeChannels.length > 0 && (
              <div style={{
                display: 'grid', gridTemplateColumns: `1fr repeat(${activeChannels.length}, 44px)`,
                gap: '12px', padding: '16px 24px 8px', alignItems: 'center',
              }}>
                <div style={{ fontSize: '11px', fontWeight: 800, color: '#999999', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
                  Событие системы
                </div>
                {activeChannels.map(ch => (
                  <div key={ch.key} title={ch.label} style={{ display: 'flex', justifyContent: 'center' }}>
                    <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: `${ch.color}15`, color: ch.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <ch.IconComp />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {activeChannels.length === 0 && (
              <div style={{ padding: '60px 24px', textAlign: 'center', background: '#FAFAFA' }}>
                <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'rgba(26,26,26,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', color: '#999999' }}><Icon.AlertTriangle /></div>
                <div style={{ fontSize: '14px', fontWeight: 800, color: '#1A1A1A', marginBottom: '4px' }}>Нет активных каналов</div>
                <div style={{ fontSize: '12px', color: '#666666' }}>Включите хотя бы один канал доставки в панели слева</div>
              </div>
            )}

            {/* Строки с hover-эффектом и цветными чекбоксами */}
            {activeChannels.length > 0 && events.map((ev, i) => (
              <div key={ev.id} className="notif-row" style={{
                display: 'grid', gridTemplateColumns: `1fr repeat(${activeChannels.length}, 44px)`,
                gap: '12px', padding: '14px 24px', alignItems: 'center',
                background: i % 2 === 1 ? 'rgba(26,26,26,0.01)' : 'transparent',
                borderBottom: i < events.length - 1 ? '1px solid rgba(26,26,26,0.04)' : 'none',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: `${ev.color}15`, color: ev.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <ev.icon />
                  </div>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: '#1A1A1A', marginBottom: '2px' }}>
                      {ev.title}
                    </div>
                    <div style={{ fontSize: '11px', color: '#666666' }}>
                      {ev.desc}
                    </div>
                  </div>
                </div>
                {activeChannels.map(ch => (
                  <div key={ch.key} style={{ display: 'flex', justifyContent: 'center' }}>
                    {/* ПЕРЕДАЕМ УНИКАЛЬНЫЙ ЦВЕТ КАНАЛА В ЧЕКБОКС */}
                    <MiniCheck
                      on={toggles[ev.id]?.[ch.key] ?? false}
                      onChange={() => toggleCheck(ev.id, ch.key)}
                      color={ch.color}
                    />
                  </div>
                ))}
              </div>
            ))}
          </div>

          {/* Итог */}
          {activeChannels.length > 0 && (
            <div style={{ padding: '16px 24px', borderTop: '1px solid rgba(26,26,26,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#FAFAFA' }}>
              <span style={{ fontSize: '12px', color: '#666666', fontWeight: 600 }}>
                Активных триггеров: <strong style={{ color: '#1A1A1A', fontWeight: 800 }}>
                  {events.reduce((s, ev) => s + activeChannels.filter(ch => toggles[ev.id]?.[ch.key]).length, 0)}
                </strong> из {events.length * activeChannels.length}
              </span>
              <button
                onClick={() => {
                  const allOn = events.every(ev => activeChannels.every(ch => toggles[ev.id]?.[ch.key]));
                  setToggles(prev => {
                    const next = { ...prev };
                    events.forEach(ev => {
                      next[ev.id] = { ...prev[ev.id] };
                      activeChannels.forEach(ch => { next[ev.id][ch.key] = !allOn; });
                    });
                    return next;
                  });
                }}
                style={{ fontSize: '12px', fontWeight: 800, color: '#1A1A1A', background: '#FFFFFF', border: '1px solid rgba(26,26,26,0.1)', cursor: 'pointer', padding: '8px 14px', borderRadius: '8px', fontFamily: "'Manrope', sans-serif", transition: 'all 0.2s', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = '#1A1A1A'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(26,26,26,0.1)'; e.currentTarget.style.transform = 'translateY(0)'; }}
              >
                {events.every(ev => activeChannels.every(ch => toggles[ev.id]?.[ch.key])) ? 'Снять все галочки' : 'Активировать всё'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}