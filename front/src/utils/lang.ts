// Языки интерфейса. Список живёт здесь, а не в components/UI.tsx, потому что
// его читает и лендинг: тянуть ради пяти строк весь UI.tsx (портал, телефонный
// инпут, иллюстрации онбординга) в маркетинговый бандл незачем. UI.tsx
// реэкспортирует LANGUAGES отсюда — источник истины один.
//
// Коды — ISO 639-1 (важно для Intl.*: 'cz' не существует, чешский — 'cs').
// Подписи — на самих языках, а не переводы: человек ищет в списке ту строку,
// которую узнаёт, — «Čeština», а не «Чешский».
// Порядок — по алфавиту подписи, кроме английского и русского: они первые,
// потому что на них написан продукт и ими пользуется большинство студий.
export const LANGUAGES = [
  { value: "en", label: "English", flag: "🇬🇧" },
  { value: "ru", label: "Русский", flag: "🇷🇺" },
  { value: "cs", label: "Čeština", flag: "🇨🇿" },
  { value: "de", label: "Deutsch", flag: "🇩🇪" },
  { value: "uk", label: "Українська", flag: "🇺🇦" },
];

/** Язык по умолчанию для всего, что человек видит до входа в кабинет. */
export const DEFAULT_LANG = "en";

// Выбор языка на лендинге переживает перезагрузку: без этого человек,
// переключивший страницу на немецкий, получал бы английский на каждом
// возврате. Внутри кабинета язык всё равно диктует студия
// (DashboardLayout синхронизирует его после входа).
const UI_LANG_KEY = "ui_language";

export function isSupportedLang(code: string | null | undefined): boolean {
  return !!code && LANGUAGES.some(l => l.value === code);
}

/** Язык из прошлого визита; всё незнакомое (и чужая запись в хранилище) → английский. */
export function storedLang(): string {
  try {
    const saved = localStorage.getItem(UI_LANG_KEY);
    return isSupportedLang(saved) ? saved! : DEFAULT_LANG;
  } catch {
    // Приватный режим/заблокированное хранилище — не повод падать на старте.
    return DEFAULT_LANG;
  }
}

export function rememberLang(code: string): void {
  try {
    localStorage.setItem(UI_LANG_KEY, code);
  } catch {
    // см. storedLang
  }
}
