/**
 * Активный токен и «связка ключей» из нескольких аккаунтов.
 *
 * Аккаунт в продукте глобальный (один email — один человек), а студий у него
 * может быть много. Это разные оси: студии переключает `/auth/select-studio`
 * (тот же человек), а здесь мы держим токены РАЗНЫХ людей — чтобы владелец,
 * вошедший ещё и как тренер, менял аккаунты без повторного ввода пароля.
 *
 * Хранилище — localStorage, там же, где всегда лежал единственный `token`.
 * Отдельного риска это не добавляет: токен активного аккаунта и раньше лежал
 * рядом, а срок жизни и отзыв сессии остаются за сервером — протухшую запись
 * связка выбрасывает при первой же неудачной попытке переключения.
 *
 * ЕДИНСТВЕННАЯ точка записи токена в приложении: писать `localStorage.token`
 * мимо `setActiveToken` нельзя — аккаунт не попадёт в связку и «пропадёт» из
 * переключателя ровно так, как это и происходило до появления этого модуля.
 */

const TOKEN_KEY = 'token';
const JAR_KEY = 'accounts';

export interface StoredAccount {
  email: string;
  token: string;
  /** Заполняется после первого `/auth/me` — до него показываем email. */
  name?: string;
}

/** Payload JWT без проверки подписи: только для подсказок UI, не для доступа. */
function decodeToken(token: string): Record<string, unknown> | null {
  try {
    const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = decodeURIComponent(
      atob(base64)
        .split('')
        .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export function getActiveToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getUserRoleFromToken(): string | null {
  const token = getActiveToken();
  if (!token) return null;
  const payload = decodeToken(token);
  return (payload?.role as string) ?? null;
}

/** Email активного аккаунта — по нему связка отличает «этот» от остальных. */
export function getActiveEmail(): string | null {
  const token = getActiveToken();
  if (!token) return null;
  const payload = decodeToken(token);
  return (payload?.sub as string) ?? null;
}

export function listAccounts(): StoredAccount[] {
  try {
    const raw = JSON.parse(localStorage.getItem(JAR_KEY) ?? '[]');
    if (!Array.isArray(raw)) return [];
    return raw.filter((a): a is StoredAccount =>
      Boolean(a && typeof a.email === 'string' && typeof a.token === 'string')
    );
  } catch {
    return [];
  }
}

function saveAccounts(accounts: StoredAccount[]): void {
  localStorage.setItem(JAR_KEY, JSON.stringify(accounts));
}

/**
 * Делает токен активным и кладёт аккаунт в связку.
 *
 * Ключ — email из токена, поэтому смена студии тем же человеком просто
 * обновляет его токен (в нём меняются studio_id и role), а не плодит записи.
 */
export function setActiveToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);

  const email = (decodeToken(token)?.sub as string) ?? null;
  if (!email) return;   // токен нечитаем — активным сделали, в связку не пишем

  const accounts = listAccounts();
  const previous = accounts.find(a => a.email === email);
  saveAccounts([
    { email, token, name: previous?.name },
    ...accounts.filter(a => a.email !== email),
  ]);
}

/**
 * Имя приходит только из `/auth/me` — дописываем его к сохранённой записи.
 *
 * Если записи нет, а токен принадлежит этому же email — заводим её. Так в
 * связку попадает сессия, открытая ДО появления этого модуля: иначе активный
 * аккаунт не показался бы в переключателе до следующего входа вручную.
 */
export function rememberAccountName(email: string, name: string): void {
  const accounts = listAccounts();
  const account = accounts.find(a => a.email === email);

  if (account) {
    if (account.name === name) return;
    account.name = name;
    saveAccounts(accounts);
    return;
  }

  const token = getActiveToken();
  if (token && getActiveEmail() === email) saveAccounts([{ email, token, name }, ...accounts]);
}

/** Убрать аккаунт из связки. Активный при этом перестаёт быть залогиненным. */
export function forgetAccount(email: string): void {
  saveAccounts(listAccounts().filter(a => a.email !== email));
  if (getActiveEmail() === email) localStorage.removeItem(TOKEN_KEY);
}

/**
 * Выход: активный токен выбрасываем и его же убираем из связки — сервер эту
 * сессию отзывает, держать мёртвый токен незачем. Остальные аккаунты остаются.
 */
export function clearActiveToken(): void {
  const email = getActiveEmail();
  localStorage.removeItem(TOKEN_KEY);
  if (email) saveAccounts(listAccounts().filter(a => a.email !== email));
}
