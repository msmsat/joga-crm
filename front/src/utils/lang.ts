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
  { value: "sq", label: "Shqip", flag: "🇦🇱" },
  { value: "bg", label: "Български", flag: "🇧🇬" },
  { value: "hr", label: "Hrvatski", flag: "🇭🇷" },
  { value: "cs", label: "Čeština", flag: "🇨🇿" },
  { value: "da", label: "Dansk", flag: "🇩🇰" },
  { value: "fi", label: "Suomi", flag: "🇫🇮" },
  { value: "fr", label: "Français", flag: "🇫🇷" },
  { value: "de", label: "Deutsch", flag: "🇩🇪" },
  { value: "el", label: "Ελληνικά", flag: "🇬🇷" },
  { value: "hu", label: "Magyar", flag: "🇭🇺" },
  { value: "it", label: "Italiano", flag: "🇮🇹" },
  { value: "no", label: "Norsk", flag: "🇳🇴" },
  { value: "pl", label: "Polski", flag: "🇵🇱" },
  { value: "pt", label: "Português", flag: "🇵🇹" },
  { value: "ro", label: "Română", flag: "🇷🇴" },
  { value: "sr", label: "Српски", flag: "🇷🇸" },
  { value: "es", label: "Español", flag: "🇪🇸" },
  { value: "sv", label: "Svenska", flag: "🇸🇪" },
  { value: "tr", label: "Türkçe", flag: "🇹🇷" },
  { value: "uk", label: "Українська", flag: "🇺🇦" },
];

/** Язык, когда ни выбора, ни страны нет. */
export const DEFAULT_LANG = "en";

// Старый ui_language смешивал ручной выбор и автоматический язык студии.
// Его нельзя считать предпочтением: иначе старый ru навсегда блокирует IP.
const UI_LANG_KEY = "ui_language_choice";
// Страну прошлой загрузки не сохраняем: VPN мог изменить её с тех пор.
let geoLanguage: string | null = null;
let sessionChoice: string | null = null;

const LEGACY_LANGUAGE_CODES: Record<string, string> = { cz: "cs" };

function normalizeLang(code: string | null | undefined): string | null {
  if (!code) return null;
  const normalized = LEGACY_LANGUAGE_CODES[code.toLowerCase()] ?? code.toLowerCase();
  return LANGUAGES.some(l => l.value === normalized) ? normalized : null;
}

export function isSupportedLang(code: string | null | undefined): code is string {
  return normalizeLang(code) !== null;
}

function read(key: string): string | null {
  try {
    const saved = localStorage.getItem(key);
    // Незнакомое (и чужая запись в хранилище) считается отсутствующим.
    return normalizeLang(saved);
  } catch {
    // Приватный режим/заблокированное хранилище — не повод падать на старте.
    return null;
  }
}

function write(key: string, code: string): void {
  const normalized = normalizeLang(code);
  if (!normalized) return;
  try {
    localStorage.setItem(key, normalized);
  } catch {
    // см. read
  }
}

/** Язык, выбранный человеком или пришедший из его аккаунта; null — не было. */
export function chosenLang(): string | null {
  // onboarding_language was only ever written by its language selector.
  return sessionChoice ?? read(UI_LANG_KEY) ?? read("onboarding_language");
}

/** При загрузке — явный выбор или английский; затем страна текущего визита. */
export function initialLang(): string {
  return chosenLang() ?? geoLanguage ?? DEFAULT_LANG;
}

export function rememberLang(code: string): void {
  const normalized = normalizeLang(code);
  if (!normalized) return;
  sessionChoice = normalized;
  write(UI_LANG_KEY, normalized);
}

export function rememberGeoLang(code: string): void {
  const normalized = normalizeLang(code);
  if (normalized) geoLanguage = normalized;
}
