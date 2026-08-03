import type { MetricPresenter, MyKpiId, Task } from './types';

// Заголовки резолвятся через t('metrics.'+id) в useOverviewData — реагируют на смену языка.
export const METRIC_PRESENTERS: MetricPresenter[] = [
  { id: 'revenue',   color: '#FCAE91', glow: 'rgba(252,174,145,0.2)', route: '/dashboard/finances' },
  { id: 'clients',   color: '#5BAB72', glow: 'rgba(91,171,114,0.2)',  route: '/dashboard/clients' },
  { id: 'bookings',  color: '#4A80C4', glow: 'rgba(74,128,196,0.2)',  route: '/dashboard/booking' },
  { id: 'retention', color: '#D88C9A', glow: 'rgba(216,140,154,0.2)', route: '/dashboard/reports' },
];

// Метрики админа и тренера (GET /analytics/me). Порядок карточек задаёт сервер —
// здесь только оформление и куда ведёт «Подробнее». Роуты отличаются от owner-ряда:
// Отчёты, Финансы и Онлайн-запись этим ролям недоступны, всё ведёт в Журнал/Клиентов.
export const MY_METRIC_PRESENTERS: Record<MyKpiId, Omit<MetricPresenter, 'id'>> = {
  lessons:        { color: '#4A80C4', glow: 'rgba(74,128,196,0.2)',  route: '/dashboard/journal' },
  bookings:       { color: '#4A80C4', glow: 'rgba(74,128,196,0.2)',  route: '/dashboard/journal' },
  attendance:     { color: '#5BAB72', glow: 'rgba(91,171,114,0.2)',  route: '/dashboard/journal' },
  fill_rate:      { color: '#FCAE91', glow: 'rgba(252,174,145,0.2)', route: '/dashboard/journal' },
  rating:         { color: '#D88C9A', glow: 'rgba(216,140,154,0.2)', route: '/dashboard/journal' },
  active_clients: { color: '#5BAB72', glow: 'rgba(91,171,114,0.2)',  route: '/dashboard/clients' },
};

/** Палитра для баров сводок (услуги/тренеры). */
export const BAR_COLORS = ['#FCAE91', '#5BAB72', '#4A80C4', '#f0c040', '#D88C9A', '#7B6CD4'];

// ─── Задачи: приоритет и теги ──────────────────────────────────────────────
// Подписи (приоритет, теги) — не здесь: они текст, переводятся через t() в компонентах
// (TaskRow, AddTaskForm), чтобы реагировать на смену языка. Здесь только цвета —
// значение `tag` каноническое из БД (`StudioTask.tag`), не меняется от локали.
export const PRIORITY_COLOR: Record<Task['priority'], string> = {
  high:   '#D88C9A',
  medium: '#FCAE91',
  low:    'var(--muted)',
};

export const TAG_COLORS: Record<string, string> = {
  Клиент:   'rgba(91,171,114,0.12)',
  Финансы:  'rgba(252,174,145,0.12)',
  Лиды:     'rgba(74,128,196,0.12)',
  Отчёты:   'rgba(216,140,154,0.12)',
  Журнал:   'rgba(64,168,160,0.12)',
  Персонал: 'rgba(123,108,212,0.12)',
};

export const TAG_TEXT: Record<string, string> = {
  Клиент:   '#5BAB72',
  Финансы:  '#e09070',
  Лиды:     '#4A80C4',
  Отчёты:   '#D88C9A',
  Журнал:   '#40a8a0',
  Персонал: '#7B6CD4',
};
