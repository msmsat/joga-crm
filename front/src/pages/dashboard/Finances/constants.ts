import type { AccountItem, Operation, Counterparty, FinDocument, OnlineChannel, PaymentMethod, Goal, TrainerSalary } from './types';

export const fmt = (n: number) => '₽' + n.toLocaleString('ru-RU');

export const ACCOUNTS_DATA: AccountItem[] = [
  { id: 1, name: 'Касса студии', type: 'cash', balance: 485200, daily_change: 48200, color: '#FCAE91', is_system: true },
  { id: 2, name: 'Расчётный счёт', type: 'bank', balance: 1840000, daily_change: 82400, color: '#A3C9A8', is_system: true },
  { id: 3, name: 'Онлайн-эквайринг', type: 'online', balance: 94100, daily_change: 34100, color: '#7EB5D6', is_system: true },
];

export const OPERATIONS_DATA: Operation[] = [
  { id: 1, type: 'in',  title: 'Оплата абонемента',    client_name: 'Мария Коваленко',  client_id: null, amount: 12000,   op_date: '23.06.2026', category: 'Абонементы',  method: 'Карта',    status: 'completed', account_name: 'Расчётный счёт', account_id: null },
  { id: 2, type: 'out', title: 'Возврат средств',       client_name: 'Иван Петров',      client_id: null, amount: -2500,   op_date: '23.06.2026', category: 'Возврат',     method: 'Наличные', status: 'completed', account_name: 'Основная касса', account_id: null },
  { id: 3, type: 'in',  title: 'Разовая запись',        client_name: 'Елена Соколова',   client_id: null, amount: 1200,    op_date: '22.06.2026', category: 'Услуги',      method: 'QR',       status: 'completed', account_name: 'Онлайн-кошелёк', account_id: null },
  { id: 4, type: 'out', title: 'Аренда зала',           client_name: 'Контрагент',       client_id: null, amount: -8000,   op_date: '22.06.2026', category: 'Аренда',      method: 'Перевод',  status: 'completed', account_name: 'Расчётный счёт', account_id: null },
  { id: 5, type: 'in',  title: 'Оплата сертификата',    client_name: 'Алексей Морозов',  client_id: null, amount: 5000,    op_date: '20.06.2026', category: 'Сертификаты', method: 'Карта',    status: 'completed', account_name: 'Расчётный счёт', account_id: null },
  { id: 6, type: 'in',  title: 'Групповое занятие',     client_name: 'Группа — 8 чел.',  client_id: null, amount: 9600,    op_date: '20.06.2026', category: 'Услуги',      method: 'Карта',    status: 'completed', account_name: 'Расчётный счёт', account_id: null },
  { id: 7, type: 'out', title: 'Зарплата тренеров',     client_name: 'Команда',          client_id: null, amount: -120000, op_date: '18.06.2026', category: 'Зарплата',    method: 'Перевод',  status: 'completed', account_name: 'Основная касса', account_id: null },
  { id: 8, type: 'in',  title: 'Продление абонемента',  client_name: 'Светлана Иванова', client_id: null, amount: 8500,    op_date: '18.06.2026', category: 'Абонементы',  method: 'Карта',    status: 'pending',   account_name: 'Расчётный счёт', account_id: null },
];

