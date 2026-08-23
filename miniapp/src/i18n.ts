import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import translationUK from './locales/uk.json';
import translationEN from './locales/en.json';
import translationCS from './locales/cs.json';
import translationDE from './locales/de.json';
import translationRU from './locales/ru.json';

const resources = {
  uk: { translation: translationUK },
  en: { translation: translationEN },
  cs: { translation: translationCS },
  de: { translation: translationDE },
  ru: { translation: translationRU }
};

// Чешский раньше лежал под кодом 'cz', которого в ISO 639-1 нет: Intl такой
// тег не знает, и все даты (toLocaleDateString(i18n.language)) молча уезжали в
// язык браузера. Выбор, сохранённый детектором до переименования, переносим —
// иначе он не найдётся в resources и человека выбросит на фолбэк.
if (localStorage.getItem('i18nextLng') === 'cz') localStorage.setItem('i18nextLng', 'cs');

i18n
  // Подключаем детектор (он сохранит язык в localStorage)
  .use(LanguageDetector)
  // Передаем инстанс в react-i18next
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'uk', // Язык по умолчанию, если что-то пойдет не так
    // Браузер отдаёт 'de-DE'/'cs-CZ' — без этого i18next искал бы регион как
    // отдельный язык и не нашёл бы его среди resources.
    supportedLngs: Object.keys(resources),
    nonExplicitSupportedLngs: true,
    interpolation: {
      escapeValue: false // React сам защищает от XSS атак
    }
  });

export default i18n;
