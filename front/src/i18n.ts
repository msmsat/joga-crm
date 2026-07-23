import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

// Импортируем наши словари
import commonRU from './locales/ru/common.json';
import staffRU from './locales/ru/staff.json';
import profileRU from './locales/ru/profile.json';
import catalogRU from './locales/ru/catalog.json';
import loyaltyRU from './locales/ru/loyalty.json';
import clientsRU from './locales/ru/clients.json';
import journalRU from './locales/ru/journal.json';
import financesRU from './locales/ru/finances.json';
import bookingRU from './locales/ru/booking.json';
import reportsRU from './locales/ru/reports.json';
import notificationsRU from './locales/ru/notifications.json';

import commonEN from './locales/en/common.json';
import staffEN from './locales/en/staff.json';
import profileEN from './locales/en/profile.json';
import catalogEN from './locales/en/catalog.json';
import loyaltyEN from './locales/en/loyalty.json';
import clientsEN from './locales/en/clients.json';
import journalEN from './locales/en/journal.json';
import financesEN from './locales/en/finances.json';
import bookingEN from './locales/en/booking.json';
import reportsEN from './locales/en/reports.json';
import notificationsEN from './locales/en/notifications.json';

// 2. Раскладываем их по полочкам (namespaces)
const resources = {
  ru: {
    common: commonRU,
    staff: staffRU,
    profile: profileRU,
    catalog: catalogRU,
    loyalty: loyaltyRU,
    clients: clientsRU,
    journal: journalRU,
    finances: financesRU,
    booking: bookingRU,
    reports: reportsRU,
    notifications: notificationsRU,
  },
  en: {
    common: commonEN,
    staff: staffEN,
    profile: profileEN,
    catalog: catalogEN,
    loyalty: loyaltyEN,
    clients: clientsEN,
    journal: journalEN,
    finances: financesEN,
    booking: bookingEN,
    reports: reportsEN,
    notifications: notificationsEN,
  }
};

// Postgres EXTRACT(dow): 0=воскресенье..6=суббота — используется в insights
// бэка (R1, lesson_overfull.weekday). common.days ключи начинаются с mon.
const DOW_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

i18n
  .use(initReactI18next) // Передаем i18n внутрь React
  .init({
    resources,
    lng: 'en', // Язык по умолчанию
    fallbackLng: 'en', // Если слова нет в русском, покажет английское
    defaultNS: 'common',
    interpolation: {
      escapeValue: false, // React сам защищает от XSS, отключаем встроенную защиту
    },
  });

// interpolation.format в init() перезаписывается встроенным Formatter-сервисом
// (i18next v22+) — регистрировать кастомный формат нужно через formatter.add
// ПОСЛЕ init, иначе {{weekday, weekday}} тихо выводит сырое число.
i18n.services.formatter?.add('weekday', value => i18n.t(`common:days.${DOW_KEYS[Number(value)] ?? 'mon'}`));

export default i18n;