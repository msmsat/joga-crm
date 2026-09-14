/**
 * Согласие на необязательные cookie и похожие технологии (localStorage,
 * сторонние скрипты) — одна точка правды для баннера, окна настроек и всего,
 * что без согласия грузиться не должно.
 *
 * Рамка: § 89 odst. 3 zákona č. 127/2005 Sb. (opt-in с 1.1.2022) и ст. 5(3)
 * Директивы 2002/58/ES. Необходимое (токен входа, язык, тема, само это решение)
 * согласия не требует и здесь не описывается. Необязательная категория пока
 * одна — `functional`, вход через Google: скрипт GSI читает cookie Google и
 * ставит `g_state` на наш домен.
 *
 * Что нельзя сломать — за это спрашивает надзор (ÚOOÚ), а не тесты:
 * 1. До выбора всё необязательное ВЫКЛЮЧЕНО. Молчание и прокрутка — не согласие.
 * 2. «Отклонить все» — один клик и та же заметность, что у «Принять все».
 * 3. Отказ не закрывает продукт: cookie wall запрещён (EDPB, Guidelines 05/2020).
 * 4. Отозвать так же просто, как дать: «Настройки cookie» в подвалах и профиле.
 *
 * Новая цель или категория → CONSENT_REVISION + 1 и строка в
 * back/static/cookies.html (с подъёмом legal.TERMS_VERSION). Иначе прежние
 * решения молча распространились бы на то, о чём человека не спрашивали.
 */

export const CONSENT_REVISION = 1;

// Полгода — срок из рекомендаций CNIL (самые строгие в ЕС), он же назван в
// политике cookie. Отказ живёт столько же: переспрашивать раньше — давить.
const TTL_MS = 180 * 24 * 60 * 60 * 1000;
const STORAGE_KEY = 'velora_cookie_consent';

export type ConsentCategory = 'functional';
export type ConsentChoices = Record<ConsentCategory, boolean>;
/** Откуда пришло решение — по записи видно, какой экран его дал. */
export type ConsentSource = 'banner' | 'settings' | 'google_button';

export interface ConsentRecord {
  revision: number;
  /** Случайный и с аккаунтом не связан: ссылка на конкретное решение, а не на человека. */
  id: string;
  decidedAt: string;
  source: ConsentSource;
  choices: ConsentChoices;
}

export const REJECT_ALL: ConsentChoices = { functional: false };
export const ACCEPT_ALL: ConsentChoices = { functional: true };

const SOURCES: ConsentSource[] = ['banner', 'settings', 'google_button'];

function parse(raw: string | null): ConsentRecord | null {
  if (!raw) return null;
  try {
    const record = JSON.parse(raw) as Partial<ConsentRecord>;
    if (record.revision !== CONSENT_REVISION || typeof record.decidedAt !== 'string') return null;
    const decidedAt = Date.parse(record.decidedAt);
    if (Number.isNaN(decidedAt) || Date.now() - decidedAt > TTL_MS) return null;
    const source = SOURCES.find((s) => s === record.source) ?? 'banner';
    return {
      revision: CONSENT_REVISION,
      id: typeof record.id === 'string' ? record.id : '',
      decidedAt: record.decidedAt,
      source,
      // Только явное true: битая или чужая запись не должна включать то, на что не соглашались.
      choices: { functional: record.choices?.functional === true },
    };
  } catch {
    return null;
  }
}

function readStored(): ConsentRecord | null {
  try {
    return parse(localStorage.getItem(STORAGE_KEY));
  } catch {
    // Хранилище заблокировано — считаем, что выбора нет: это безопасная сторона.
    return null;
  }
}

const newId = () =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    // randomUUID есть только в защищённом контексте; дев-сервер по IP в сети — не он.
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;

/** Cookie One Tap, которую GSI ставит на НАШ домен. Cookie на доменах Google нам недоступны. */
function clearGoogleState() {
  document.cookie = 'g_state=; Max-Age=0; path=/';
}

let current = readStored();
let settingsOpen = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());

// Решения нет или оно истекло — состоянию One Tap на нашем домене не место.
if (!current?.choices.functional) clearGoogleState();

export function subscribeConsent(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export const getConsent = (): ConsentRecord | null => current;
export const isCookieSettingsOpen = (): boolean => settingsOpen;

export function saveConsent(choices: ConsentChoices, source: ConsentSource): void {
  current = {
    revision: CONSENT_REVISION,
    id: newId(),
    decidedAt: new Date().toISOString(),
    source,
    choices: { ...choices },
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch {
    // Приватный режим: решение действует до перезагрузки — лучше, чем падение.
  }
  if (!choices.functional) {
    // Тег скрипта уберёт сам GoogleOAuthProvider, размонтировавшись вслед за
    // согласием (руками его трогать нельзя — провайдер упадёт на removeChild).
    // Уже открытый One Tap гасим явно, иначе он висел бы и после отказа.
    (window as unknown as { google?: { accounts?: { id?: { cancel?: () => void } } } })
      .google?.accounts?.id?.cancel?.();
    clearGoogleState();
  }
  emit();
}

/** Согласие на одну категорию поверх уже сделанного выбора (кнопка «Продолжить с Google»). */
export function grantConsent(category: ConsentCategory, source: ConsentSource): void {
  saveConsent({ ...(current?.choices ?? REJECT_ALL), [category]: true }, source);
}

export function openCookieSettings(): void {
  settingsOpen = true;
  emit();
}

export function closeCookieSettings(): void {
  settingsOpen = false;
  emit();
}

// Выбор в соседней вкладке применяется и здесь: иначе отозванное там согласие
// продолжало бы действовать на уже открытой странице входа.
window.addEventListener('storage', (event) => {
  if (event.key !== STORAGE_KEY && event.key !== null) return;
  current = readStored();
  emit();
});
