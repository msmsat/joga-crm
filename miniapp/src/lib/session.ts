/**
 * Сессия клиента мини-приложения.
 *
 * Ключ — JWT из POST /global/auth/telegram (`get_current_client` на бэкенде
 * проверяет его на каждом запросе). Токен не привязан к студии: переход в
 * другую студию не спрашивает повторный вход — аккаунт общий, студия это
 * просто выбранный контент.
 */
const KEY = 'velora.session';

export type Session = {
  token: string;
  name: string;
};

export function getSession(): Session | null {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? 'null');
  } catch {
    // Битый ключ лечится повторным входом, а не белым экраном.
    return null;
  }
}

export const saveSession = (session: Session) =>
  localStorage.setItem(KEY, JSON.stringify(session));

export const clearSession = () => localStorage.removeItem(KEY);
