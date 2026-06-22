import type { JSX } from 'react';
import type { ChannelKey, Role, NotifEvent } from './types';
import { Icon } from './components/ui/NotificationIcons';

export const CHANNELS: { key: ChannelKey; label: string; sub: string; IconComp: () => JSX.Element; color: string }[] = [
  { key: 'telegram',  label: 'Telegram',  sub: '@VeloraNotifyBot',       IconComp: Icon.Telegram,  color: '#4A80C4' },
  { key: 'instagram', label: 'Instagram', sub: 'Direct сообщения',       IconComp: Icon.Instagram, color: '#E1306C' },
  { key: 'whatsapp',  label: 'WhatsApp',  sub: '+7 (999) 123-45-67',     IconComp: Icon.WhatsApp,  color: '#5BAB72' },
  { key: 'email',     label: 'Email',     sub: 'admin@velora.studio',     IconComp: Icon.Email,     color: '#F9A08B' },
  { key: 'sms',       label: 'SMS',       sub: 'через МТС Коннект',       IconComp: Icon.SMS,       color: '#9B8EC4' },
  { key: 'push',      label: 'Push',      sub: 'Мобильное приложение',    IconComp: Icon.Push,      color: '#4AAFBC' },
];

export const ROLES: { key: Role; label: string; IconComp: () => JSX.Element; color: string; bg: string }[] = [
  { key: 'client',  label: 'Клиент',        IconComp: Icon.Client,  color: '#F9A08B', bg: 'rgba(249,160,139,0.1)' },
  { key: 'trainer', label: 'Тренер',        IconComp: Icon.Trainer, color: '#4A80C4', bg: 'rgba(74,128,196,0.1)'  },
  { key: 'admin',   label: 'Администратор', IconComp: Icon.Admin,   color: '#5BAB72', bg: 'rgba(91,171,114,0.1)'  },
  { key: 'owner',   label: 'Владелец',      IconComp: Icon.Owner,   color: '#9B8EC4', bg: 'rgba(155,142,196,0.1)' },
];

