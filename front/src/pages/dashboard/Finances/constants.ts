import type { AccountItem, Operation, Counterparty, FinDocument, OnlineChannel, PaymentMethod, Goal } from './types';

export const fmt = (n: number) => '₽' + n.toLocaleString('ru-RU');

export const ACCOUNTS_DATA: AccountItem[] = [
  { id: 1, name: 'Касса студии', type: 'cash', balance: 485200, change: 48200, color: '#FCAE91', isSystem: true },
  { id: 2, name: 'Расчётный счёт', type: 'bank', balance: 1840000, change: 82400, color: '#A3C9A8', isSystem: true },
  { id: 3, name: 'Онлайн-эквайринг', type: 'online', balance: 94100, change: 34100, color: '#7EB5D6', isSystem: true },
];

export const OPERATIONS_DATA: Operation[] = [
  { id: 1, type: 'income', title: 'Оплата абонемента', client: 'Мария Коваленко', amount: 12000, date: 'Сегодня, 14:32', category: 'Абонементы', method: 'Карта', status: 'completed', account: 'Расчётный счёт' },
  { id: 2, type: 'expense', title: 'Возврат средств', client: 'Иван Петров', amount: -2500, date: 'Сегодня, 11:15', category: 'Возврат', method: 'Наличные', status: 'completed', account: 'Основная касса' },
  { id: 3, type: 'income', title: 'Разовая запись', client: 'Елена Соколова', amount: 1200, date: 'Вчера, 18:45', category: 'Услуги', method: 'QR', status: 'completed', account: 'Онлайн-кошелёк' },
  { id: 4, type: 'expense', title: 'Аренда зала', client: 'Контрагент', amount: -8000, date: 'Вчера, 10:00', category: 'Аренда', method: 'Перевод', status: 'completed', account: 'Расчётный счёт' },
  { id: 5, type: 'income', title: 'Оплата сертификата', client: 'Алексей Морозов', amount: 5000, date: '29 июн, 16:20', category: 'Сертификаты', method: 'Карта', status: 'completed', account: 'Расчётный счёт' },
  { id: 6, type: 'income', title: 'Групповое занятие', client: 'Группа — 8 чел.', amount: 9600, date: '29 июн, 12:00', category: 'Услуги', method: 'Карта', status: 'completed', account: 'Расчётный счёт' },
  { id: 7, type: 'expense', title: 'Зарплата тренеров', client: 'Команда', amount: -120000, date: '28 июн, 09:00', category: 'Зарплата', method: 'Перевод', status: 'completed', account: 'Основная касса' },
  { id: 8, type: 'income', title: 'Продление абонемента', client: 'Светлана Иванова', amount: 8500, date: '28 июн, 17:30', category: 'Абонементы', method: 'Карта', status: 'pending', account: 'Расчётный счёт' },
];

export const COUNTERPARTIES_DATA: Counterparty[] = [
  { id: 1, name: 'ООО «АрендаСтарт»', type: 'Юр. лицо', inn: '7701234567', category: 'Аренда', balance: -8000, deals: 24, color: '#FCAE91' },
  { id: 2, name: 'ИП Соколов Д.В.', type: 'ИП', inn: '500987654321', category: 'Поставщик', balance: -15400, deals: 8, color: '#7EB5D6' },
  { id: 3, name: 'ООО «КлинингПрофи»', type: 'Юр. лицо', inn: '7809876543', category: 'Клининг', balance: -6200, deals: 12, color: '#A3C9A8' },
  { id: 4, name: 'Власова А.С. (бух)', type: 'Физ. лицо', inn: '500123456789', category: 'Бухгалтерия', balance: -25000, deals: 6, color: '#D88C9A' },
];

export const DOCUMENTS_DATA: FinDocument[] = [
  { id: 1, title: 'Акт выполненных работ №47', type: 'Акт', date: '30 июн 2025', party: 'ООО «АрендаСтарт»', amount: 8000, status: 'signed', ext: 'PDF' },
  { id: 2, title: 'Счёт-фактура №23', type: 'Счёт', date: '29 июн 2025', party: 'ИП Соколов Д.В.', amount: 15400, status: 'pending', ext: 'PDF' },
  { id: 3, title: 'Договор аренды (продление)', type: 'Договор', date: '01 июн 2025', party: 'ООО «АрендаСтарт»', amount: 96000, status: 'signed', ext: 'DOCX' },
  { id: 4, title: 'Кассовый отчёт — Июнь', type: 'Отчёт', date: '01 июл 2025', party: 'Внутренний', amount: 485200, status: 'draft', ext: 'XLSX' },
  { id: 5, title: 'УПД №112', type: 'УПД', date: '28 июн 2025', party: 'ООО «КлинингПрофи»', amount: 6200, status: 'signed', ext: 'PDF' },
];

export const ONLINE_CHANNELS_DATA: OnlineChannel[] = [
  { id: 1, name: 'Ссылка на оплату', desc: 'Персональная страница записи и оплаты', icon: 'link', active: true, amount: 124300, sessions: 89 },
  { id: 2, name: 'QR-код', desc: 'Оплата по QR в студии или на сайте', icon: 'qr', active: true, amount: 38500, sessions: 32 },
  { id: 3, name: 'Telegram Pay', desc: 'Встроенная оплата в Telegram-боте', icon: 'telegram', active: false, amount: 0, sessions: 0 },
  { id: 4, name: 'Виджет на сайт', desc: 'JavaScript-виджет для вашего сайта', icon: 'widget', active: true, amount: 57200, sessions: 44 },
];

export const PAYMENT_METHODS_DATA: PaymentMethod[] = [
  { id: 1, name: 'Банковская карта', desc: 'Visa, MasterCard, МИР', icon: 'card', enabled: true, commission: '1.8%', transactions: 312 },
  { id: 2, name: 'Наличные', desc: 'Приём наличных через кассу', icon: 'cash', enabled: true, commission: '0%', transactions: 87 },
  { id: 3, name: 'СБП (QR)', desc: 'Система быстрых платежей', icon: 'qr', enabled: true, commission: '0.4%', transactions: 56 },
  { id: 4, name: 'Apple Pay / Google Pay', desc: 'NFC и мобильные кошельки', icon: 'nfc', enabled: true, commission: '1.8%', transactions: 134 },
  { id: 5, name: 'Рассрочка (BNPL)', desc: 'Оплата по частям без переплаты', icon: 'bnpl', enabled: false, commission: '3.2%', transactions: 0 },
];

export const GOALS_DATA: Goal[] = [
  { id: 1, title: 'Выручка — Июль 2025', target: 900000, current: 540200, deadline: '31 июл 2025', category: 'Выручка', color: '#FCAE91', priority: 'high' },
  { id: 2, title: 'Резервный фонд', target: 500000, current: 125000, deadline: '31 дек 2025', category: 'Резервы', color: '#A3C9A8', priority: 'medium' },
  { id: 3, title: 'Снизить расходы на 15%', target: 100, current: 62, deadline: '31 авг 2025', category: 'Оптимизация', color: '#7EB5D6', priority: 'medium' },
  { id: 4, title: 'Инвестиции в оборудование', target: 250000, current: 250000, deadline: '15 июн 2025', category: 'Инвестиции', color: '#D88C9A', priority: 'low' },
];
