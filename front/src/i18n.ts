import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

// Импортируем наши словари
import commonRU from './locales/ru/common.json';
import staffRU from './locales/ru/staff.json';
import profileRU from './locales/ru/profile.json';
import catalogRU from './locales/ru/catalog.json';

import commonEN from './locales/en/common.json';
import staffEN from './locales/en/staff.json';
import profileEN from './locales/en/profile.json';
import catalogEN from './locales/en/catalog.json';

// 2. Раскладываем их по полочкам (namespaces)
const resources = {
  ru: {
    common: commonRU,
    staff: staffRU,
    profile: profileRU,
    catalog: catalogRU,
  },
  en: {
    common: commonEN,
    staff: staffEN,
    profile: profileEN,
    catalog: catalogEN,
  }
};

i18n
  .use(initReactI18next) // Передаем i18n внутрь React
  .init({
    resources,
    lng: 'en', // Язык по умолчанию
    fallbackLng: 'en', // Если слова нет в русском, покажет английское
    defaultNS: 'common',
    interpolation: {
      escapeValue: false // React сам защищает от XSS, отключаем встроенную защиту
    }
  });

export default i18n;