export const NOTIF_EVENTS: Record<Role, NotifEvent[]> = {
  client: [
    { id: 'c1',  icon: Icon.Calendar,      title: 'Подтверждение записи',    desc: 'При успешной записи на занятие',        color: '#F9A08B' },
    { id: 'c2',  icon: Icon.AlertTriangle, title: 'Напоминание о занятии',   desc: 'За 24 часа и за 2 часа',               color: '#f0c040' },
    { id: 'c3',  icon: Icon.UserX,         title: 'Отмена занятия',          desc: 'Если тренер или студия отменяет',       color: '#D88C9A' },
    { id: 'c4',  icon: Icon.Money,         title: 'Успешная оплата',         desc: 'Квитанция после списания средств',       color: '#5BAB72' },
    { id: 'c5',  icon: Icon.Package,       title: 'Осталось мало занятий',   desc: 'Когда осталось 1–2 визита в абонементе', color: '#f0c040' },
    { id: 'c6',  icon: Icon.AlertTriangle, title: 'Абонемент истекает',      desc: 'За 3 дня до окончания срока',           color: '#e08060' },
    { id: 'c7',  icon: Icon.Gift,          title: 'День рождения',           desc: 'Поздравление и специальный оффер',       color: '#F9A08B' },
    { id: 'c8',  icon: Icon.Star,          title: 'Запрос отзыва',           desc: 'После посещения занятия',               color: '#9B8EC4' },
    { id: 'c9',  icon: Icon.Refresh,       title: 'Возврат средств',         desc: 'При отмене и оформлении возврата',       color: '#4A80C4' },
    { id: 'c10', icon: Icon.CreditCard,    title: 'Задолженность по оплате', desc: 'Напоминание об неоплаченном занятии',    color: '#D88C9A' },
  ],
  trainer: [
    { id: 't1', icon: Icon.Calendar,      title: 'Новая запись к тренеру',   desc: 'Клиент записался на персональное занятие', color: '#F9A08B' },
    { id: 't2', icon: Icon.UserX,         title: 'Отмена записи клиентом',   desc: 'Клиент отменил занятие менее чем за 2 ч',  color: '#D88C9A' },
    { id: 't3', icon: Icon.AlertTriangle, title: 'Напоминание о занятии',    desc: 'За 1 час до начала',                       color: '#f0c040' },
    { id: 't4', icon: Icon.Users,         title: 'Список участников группы', desc: 'За 30 мин. до группового занятия',         color: '#4A80C4' },
    { id: 't5', icon: Icon.Clock,         title: 'Изменение в расписании',   desc: 'Администратор изменил слот или локацию',   color: '#9B8EC4' },
    { id: 't6', icon: Icon.Money,         title: 'Начисление зарплаты',      desc: 'Еженедельный расчёт выплат',               color: '#5BAB72' },
    { id: 't7', icon: Icon.FileText,      title: 'Новый отзыв о тренере',    desc: 'Клиент оставил оценку после занятия',      color: '#F9A08B' },
    { id: 't8', icon: Icon.Gift,          title: 'День рождения клиента',    desc: 'Напоминание, чтобы поздравить лично',      color: '#e08060' },
  ],
  admin: [
    { id: 'a1',  icon: Icon.Calendar,      title: 'Новая онлайн-запись',       desc: 'Клиент записался через сайт или виджет', color: '#F9A08B' },
    { id: 'a2',  icon: Icon.UserX,         title: 'Отмена в последний момент', desc: 'Менее чем за 1 час до занятия',          color: '#D88C9A' },
    { id: 'a3',  icon: Icon.Users,         title: 'Новый клиент в системе',    desc: 'Регистрация нового пользователя',         color: '#5BAB72' },
    { id: 'a4',  icon: Icon.Money,         title: 'Оплата получена',           desc: 'Любое успешное списание средств',         color: '#5BAB72' },
    { id: 'a5',  icon: Icon.AlertTriangle, title: 'Задолженность клиента',     desc: 'Прошло 3+ дней без оплаты',              color: '#f0c040' },
    { id: 'a6',  icon: Icon.Package,       title: 'Абонементы на исходе',      desc: 'Группа клиентов с ≤1 занятием',          color: '#e08060' },
    { id: 'a7',  icon: Icon.Clock,         title: 'Конфликт расписания',       desc: 'Наложение занятий в журнале',             color: '#D88C9A' },
    { id: 'a8',  icon: Icon.FileText,      title: 'Отчёт за день',            desc: 'Итоговая сводка в конце рабочего дня',    color: '#4A80C4' },
    { id: 'a9',  icon: Icon.Lock,          title: 'Попытка входа',            desc: 'Авторизация с нового устройства',          color: '#9B8EC4' },
    { id: 'a10', icon: Icon.Refresh,       title: 'Возврат средств',           desc: 'Администратор оформил возврат',           color: '#4A80C4' },
  ],
  owner: [
    { id: 'o1', icon: Icon.TrendUp,       title: 'Ежедневная сводка',      desc: 'Выручка, записи, посещаемость за день',  color: '#F9A08B' },
    { id: 'o2', icon: Icon.BarChart,      title: 'Еженедельный отчёт',     desc: 'KPI: рост клиентов, LTV, конверсия',     color: '#4A80C4' },
    { id: 'o3', icon: Icon.Money,         title: 'Крупный платёж',         desc: 'Списание свыше заданного порога',         color: '#5BAB72' },
    { id: 'o4', icon: Icon.AlertTriangle, title: 'Аномалия в данных',      desc: 'Резкое падение записей или выручки',      color: '#D88C9A' },
    { id: 'o5', icon: Icon.Users,         title: 'Новый сотрудник добавлен', desc: 'Администратор создал новый аккаунт',    color: '#9B8EC4' },
    { id: 'o6', icon: Icon.CreditCard,    title: 'Продление тарифа',       desc: 'Напоминание об оплате подписки Velora',   color: '#f0c040' },
    { id: 'o7', icon: Icon.Lock,          title: 'Изменение прав доступа', desc: 'Права сотрудника были изменены',          color: '#e08060' },
    { id: 'o8', icon: Icon.Star,          title: 'Достигнут KPI',          desc: 'Выполнен целевой показатель месяца',      color: '#5BAB72' },
    { id: 'o9', icon: Icon.FileText,      title: 'Экспорт данных',         desc: 'Кто-то выгрузил базу клиентов',           color: '#D88C9A' },
  ],
};
