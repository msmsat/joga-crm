import type { ProgramKey } from './types';

interface ProgramMeta {
  key: ProgramKey;
  title: string;
  desc: string;
  accentColor: string;
  accentBg: string;
  accentBorder: string;
  stats: { value: number; label: string };
}

export const PROGRAM_METADATA: ProgramMeta[] = [
  {
    key: 'loyalty',
    title: 'Карты лояльности',
    desc: 'Накопительная система баллов по уровням',
    accentColor: '#FCAE91',
    accentBg: 'rgba(252,174,145,0.08)',
    accentBorder: 'rgba(252,174,145,0.25)',
    stats: { value: 89, label: 'клиентов' },
  },
  {
    key: 'discounts',
    title: 'Скидки и кэшбэк',
    desc: 'Персональные предложения для клиентов',
    accentColor: '#5BAB72',
    accentBg: 'rgba(91,171,114,0.08)',
    accentBorder: 'rgba(91,171,114,0.25)',
    stats: { value: 18, label: 'активных' },
  },
  {
    key: 'certificates',
    title: 'Сертификаты',
    desc: 'Подарочные и именные сертификаты',
    accentColor: '#4A80C4',
    accentBg: 'rgba(74,128,196,0.08)',
    accentBorder: 'rgba(74,128,196,0.25)',
    stats: { value: 34, label: 'продано' },
  },
  {
    key: 'subscriptions',
    title: 'Абонементы',
    desc: 'Пакеты на 8, 12, 20 занятий',
    accentColor: '#D88C9A',
    accentBg: 'rgba(216,140,154,0.08)',
    accentBorder: 'rgba(216,140,154,0.25)',
    stats: { value: 67, label: 'активных' },
  },
  {
    key: 'referral',
    title: 'Реферальная',
    desc: 'Программа «Приведи друга»',
    accentColor: '#9B8EC4',
    accentBg: 'rgba(155,142,196,0.08)',
    accentBorder: 'rgba(155,142,196,0.25)',
    stats: { value: 24, label: 'реферала' },
  },
];
