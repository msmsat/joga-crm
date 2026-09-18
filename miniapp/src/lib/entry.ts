/**
 * Точка входа в мини-приложение: откуда взялись студия и реферальный код.
 *
 * Источников два, и приложение обязано понимать оба:
 *  - Telegram — `start_param` из deep link `t.me/<bot>?startapp=sk3m9x2ptqv`
 *    (или `sk3m9x2ptqv_refABC123` для реферальной ссылки, код приглашения
 *    всегда хвостом после студии);
 *  - браузер / Instagram / QR — путь `/s/k3m9x2ptqv` и `?ref=ABC123`.
 *
 * Студия названа своим публичным кодом — случайными буквами и цифрами
 * (back/services/studio_link.py). Числовые ссылки старого вида (`/s/42`)
 * приложение по-прежнему понимает и передаёт серверу как есть: они уже
 * разошлись по перепискам, и ломать их нельзя. Поэтому тип — строка.
 *
 * Раньше разбор жил прямо в App.tsx и знал только про Telegram — из-за этого
 * заход по обычной ссылке всегда упирался в экран «откройте в Telegram»: сама
 * авторизация была ни при чём, приложению просто неоткуда было узнать студию.
 */

export type Entry = {
  studioRef: string | null;
  referralCode?: string;
  /** Внутри Telegram: определяет и способ входа, и куда Stripe вернёт с оплаты. */
  inTelegram: boolean;
};

/** Вкладки кабинета (NAV_ITEMS). Чужое значение из адреса игнорируем — иначе
 *  опечатка в ссылке открывала бы пустой экран вместо главной. */
const TABS = ['home', 'sched', 'my', 'club', 'prof'];

/**
 * Студия, которую приложение сейчас показывает, — из ссылки или из памяти.
 *
 * Едет в КАЖДЫЙ запрос, а не только в гостевые. Карточка клиента принадлежит
 * одной студии (`Client.studio_id` на бэкенде), и токен через `sub` указывает
 * на эту же карточку — поэтому «где я вошёл» и «куда ведёт ссылка» это разные
 * вопросы, и ответ на второй сервер должен услышать. Пока приложение молчало о
 * ссылке при живой сессии, клиент студии A открывал ссылку студии B и получал
 * студию A целиком: брендинг вплоть до тёмной темы, каталог и расписание.
 *
 * Модульная переменная, а не проп: единственный, кому это нужно, — обёртка над
 * fetch, и тащить студию до неё через все страницы незачем.
 */
let studioRef: string | null = null;

export const setStudioRef = (ref: string | null) => {
  studioRef = ref;
};

export const getStudioRef = (): string | null => studioRef;

/**
 * Последняя студия, которую приложение реально открывало.
 *
 * Ссылка со студией есть не всегда: человек добавил кабинет на домашний экран,
 * вернулся из Stripe, перезагрузил вкладку — адрес остался голым. Пока была
 * сессия, студию называл токен, и поэтому пропажу было не видно; в момент
 * выхода из аккаунта она обнажалась экраном «нужна ссылка студии» — хотя
 * приложение секунду назад держало каталог этой самой студии в руках.
 *
 * Пишется один раз, когда каталог загружен (App.loadCatalog), и работает
 * запасным вариантом для `readEntry`. Ссылка со студией всегда сильнее памяти —
 * иначе старая студия перебивала бы ссылку на новую.
 */
const STUDIO_KEY = 'velora.studio';

export function rememberStudio(studioRef: string | number) {
  try {
    localStorage.setItem(STUDIO_KEY, String(studioRef));
  } catch {
    // Приватный режим/выключенный сторадж: просто не запомним — прежний путь
    // по ссылке от этого не ломается.
  }
}

function recallStudio(): string | null {
  try {
    const stored = localStorage.getItem(STUDIO_KEY);
    // Только то, из чего состоят ссылки: код студии либо её прежний номер.
    // Всё остальное — мусор, оставшийся от чужой версии приложения.
    return stored && /^[A-Za-z0-9]+$/.test(stored) ? stored : null;
  } catch {
    return null;
  }
}

export function readTab(): string | undefined {
  const tab = new URLSearchParams(window.location.search).get('tab');
  return tab && TABS.includes(tab) ? tab : undefined;
}

/**
 * Куда именно ведёт ссылка внутри раздела: на конкретное занятие или на
 * конкретный абонемент.
 *
 * Это адрес QR-кодов, которые студия печатает и выкладывает в сторис
 * (front/src/components/ui/QrShareModal.tsx). Код на занятие обязан открыть
 * ЭТО занятие: у всех занятий студии он иначе одинаковый, и печатать его
 * отдельно для каждого было бы незачем.
 *
 * Дата едет вместе с занятием (`d`) осознанно: расписание грузится по дням, и
 * без неё приложению пришлось бы перебирать дни в поисках номера. Занятия в
 * найденном дне уже нет (отменили, прошло) — ссылка просто открывает этот день,
 * а не пустой экран с ошибкой.
 */
export type DeepLink = {
  lessonId?: number;
  /** `YYYY-MM-DD` — день, в котором искать занятие. */
  date?: string;
  packageId?: number;
  /**
   * Услуга с QR-кода из Каталога. Механику в ссылку не кладём: приложение
   * смотрит её в СВОЁМ каталоге, и напечатанный код переживает превращение
   * услуги из групповой в индивидуальную и обратно.
   */
  serviceId?: number;
};

const numeric = (value: string | null): number | undefined => {
  // Мусор в адресе игнорируем молча: ссылку правят руками и пересылают.
  if (!value || !/^\d+$/.test(value)) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
};

export function readDeepLink(): DeepLink {
  const params = new URLSearchParams(window.location.search);
  const date = params.get('d');
  return {
    lessonId: numeric(params.get('lesson')),
    date: date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : undefined,
    packageId: numeric(params.get('pkg')),
    serviceId: numeric(params.get('service')),
  };
}

function parseStartParam(startParam: string | undefined) {
  // `s<код студии>` до первого `_`: реферальный хвост `_ref<код>` в код студии
  // не попадает, потому что `_` в него не входит.
  if (!startParam) return { studioRef: null, referralCode: undefined };
  const studio = /^s([A-Za-z0-9]+)/.exec(startParam);
  const ref = /_ref([A-Za-z0-9]+)$/.exec(startParam);
  return {
    studioRef: studio ? studio[1] : null,
    referralCode: ref ? ref[1] : undefined,
  };
}

export function readEntry(startParam: string | undefined, inTelegram: boolean): Entry {
  const fromTelegram = parseStartParam(startParam);
  if (fromTelegram.studioRef !== null) {
    return { ...fromTelegram, inTelegram };
  }

  // `/s/k3m9x2ptqv` — путь, а не query: ссылку студия кладёт в bio Instagram и
  // на сайт, она должна читаться как адрес, а не как техническая строка.
  const fromPath = /^\/s\/([A-Za-z0-9]+)/.exec(window.location.pathname);
  const ref = new URLSearchParams(window.location.search).get('ref');
  return {
    // Ссылки нет — берём студию, в которой человек уже был. Выход из аккаунта
    // не должен выкидывать его из студии: он остаётся тем же гостем, которому
    // открыты расписание и запись, а не «человеком без ссылки».
    studioRef: fromPath ? fromPath[1] : recallStudio(),
    referralCode: ref || undefined,
    inTelegram,
  };
}
