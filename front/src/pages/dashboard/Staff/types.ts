/**
 * @file types.ts
 * @description Контракты данных и типы для модуля управления сотрудниками
 */

// ─── БАЗОВЫЕ СЛОВАРИ И СУЩНОСТИ ─────────────────────────────────────────────

/**
 * Описание зала/студии
 */
export interface Hall {
  name: string;
  color: string;
}

/**
 * Словарь всех залов
 */
export type HallsMap = Record<string, Hall>;

/**
 * Статистика сотрудника (выручка, рейтинг, загрузка и т.д.)
 */
export interface StaffStat {
  /** Значение метрики (например, '₽284K', '5.0★') */
  v: string;
  /** Описание метрики (например, 'Выручка') */
  l: string;
}

/**
 * Главная модель сотрудника
 */
export interface Employee {
  id: string;
  /** Группа (Отдел), null означает принадлежность к предыдущей группе в списке */
  group: string | null;
  name: string;
  role: string;
  initials: string;
  /** Градиент для аватара */
  grad: string;
  /** Градиент для фона профиля */
  bg: string;
  stats: StaffStat[];
  online: boolean;
  phone: string;
  email: string;
}

// ─── РАСПИСАНИЕ И СОБЫТИЯ ───────────────────────────────────────────────────

/**
 * Событие в расписании (тренировка, смена и т.д.)
 */
export interface UpcomingEvent {
  /** Время начала в формате 'HH:mm' */
  time: string;
  /** Продолжительность в минутах (в исходнике передано как строка, но логичнее number) */
  dur: string | number;
  /** Название события */
  name: string;
  /** Количество записанных клиентов (null, если это личное событие/смена) */
  clients: number | null;
  /** ID зала (ключ из HallsMap) */
  hall: string;
  /** Цвет события для UI */
  color: string;
}

/**
 * Матрица расписания.
 * Массив из 7 элементов (слоты времени), каждый из которых массив из 7 дней (0 - свободно, 1 - занято)
 */
export type ScheduleMatrix = (0 | 1 | number)[][];

/**
 * Графики работы с привязкой к ID сотрудника
 */
export type SchedulesMap = Record<string, ScheduleMatrix>;

/**
 * Ближайшие события с привязкой к ID сотрудника
 */
export type UpcomingMap = Record<string, UpcomingEvent[]>;

// ─── СОСТОЯНИЯ UI (State Types) ─────────────────────────────────────────────

/**
 * Типы действий для универсального модального окна
 */
export type ModalActionType = 'ALERT' | 'PROMPT_MESSAGE' | 'PROMPT_CALL' | string;

/**
 * Состояние универсального модального окна
 */
export interface ModalState {
  isOpen: boolean;
  title: string;
  sub: string;
  type?: ModalActionType;
  danger?: boolean;
  confirmText?: string;
  phone?: string;
  onConfirm?: () => void;
}

/**
 * Состояние всплывающей подсказки (Tooltip) в сетке расписания
 */
export interface TooltipState {
  show: boolean;
  x: number;
  y: number;
  title: string;
  sub: string;
}