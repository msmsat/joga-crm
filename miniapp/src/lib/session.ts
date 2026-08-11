/**
 * Сессия клиента мини-приложения.
 *
 * Ключ — JWT из POST /global/auth/telegram (`get_current_client` на бэкенде
 * проверяет его на каждом запросе). Токен не привязан к студии: переход в
 * другую студию не спрашивает повторный вход — аккаунт общий, студия это
 * просто выбранный контент.
 *
 * Аккаунтов на устройстве бывает несколько (своя карточка и карточка ребёнка,
 * личная и рабочая почта). Активный лежит в `velora.session` — его и только его
 * читает api/client.ts; все, в которые уже входили, — в `velora.accounts`.
 * Два ключа, а не один объект со списком: ключ активной сессии остался прежним,
 * поэтому обновление приложения никого не разлогинивает.
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
  try {
    const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return String(JSON.parse(atob(payload)).sub);
  } catch {
    return token;
  }
}

export const getSession = (): Session | null => read<Session | null>(KEY, null);

/** Аккаунты устройства, активный первым. */
export const getAccounts = (): Session[] => read<Session[]>(ACCOUNTS, []);

/** Вход или переключение: сессия становится активной и поднимается в списке. */
export function saveSession(session: Session) {
  localStorage.setItem(KEY, JSON.stringify(session));
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
  if (active) {
    const id = accountId(active.token);
    writeAccounts(getAccounts().filter((a) => accountId(a.token) !== id));
  }
}
