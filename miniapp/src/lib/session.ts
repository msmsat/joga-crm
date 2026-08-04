/**
 * Ключ клиента мини-приложения.
 *
 * Ключ один на всё устройство и НЕ привязан к студии — именно поэтому переход
 * в другую студию не спрашивает ни регистрацию, ни вход: аккаунт общий, студия
 * это просто выбранный контент. Пока бэкенд не выдаёт JWT, ключом служит сама
 * сохранённая сессия; появится токен — ляжет в поле token и уедет в заголовок.
 */
const KEY = 'velora.session';

export type Session = {
  /** id из Telegram, а вне Telegram — выданный устройству (см. newDeviceId) */
  tg_id: number;
  name: string;
  phone: string | null;
  token?: string | null;
};

export function getSession(): Session | null {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? 'null');
  } catch {
    // Битый ключ лечится повторным знакомством, а не белым экраном.
    return null;
  }
}

export const saveSession = (session: Session) =>
  localStorage.setItem(KEY, JSON.stringify(session));

export const clearSession = () => localStorage.removeItem(KEY);

/**
 * ponytail: вне Telegram у клиента нет tg_id, а бэкенд хранит профиль именно по
 * нему. Берём отрицательное число — диапазон, которого у настоящих аккаунтов
 * Telegram не бывает, поэтому пересечься с чужим id невозможно.
 *
 * Источник — CSPRNG, а не Math.random: бэкенд пускает к профилю по одному лишь
 * tg_id в URL (`/users/{tg_id}/profile`), то есть id де-факто работает паролем,
 * и предсказуемая последовательность отдала бы чужие профили. 48 бит энтропии
 * это лечат лишь отчасти: id всё равно ходит в открытом пути запроса. Настоящее
 * лечение — токен в заголовке Authorization, но он требует эндпоинта на стороне
 * бэкенда (его в этом репозитории нет), поэтому здесь только источник случайности.
 */
export const newDeviceId = () => {
  const [high, low] = crypto.getRandomValues(new Uint32Array(2));
  const raw = high * 0x10000 + (low & 0xffff); // 48 бит — заведомо < 2^53
  return -(1e11 + (raw % 8e11));
};