export const COUNTERPARTIES_DATA: Counterparty[] = [
  { id: 1, name: 'ООО «АрендаСтарт»', counterparty_type: 'Юр. лицо', inn: '7701234567',   category: 'Аренда',       balance: -8000,  deals_count: 24, color: '#FCAE91' },
  { id: 2, name: 'ИП Соколов Д.В.',    counterparty_type: 'ИП',        inn: '500987654321', category: 'Поставщик',    balance: -15400, deals_count: 8,  color: '#7EB5D6' },
  { id: 3, name: 'ООО «КлинингПрофи»', counterparty_type: 'Юр. лицо', inn: '7809876543',   category: 'Клининг',      balance: -6200,  deals_count: 12, color: '#A3C9A8' },
  { id: 4, name: 'Власова А.С. (бух)', counterparty_type: 'Физ. лицо', inn: '500123456789', category: 'Бухгалтерия',  balance: -25000, deals_count: 6,  color: '#D88C9A' },
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

export const SALARIES_DATA: TrainerSalary[] = [
  {
    id: 1, name: 'Анна Новикова', role: 'Тренер пилатеса', color: '#5BAB72',
    revenue: 284000, sessions: 312, hours: 468, rate: 139, rate_type: 'hourly', salary: 65052,
    weeklyData: [78, 92, 65, 88], topClass: 'Утренний пилатес', rating: 4.9,
  },
  {
    id: 2, name: 'Дарья Петрова', role: 'Тренер йоги', color: '#7EB5D6',
    revenue: 212000, sessions: 248, hours: 372, rate: 156, rate_type: 'hourly', salary: 58032,
    weeklyData: [70, 85, 58, 82], topClass: 'Йога-флоу', rating: 4.8,
  },
  {
    id: 3, name: 'Михаил Волков', role: 'Тренер стретчинга', color: '#D88C9A',
    revenue: 168000, sessions: 186, hours: 279, rate: 172, rate_type: 'hourly', salary: 47988,
    weeklyData: [55, 72, 48, 66], topClass: 'Растяжка Pro', rating: 4.7,
  },
];

// ─── LINE CHART DATA ─────────────────────────────────────────────────────────
export type LinePoint = { label: string; income: number; expense: number };

export const LINE_DATA: Record<string, LinePoint[]> = {
  'Месяц': [
    { label: "июл'24", income: 282000, expense: 78000 },
    { label: "авг'24", income: 298000, expense: 82000 },
    { label: "сен'24", income: 271000, expense: 75000 },
    { label: "окт'24", income: 248000, expense: 70000 },
    { label: "ноя'24", income: 232000, expense: 67000 },
    { label: "дек'24", income: 244000, expense: 72000 },
    { label: "янв'25", income: 215000, expense: 64000 },
    { label: "фев'25", income: 228000, expense: 66000 },
    { label: "мар'25", income: 256000, expense: 71000 },
    { label: "апр'25", income: 272000, expense: 74000 },
    { label: "май'25", income: 288000, expense: 78000 },
    { label: "июн'25", income: 315000, expense: 84000 },
    { label: "июл'25", income: 328000, expense: 88000 },
    { label: "авг'25", income: 342000, expense: 92000 },
    { label: "сен'25", income: 318000, expense: 86000 },
    { label: "окт'25", income: 295000, expense: 80000 },
    { label: "ноя'25", income: 280000, expense: 76000 },
    { label: "дек'25", income: 292000, expense: 80000 },
    { label: "янв'26", income: 262000, expense: 72000 },
    { label: "фев'26", income: 275000, expense: 75000 },
    { label: "мар'26", income: 308000, expense: 83000 },
    { label: "апр'26", income: 340000, expense: 91000 },
    { label: "май'26", income: 365000, expense: 97000 },
    { label: "июн'26", income: 384000, expense: 102000 },
  ],
  'Неделя': [
    { label: 'Пн', income: 32000, expense: 9500  },
    { label: 'Вт', income: 45000, expense: 13000 },
    { label: 'Ср', income: 38000, expense: 11000 },
    { label: 'Чт', income: 52000, expense: 15000 },
    { label: 'Пт', income: 48000, expense: 14000 },
    { label: 'Сб', income: 58000, expense: 16500 },
    { label: 'Вс', income: 35000, expense: 10000 },
    { label: 'Пн', income: 28000, expense: 8500  },
    { label: 'Вт', income: 42000, expense: 12000 },
    { label: 'Ср', income: 36000, expense: 10500 },
    { label: 'Чт', income: 55000, expense: 15500 },
    { label: 'Пт', income: 50000, expense: 14500 },
    { label: 'Сб', income: 62000, expense: 17500 },
    { label: 'Вс', income: 38000, expense: 11000 },
    { label: 'Пн', income: 30000, expense: 9000  },
    { label: 'Вт', income: 46000, expense: 13500 },
    { label: 'Ср', income: 40000, expense: 11500 },
    { label: 'Чт', income: 58000, expense: 16000 },
    { label: 'Пт', income: 54000, expense: 15000 },
    { label: 'Сб', income: 65000, expense: 18500 },
    { label: 'Вс', income: 40000, expense: 11500 },
    { label: 'Пн', income: 34000, expense: 10000 },
    { label: 'Вт', income: 48000, expense: 14000 },
    { label: 'Ср', income: 42000, expense: 12500 },
  ],
  'День': [
    { label: '00:00', income: 3000,  expense: 1200 },
    { label: '01:00', income: 1800,  expense: 900  },
    { label: '02:00', income: 1200,  expense: 700  },
    { label: '03:00', income: 900,   expense: 600  },
    { label: '04:00', income: 1500,  expense: 700  },
    { label: '05:00', income: 4800,  expense: 1500 },
    { label: '06:00', income: 12000, expense: 3500 },
    { label: '07:00', income: 25000, expense: 7000 },
    { label: '08:00', income: 38000, expense: 10000 },
    { label: '09:00', income: 44000, expense: 11800 },
    { label: '10:00', income: 36000, expense: 9600  },
    { label: '11:00', income: 41000, expense: 11000 },
    { label: '12:00', income: 46000, expense: 12500 },
    { label: '13:00', income: 32000, expense: 8800  },
    { label: '14:00', income: 28000, expense: 7600  },
    { label: '15:00', income: 26000, expense: 7000  },
    { label: '16:00', income: 31000, expense: 8400  },
    { label: '17:00', income: 40000, expense: 10600 },
    { label: '18:00', income: 45000, expense: 12000 },
    { label: '19:00', income: 37000, expense: 9800  },
    { label: '20:00', income: 22000, expense: 6000  },
    { label: '21:00', income: 14000, expense: 4200  },
    { label: '22:00', income: 9000,  expense: 2800  },
    { label: '23:00', income: 5000,  expense: 1700  },
  ],
};

export const GOALS_DATA: Goal[] = [
  { id: 1, title: 'Выручка — Июль 2025',       target_amount: 900000, current_amount: 540200, deadline: '31 июл 2025', category: 'Выручка',     color: '#FCAE91', priority: 'high' },
  { id: 2, title: 'Резервный фонд',             target_amount: 500000, current_amount: 125000, deadline: '31 дек 2025', category: 'Резервы',     color: '#A3C9A8', priority: 'medium' },
  { id: 3, title: 'Снизить расходы на 15%',     target_amount: 100,    current_amount: 62,     deadline: '31 авг 2025', category: 'Оптимизация', color: '#7EB5D6', priority: 'medium' },
  { id: 4, title: 'Инвестиции в оборудование',  target_amount: 250000, current_amount: 250000, deadline: '15 июн 2025', category: 'Инвестиции',  color: '#D88C9A', priority: 'low' },
];
