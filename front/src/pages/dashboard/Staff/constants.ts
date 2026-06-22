/**
 * @file constants.ts
 * @description Константы, конфигурация и моковые данные для модуля управления сотрудниками
 */

import type { Employee, HallsMap } from './types';

// ─── КОНФИГУРАЦИЯ СТУДИИ ────────────────────────────────────────────────────

/**
 * Словарь доступных залов/студий
 */
export const halls: HallsMap = {
  A: { name: 'Зал А', color: '#5BAB72' },
  B: { name: 'Зал Б', color: '#4A80C4' },
  C: { name: 'Студия С', color: '#e08060' }
};

/**
 * Временная сетка расписания
 */
export const times: string[] = ['08:00','09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00','18:00','19:00','20:00'];

/**
 * Дни недели для сетки расписания
 */
export const days: string[] = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

// ─── СПРАВОЧНИКИ (Роли и Права) ──────────────────────────────────────────────

/**
 * Системные группы/отделы сотрудников
 */
export const STAFF_GROUPS = [
  'Владелец',
  'Администраторы',
  'Тренеры',
  'Уборка/Хоз. часть'
] as const;

/**
 * Доступные роли в системе (пригодится для <select> в модалках)
 */
export const STAFF_ROLES = [
  'Владелец студии',
  'Администратор',
  'Старший администратор',
  'Тренер пилатеса',
  'Тренер йоги',
  'Тренер стретчинга',
  'Персональный тренер'
] as const;

/**
 * Модули системы, к которым можно выдавать права доступа
 */
export const SYSTEM_PERMISSIONS = [
  'Финансы',
  'Сотрудники',
  'Отчёты',
  'Клиенты',
  'Настройки',
  'Расписание',
  'Рассылки'
] as const;

// ─── МОКОВЫЕ ДАННЫЕ (Mock Data) ─────────────────────────────────────────────

/**
 * Исходный список сотрудников (Mock-база данных)
 */
export const initialStaff: Employee[] = [
  { 
    id: 'owner', 
    group: 'Владелец', 
    name: 'Алексей Морозов', 
    role: 'Владелец студии', 
    initials: 'АМ', 
    grad: 'linear-gradient(135deg,#FCAE91,#f5887a)', 
    bg: 'linear-gradient(135deg,rgba(252,174,145,.15),rgba(249,160,139,.08))', 
    stats: [{ v: '₽284K', l: 'Выручка' }, { v: '5.0★', l: 'Рейтинг' }, { v: '9', l: 'Сотрудников' }, { v: '142', l: 'Клиентов' }], 
    online: true, 
    phone: '+7 900 123-45-67', 
    email: 'alex@velora.studio' 
  },
  { 
    id: 'admin1', 
    group: 'Администраторы', 
    name: 'Ольга Смирнова', 
    role: 'Администратор', 
    initials: 'ОС', 
    grad: 'linear-gradient(135deg,#4A80C4,#3a6ab0)', 
    bg: 'linear-gradient(135deg,rgba(74,128,196,.1),rgba(74,128,196,.05))', 
    stats: [{ v: '148', l: 'Записей' }, { v: '₽42K', l: 'Зарплата' }, { v: '4.8★', l: 'Рейтинг' }, { v: '98%', l: 'Точность' }], 
    online: true, 
    phone: '+7 916 234-56-78', 
    email: 'olga@velora.studio' 
  },
  { 
    id: 'admin2', 
    group: null, // null означает, что он в той же группе, что и предыдущий
    name: 'Иван Коваль', 
    role: 'Администратор', 
    initials: 'ИК', 
    grad: 'linear-gradient(135deg,#7b6cd4,#6050b8)', 
    bg: 'linear-gradient(135deg,rgba(123,108,212,.1),rgba(123,108,212,.05))', 
    stats: [{ v: '96', l: 'Записей' }, { v: '₽38K', l: 'Зарплата' }, { v: '4.7★', l: 'Рейтинг' }, { v: '95%', l: 'Точность' }], 
    online: false, 
    phone: '+7 921 345-67-89', 
    email: 'ivan@velora.studio' 
  },
  { 
    id: 'trainer1', 
    group: 'Тренеры', 
    name: 'Анна Новикова', 
    role: 'Тренер пилатеса', 
    initials: 'АН', 
    grad: 'linear-gradient(135deg,#5BAB72,#4a9060)', 
    bg: 'linear-gradient(135deg,rgba(91,171,114,.12),rgba(91,171,114,.05))', 
    stats: [{ v: '312', l: 'Записи' }, { v: '₽65K', l: 'Зарплата' }, { v: '4.9★', l: 'Рейтинг' }, { v: '94%', l: 'Загрузка' }], 
    online: true, 
    phone: '+7 903 456-78-90', 
    email: 'anna@velora.studio' 
  },
  { 
    id: 'trainer2', 
    group: null, 
    name: 'Дарья Петрова', 
    role: 'Тренер йоги', 
    initials: 'ДП', 
    grad: 'linear-gradient(135deg,#e08060,#c86040)', 
    bg: 'linear-gradient(135deg,rgba(224,128,96,.1),rgba(224,128,96,.05))', 
    stats: [{ v: '248', l: 'Записи' }, { v: '₽58K', l: 'Зарплата' }, { v: '4.8★', l: 'Рейтинг' }, { v: '81%', l: 'Загрузка' }], 
    online: true, 
    phone: '+7 905 567-89-01', 
    email: 'darya@velora.studio' 
  },
  { 
    id: 'trainer3', 
    group: null, 
    name: 'Михаил Волков', 
    role: 'Тренер стретчинга', 
    initials: 'МВ', 
    grad: 'linear-gradient(135deg,#40a8a0,#2d8880)', 
    bg: 'linear-gradient(135deg,rgba(64,168,160,.1),rgba(64,168,160,.05))', 
    stats: [{ v: '186', l: 'Записи' }, { v: '₽48K', l: 'Зарплата' }, { v: '4.7★', l: 'Рейтинг' }, { v: '68%', l: 'Загрузка' }], 
    online: false, 
    phone: '+7 909 678-90-12', 
    email: 'misha@velora.studio' 
  }
];