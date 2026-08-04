import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import translationUK from './locales/uk.json';
import translationEN from './locales/en.json';
import translationCZ from './locales/cz.json';
import translationRU from './locales/ru.json';

const resources = {
  uk: { translation: translationUK },
  en: { translation: translationEN },
  cz: { translation: translationCZ },
  ru: { translation: translationRU }
};

i18n
  // Подключаем детектор (он сохранит язык в localStorage)
  .use(LanguageDetector)
  // Передаем инстанс в react-i18next
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'uk', // Язык по умолчанию, если что-то пойдет не так
    interpolation: {
      escapeValue: false // React сам защищает от XSS атак
    }
  });

export default i18n;