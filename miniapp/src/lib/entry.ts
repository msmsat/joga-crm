/**
 * Точка входа в мини-приложение: откуда взялись студия и реферальный код.
 *
 * Источников два, и приложение обязано понимать оба:
 *  - Telegram — `start_param` из deep link `t.me/<bot>?startapp=s42` (или
 *    `s42_refABC123` для реферальной ссылки, код всегда хвостом после студии);
 *  - браузер / Instagram / QR — путь `/s/42` и `?ref=ABC123`.
 *
 * Раньше разбор жил прямо в App.tsx и знал только про Telegram — из-за этого
 * заход по обычной ссылке всегда упирался в экран «откройте в Telegram»: сама
 * авторизация была ни при чём, приложению просто неоткуда было узнать студию.
 */

export type Entry = {
  studioId: number | null;
  referralCode?: string;
  /** Внутри Telegram: определяет и способ входа, и куда Stripe вернёт с оплаты. */
  inTelegram: boolean;
};

/** Вкладки кабинета (NAV_ITEMS). Чужое значение из адреса игнорируем — иначе
 *  опечатка в ссылке открывала бы пустой экран вместо главной. */
const TABS = ['home', 'sched', 'my', 'club', 'prof'];

/**
 * Студия гостя — того, кто открыл ссылку студии, но ещё не входил.
 *
 * Клиенту студию называет токен (`client.studio_id` на бэкенде), гостю — никто:
 * токена у него нет и до самой брони не будет. Поэтому App кладёт сюда студию
 * из ссылки один раз на старте, а api/client.ts подставляет её в запросы, пока
 * сессии нет. Модульная переменная, а не проп: единственный, кому это нужно, —
 * обёртка над fetch, и тащить студию до неё через все страницы незачем.
 */
let guestStudioId: number | null = null;

export const setGuestStudio = (studioId: number | null) => {
  guestStudioId = studioId;
};

export const getGuestStudio = (): number | null => guestStudioId;

export function readTab(): string | undefined {
  const tab = new URLSearchParams(window.location.search).get('tab');
  return tab && TABS.includes(tab) ? tab : undefined;
}

function parseStartParam(startParam: string | undefined) {
  if (!startParam) return { studioId: null, referralCode: undefined };
  const studio = /^s(\d+)/.exec(startParam);
  const ref = /_ref([A-Za-z0-9]+)$/.exec(startParam);
  return {
    studioId: studio ? Number(studio[1]) : null,
    referralCode: ref ? ref[1] : undefined,
  };
}

export function readEntry(startParam: string | undefined, inTelegram: boolean): Entry {
  const fromTelegram = parseStartParam(startParam);
  if (fromTelegram.studioId !== null) {
    return { ...fromTelegram, inTelegram };
  }

  // `/s/42` — путь, а не query: ссылку студия кладёт в bio Instagram и на
  // сайт, она должна читаться как адрес, а не как техническая строка.
  const fromPath = /^\/s\/(\d+)/.exec(window.location.pathname);
  const ref = new URLSearchParams(window.location.search).get('ref');
  return {
    studioId: fromPath ? Number(fromPath[1]) : null,
    referralCode: ref || undefined,
    inTelegram,
  };
}
