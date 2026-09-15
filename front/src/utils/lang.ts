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

/** Язык, когда ни выбора, ни страны нет. */
export const DEFAULT_LANG = "en";

// Два ключа, а не один, потому что это разные по силе вещи:
//  - ui_language — ВЫБОР: переключатель лендинга или язык из аккаунта
//    (кабинет пишет его сюда, см. DashboardLayout). Переживает выход, и
//    лендинг открывается на нём, а не на языке страны;
//  - geo_language — ДОГАДКА по стране IP (lib/detectLanguage). Нужна только
//    тому, кто ещё ничего не выбирал, и выбор не перебивает никогда.
const UI_LANG_KEY = "ui_language";
const GEO_LANG_KEY = "geo_language";

export function isSupportedLang(code: string | null | undefined): code is string {
  return !!code && LANGUAGES.some(l => l.value === code);
}

function read(key: string): string | null {
  try {
    const saved = localStorage.getItem(key);
    // Незнакомое (и чужая запись в хранилище) считается отсутствующим.
    return isSupportedLang(saved) ? saved : null;
  } catch {
    // Приватный режим/заблокированное хранилище — не повод падать на старте.
    return null;
  }
}

function write(key: string, code: string): void {
  if (!isSupportedLang(code)) return;
  try {
    localStorage.setItem(key, code);
  } catch {
    // см. read
  }
}

/** Язык, выбранный человеком или пришедший из его аккаунта; null — не было. */
export function chosenLang(): string | null {
  return read(UI_LANG_KEY);
}

/** Язык первого кадра: выбор → страна из прошлого визита → английский. */
export function initialLang(): string {
  return chosenLang() ?? read(GEO_LANG_KEY) ?? DEFAULT_LANG;
}

export function rememberLang(code: string): void {
  write(UI_LANG_KEY, code);
}

export function rememberGeoLang(code: string): void {
  write(GEO_LANG_KEY, code);
}
