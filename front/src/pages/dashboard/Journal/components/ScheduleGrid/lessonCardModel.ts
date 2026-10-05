// Что говорит карточка занятия в сетке — без разметки и без React.
//
// Карточек два вида, и различаются они не цветом, а тем, кто в них главный:
//  * группа — главное занятие: название услуги, заполненность, кто пришёл;
//  * индивидуальная запись — главный человек: имя клиента, под ним услуга,
//    его посещение и оплата.
// Что из этого поместится, решает размер карточки (BookingCard.css, запросы
// к контейнеру), а не этот модуль: он отдаёт всё, что карточке известно.
import type { Booking } from '../../types';
import { formatIndexToTimeStr, isNoShow } from '../../utils';
import type { LessonPhase } from '../../hooks/useLessonPhase';

export type CardKind = 'solo' | 'group';

export interface CardFace {
  kind: CardKind;
  /** Группа — услуга; индивидуальная — клиент. */
  title: string;
  /** Группа — мастер (если колонка не он) или зал; индивидуальная — услуга. */
  sub: string;
  /** Высокая карточка: индивидуальная — мастер или зал; группа — зал под мастером. */
  extra: string;
  start: string;
  end: string;
  initials: string;
  avatarColor: string;
  booked: number;
  max: number;
  /** Пришли: только с начала занятия. Посещение по умолчанию — «пришёл». */
  came: number | null;
  missed: number;
  unpaid: number;
  /** Индивидуальная: пришёл / не пришёл / ещё рано. */
  visit: 'came' | 'missed' | null;
  /** Индивидуальная: должен / рассчитался / платить нечего или неизвестно. */
  pay: 'paid' | 'unpaid' | null;
}

/** «Анна Новикова» → «Анна Н.»: в карточке шириной с палец фамилия целиком
 *  съедает место, а мастера в студии и так знают по имени. */
export const shortName = (full: string) => {
  const [first, ...rest] = full.trim().split(/\s+/);
  const last = rest.join(' ');
  return last ? `${first} ${last[0]}.` : first ?? '';
};

const initialsOf = (full: string) => {
  const words = full.trim().split(/\s+/).filter(Boolean);
  return ((words[0]?.[0] ?? '') + (words[1]?.[0] ?? '')).toUpperCase() || '·';
};

export function cardFace(
  b: Booking, phase: LessonPhase, showMaster: boolean, titleOverride?: string,
): CardFace {
  const source = b.source;
  const kind: CardKind = source || b.bookingMode === 'resource' ? 'solo' : 'group';
  const service = titleOverride || b.title;
  const master = source
    ? (source.master_name || String(source.event.master_source_id ?? ''))
    : (b.trainerName || '');
  const missed = b.noShows ?? 0;
  const started = phase !== 'upcoming';

  const base = {
    kind,
    start: formatIndexToTimeStr(b.timeStart),
    end: formatIndexToTimeStr(b.timeEnd),
    booked: b.clients,
    max: b.maxClients,
    missed,
    unpaid: b.unpaid ?? 0,
  };

  if (kind === 'group') {
    return {
      ...base,
      title: service,
      sub: showMaster && master ? shortName(master) : b.hall,
      extra: showMaster && master ? b.hall : '',
      initials: '',
      avatarColor: b.color,
      came: started && b.status !== 'cancelled' ? Math.max(b.attended ?? 0, b.clients - missed, 0) : null,
      visit: null,
      pay: null,
    };
  }

  const client = source ? source.client_name : b.clientName;
  const noShow = isNoShow(b);
  const visit = noShow ? 'missed'
    : b.clients > 0 && ((b.attended ?? 0) > 0 || started) ? 'came' : null;
  // «Оплачено» — только когда сервер прислал счёт неоплативших: у карточки,
  // нарисованной до ответа, его нет, и молчать там честнее, чем обещать.
  const pay = base.unpaid > 0 ? 'unpaid'
    : b.unpaid !== undefined && b.price > 0 && b.clients > 0 ? 'paid' : null;
  return {
    ...base,
    title: client || service,
    sub: client ? service : '',
    // Импорт из Bumpix живёт вне колонок мастеров — его мастер подписан всегда.
    extra: (showMaster || source) && master ? shortName(master) : b.hall,
    initials: client ? initialsOf(client) : '',
    avatarColor: b.clientColor || b.color,
    came: null,
    visit: b.status === 'cancelled' || source ? null : visit,
    pay: b.status === 'cancelled' || source ? null : pay,
  };
}
