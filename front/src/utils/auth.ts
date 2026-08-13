/**
 * Активный токен и память о недавних аккаунтах.
 *
 * Аккаунт в продукте глобальный (один email — один человек), а студий у него
 * может быть много. Это разные оси: студии переключает `/auth/select-studio`
 * (тот же человек, новый токен), а смена аккаунта — это смена человека.
 *
 * ЖИВОЙ ТОКЕН РОВНО ОДИН — у активного аккаунта. Сменил человека: токен
 * прежнего немедленно забывается, и «переключиться обратно» без пароля нельзя.
 * Раньше связка держала токены всех входивших, и один открытый браузер означал
 * несколько живых сессий разных людей сразу.
 *
 * От прежних аккаунтов остаётся только email с именем — чтобы вернуться было
 * куда: список показывается в профиле и на входе, вход по нему обычный, с
 * паролем.
 *
 * Хранилище — localStorage, там же, где всегда лежал единственный `token`.
 *
 * ЕДИНСТВЕННАЯ точка записи токена в приложении: писать `localStorage.token`
 * мимо `setActiveToken` нельзя — иначе аккаунт не попадёт в список недавних, а
 * токен прежнего останется жить.
 */

// Напрямую из файла, не из бочки `../api`: та тянет client.ts, который импортирует
// этот модуль — получился бы цикл. queryClient.ts не зависит ни от чего своего.
import { queryClient } from '../api/queryClient';
// Только тип — на рантайм не влияет и цикла не создаёт (файл типов ничего не импортирует).
import type { StudioRole } from '../api/analytics/analytics.types';

const TOKEN_KEY = 'token';
const JAR_KEY = 'accounts';
/**
 * Затравка темы — ПО АККАУНТУ (`velora_theme:<email>`), а не одна на браузер.
 * Так решаются обе задачи разом: вернулся в свой аккаунт — кабинет чёрный с
 * первого кадра, без вспышки светлым в ожидании `GET /settings/appearance`;
 * а на общем компьютере следующий вошедший читает СВОЙ ключ и чужую тёмную
 * не наследует. Именно поэтому затравка переживает выход — стирать её незачем.
 *
 * Префикс продублирован в инлайн-скрипте index.html (он стартует до React и
 * импортов не имеет) — менять только вместе с ним.
 */
const THEME_KEY_PREFIX = 'velora_theme:';

/** Тема активного аккаунта, известная с прошлого раза. Нет аккаунта — нет и затравки. */
export function readThemeSeed(): string | null {
  const email = getActiveEmail();
  return email ? localStorage.getItem(THEME_KEY_PREFIX + email) : null;
}

export function saveThemeSeed(theme: string): void {
  const email = getActiveEmail();
  if (email) localStorage.setItem(THEME_KEY_PREFIX + email, theme);
}

export interface StoredAccount {
  email: string;
  /** Заполняется после первого `/auth/me` — до него показываем email. */
  name?: string;
  /** Есть ТОЛЬКО у активного аккаунта: у остальных живого токена не бывает. */
  token?: string;
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

const ROLES: StudioRole[] = ['owner', 'admin', 'trainer'];

/**
 * Роль для подсказок UI (что рисовать, какие запросы слать). Не распозналась —
 * падаем в минимальные права, не в максимальные: доступ всё равно решает сервер,
 * а лишний owner-запрос от тренера вернул бы 403 и сломал экран.
 */
export function getStudioRole(): StudioRole {
  const raw = getUserRoleFromToken();
  return ROLES.includes(raw as StudioRole) ? (raw as StudioRole) : 'trainer';
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
    return raw.filter((a): a is StoredAccount => Boolean(a && typeof a.email === 'string'));
  } catch {
    return [];
  }
}

/** Аккаунты, в которые уже входили на этом устройстве, кроме активного. */
export function listRecentAccounts(): StoredAccount[] {
  const active = getActiveEmail();
  return listAccounts().filter(a => a.email !== active);
}

function saveAccounts(accounts: StoredAccount[]): void {
  localStorage.setItem(JAR_KEY, JSON.stringify(accounts));
}

/**
 * Делает токен активным; прежний аккаунт остаётся в списке недавних, но БЕЗ
 * токена — сменил человека, и старая сессия в браузере не живёт.
 *
 * Ключ — email из токена, поэтому смена студии тем же человеком просто
 * обновляет его токен (в нём меняются studio_id и role), а не плодит записи и
 * ничего не забывает.
 */
export function setActiveToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
  // Сменилась личность — кэш квери набит данными прежней (тема, студии, профиль).
  // Без этого дефолтный staleTime 30s держит на экране чужой кабинет до полминуты.
  // Чистим здесь, а не на каждом входе: точек входа восемь, забыть — вопрос времени.
  //
  // Именно reset, а не clear: clear() ВЫБРАСЫВАЕТ query из кэша, и подписчики,
  // которые в этот момент на экране (тема, шапка, профиль в меню), остаются
  // привязаны к удалённому — с пустыми данными и без единого повторного запроса
  // до перезагрузки страницы. Так кабинет и белел после смены студии: тема
  // читала «данных нет» как light. reset обнуляет то же самое, но активные
  // запросы переспрашивает сразу — уже с новым токеном.
  queryClient.resetQueries();

  const email = (decodeToken(token)?.sub as string) ?? null;
  if (!email) return;   // токен нечитаем — активным сделали, в список не пишем

  const accounts = listAccounts();
  const previous = accounts.find(a => a.email === email);
  saveAccounts([
    { email, token, name: previous?.name },
    // Инвариант «живой токен только у активного» держим здесь, а не в вызывающем:
    // так его нельзя обойти, забыв про него на новом пути входа.
    ...accounts.filter(a => a.email !== email).map(a => ({ email: a.email, name: a.name })),
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

// Разовая уборка при загрузке приложения: до этой версии связка держала ЖИВЫЕ
// токены всех аккаунтов, входивших на устройстве. Просто перестать их писать
// мало — уже сохранённые надо выбросить, иначе чужие сессии останутся лежать в
// браузере до следующего входа.
(function dropForeignTokens(): void {
  const active = getActiveEmail();
  const accounts = listAccounts();
  if (!accounts.some(a => a.token && a.email !== active)) return;
  saveAccounts(accounts.map(a => (a.email === active ? a : { email: a.email, name: a.name })));
})();

/** Убрать аккаунт из списка недавних. Активный при этом разлогинивается. */
export function forgetAccount(email: string): void {
  saveAccounts(listAccounts().filter(a => a.email !== email));
  // Забыли аккаунт — забываем и его тему: следов на устройстве не остаётся.
  localStorage.removeItem(THEME_KEY_PREFIX + email);
  if (getActiveEmail() === email) clearActiveToken();
}

/**
 * Выход: токен выбрасываем (сервер эту сессию отзывает), а email оставляем в
 * недавних — чтобы вход обратно был в один клик по своей же карточке. Затравку
 * темы намеренно НЕ трогаем: она под своим email и нужна, чтобы вернувшийся
 * увидел свой кабинет сразу чёрным.
 */
export function clearActiveToken(): void {
  const email = getActiveEmail();
  localStorage.removeItem(TOKEN_KEY);
  queryClient.clear();   // вышли — данные аккаунта в памяти не оставляем
  if (!email) return;
  saveAccounts(listAccounts().map(a => (a.email === email ? { email: a.email, name: a.name } : a)));
}
