/**
 * Сессия клиента мини-приложения.
 *
 * Ключ — JWT из POST /global/auth/telegram (`get_current_client` на бэкенде
 * проверяет его на каждом запросе).
 *
 * **Аккаунт принадлежит студии.** `sub` токена — это `client.id`, а карточка
 * клиента живёт в одной студии (`Client.studio_id`); у почтового входа ключ и
 * вовсе пара `(studio_id, email)`. Поэтому «вошёл» — всегда «вошёл в студию», и
 * в чужой студии эта карточка не действует. Раньше здесь было написано
 * обратное — «токен не привязан к студии», — и из этой неправды выросла
 * ошибка: приложение переставало называть студию, как только появлялась
 * сессия, и ссылка на студию B открывала студию A с её тёмной темой и её
 * данными.
 *
 * Аккаунтов на устройстве бывает несколько (своя карточка и карточка ребёнка,
 * личная и рабочая почта, карточки в разных студиях). Активный лежит в
 * `velora.session` — его и только его читает api/client.ts; все, в которые уже
 * входили, — в `velora.accounts`. Два ключа, а не один объект со списком: ключ
 * активной сессии остался прежним, поэтому обновление приложения никого не
 * разлогинивает.
 */
const KEY = 'velora.session';
const ACCOUNTS = 'velora.accounts';

export type Session = {
  token: string;
  name: string;
};

function read<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem(key) ?? 'null') ?? fallback;
  } catch {
    // Битый ключ лечится повторным входом, а не белым экраном.
    return fallback;
  }
}

const writeAccounts = (accounts: Session[]) =>
  localStorage.setItem(ACCOUNTS, JSON.stringify(accounts));

/**
 * Идентификатор аккаунта — claim `sub` из JWT (это client.id). Имена в списке
 * совпадают запросто, а токен у одного и того же человека меняется при каждом
 * входе, поэтому различаем именно по нему. Подпись здесь не проверяем: это дело
 * бэкенда, тут payload нужен только чтобы не показать один аккаунт дважды.
 */
export function accountId(token: string): string {
  return String(claims(token)?.sub ?? token);
}

function claims(token: string): { sub?: unknown; studio_id?: unknown } | null {
  try {
    const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(payload));
  } catch {
    return null;
  }
}

/**
 * Студия аккаунта — claim `studio_id` из токена (его кладёт бэкенд при выдаче).
 * `null` — «неизвестно»: токен чужой версии или битый. Неизвестность НЕ повод
 * что-то делать с сессией: гадать о студии хуже, чем не знать её.
 */
export function studioOf(token: string): number | null {
  const value = claims(token)?.studio_id;
  return typeof value === 'number' ? value : null;
}

/**
 * Отложить аккаунт, не забывая его: человек ушёл в другую студию, где эта
 * карточка не действует. Отличается от `clearSession` именно этим — выход
 * убирает аккаунт с устройства совсем, а тут он остаётся и вернётся сам, когда
 * человек вернётся в свою студию (см. `reconcileSession`).
 */
export function detachSession() {
  localStorage.removeItem(KEY);
  announceSessionChange();
}

/**
 * Свести активную сессию со студией, которую приложение показывает.
 *
 * Три случая, и все три — про одно: в студии действует только её карточка.
 *  - активная чужая, а карточка этой студии на устройстве есть → включаем её;
 *  - активная чужая, и карточки нет → откладываем, смотрим витрину гостем;
 *  - активной нет, а карточка этой студии на устройстве есть → включаем её
 *    (иначе возвращение из чужой студии выглядело бы как разлогинивание).
 *
 * Возвращает true, если состав сессии изменился и приложение надо перечитать.
 */
export function reconcileSession(studioId: number): boolean {
  const active = getSession();
  const activeStudio = active ? studioOf(active.token) : null;
  if (active && activeStudio === null) return false; // студия неизвестна — не трогаем
  if (active && activeStudio === studioId) return false;

  const local = getAccounts().find((a) => studioOf(a.token) === studioId);
  if (local && (!active || accountId(local.token) !== accountId(active.token))) {
    saveSession(local);
    return true;
  }
  if (active) {
    detachSession();
    return true;
  }
  return false;
}

export const getSession = (): Session | null => read<Session | null>(KEY, null);

/** Аккаунты устройства, активный первым. */
export const getAccounts = (): Session[] => read<Session[]>(ACCOUNTS, []);

/**
 * Сессия сменилась — сообщаем подписчикам (BusinessTermsProvider слушает, чтобы
 * не показать термины прошлой студии). `localStorage` этот модуль подменяет
 * заглушкой и в Node (session.check.ts), а вот `window` там нет вовсе, поэтому
 * событие отправляется только когда есть кому его услышать.
 */
function announceSessionChange() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('session-changed'));
}

/** Вход или переключение: сессия становится активной и поднимается в списке. */
export function saveSession(session: Session) {
  localStorage.setItem(KEY, JSON.stringify(session));
  announceSessionChange();
  const id = accountId(session.token);
  writeAccounts([session, ...getAccounts().filter((a) => accountId(a.token) !== id)]);
}

/**
 * Выход. Аккаунт уходит и из списка: сюда же приходит 401 из api/client.ts, а
 * предлагать переключение на мёртвый токен — обещать то, чего уже нет.
 */
export function clearSession() {
  const active = getSession();
  localStorage.removeItem(KEY);
  announceSessionChange();
  if (active) {
    const id = accountId(active.token);
    writeAccounts(getAccounts().filter((a) => accountId(a.token) !== id));
  }
}
