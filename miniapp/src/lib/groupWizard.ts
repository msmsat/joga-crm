/**
 * Мастер записи на ГРУППОВОЕ занятие с главной: время, направление и тренер —
 * в любом порядке, как у индивидуальной записи (`lib/wizard.ts`).
 *
 * Разница одна, но она меняет модель: у группы нечего «собирать». Занятие уже
 * стоит в расписании со своим часом, направлением и тренером, и выбор не
 * складывает запись из частей, а сужает список занятий дня до одного. Поэтому
 * обязателен здесь только час: направление и тренер — уточнения, и когда в
 * выбранный час занятие одно, они выводятся из него сами.
 *
 * ИСТОЧНИК — занятия дня `GET /global/lessons/date/{day}`, один запрос на день.
 * Предлагаются только те, на которые можно записаться прямо сейчас: правила
 * студии пускают и есть свободное место. Своя бронь предлагается всегда — на
 * итоге у неё отмена или второй коврик.
 *
 * Модуль без React: его проверяет `node src/lib/groupWizard.check.ts`.
 */
import type { LessonDay, LessonResponse } from '../api/lessons';
import type { DayPart, IsoDay } from './slots.ts';
import { minutesOf, partOf, type WizardStep } from './wizard.ts';

export interface GroupPick {
  day: IsoDay;
  /** Минуты от местной полуночи; `null` — час ещё не выбран. */
  time: number | null;
  serviceId: number | null;
  /** `users.id` тренера, названного человеком. Выведенный из занятия сюда не пишется. */
  teacherId: number | null;
  /**
   * Занятие, выбранное карточкой во «Времени». Час, направление и тренер его
   * называют не всегда: два одинаковых занятия в один час в разных филиалах
   * отличаются только им. Сам выбор не сужает — лишь говорит, какое из
   * подходящих имелось в виду.
   */
  lessonId: number | null;
}

export const emptyGroupPick = (day: IsoDay): GroupPick => ({
  day, time: null, serviceId: null, teacherId: null, lessonId: null,
});

export const spotsLeft = (lesson: LessonResponse): number =>
  lesson.total_spots - (lesson.taken_spots?.length ?? 0);

/** Занятие, которое мастер предлагает: своя бронь — всегда, чужое — открытое и не полное. */
export const isOffered = (lesson: LessonResponse): boolean =>
  Boolean(lesson.is_booked_by_user) || (lesson.bookable && spotsLeft(lesson) > 0);

/** Начало занятия минутами от местной полуночи (`time` сервер отдаёт по часам студии). */
export const startOf = (lesson: LessonResponse): number => minutesOf(lesson.time);

type Field = 'time' | 'service' | 'teacher';

/** Все занятия дня под выбор — и открытые, и нет. `skip` — поле, чей список строится: оно не сужает. */
function matching(lessons: LessonResponse[], pick: GroupPick, skip?: Field): LessonResponse[] {
  return lessons.filter((lesson) =>
    (skip === 'time' || pick.time === null || startOf(lesson) === pick.time)
    && (skip === 'service' || pick.serviceId === null || lesson.service_id === pick.serviceId)
    && (skip === 'teacher' || pick.teacherId === null || lesson.teacher_id === pick.teacherId));
}

/** Предложенные занятия под выбор — те, куда можно записаться. */
const lessonsFor = (lessons: LessonResponse[], pick: GroupPick, skip?: Field): LessonResponse[] =>
  matching(lessons, pick, skip).filter(isOffered);

/** Часы дня под выбранные направление и тренера — по возрастанию, без повторов. */
export function groupTimes(lessons: LessonResponse[], pick: GroupPick): number[] {
  return [...new Set(lessonsFor(lessons, pick, 'time').map(startOf))].sort((a, b) => a - b);
}

// ─── Карточки дня ─────────────────────────────────────────────────────────────

const PARTS: DayPart[] = ['morning', 'afternoon', 'evening'];

/**
 * Что с занятием для этого человека: своя бронь, можно записаться, мест нет
 * или студия закрыла запись. Полное и закрытое не прячутся — карточка
 * погашена с причиной: «занятия нет» и «занятие есть, но мест нет» — разные
 * ответы, и человек вправе знать второй. Закрытое и полное разом — «закрыто»:
 * освободись место, записаться всё равно нельзя.
 */
export type SlotState = 'mine' | 'open' | 'full' | 'closed';

export const slotState = (lesson: LessonResponse): SlotState =>
  lesson.is_booked_by_user ? 'mine'
    : !lesson.bookable ? 'closed'
    : spotsLeft(lesson) <= 0 ? 'full'
    : 'open';

export interface DaySlot {
  lesson: LessonResponse;
  state: SlotState;
  /** Свободных мест, не меньше нуля. */
  left: number;
}

/**
 * Занятия дня карточками — все, и открытые, и нет, под выбранные направление и
 * тренера (час не сужает: его выбирают здесь же). По началу; одновременные —
 * по номеру, чтобы свежий ответ сервера не переставлял их местами.
 */
export const daySlots = (lessons: LessonResponse[], pick: GroupPick): DaySlot[] =>
  matching(lessons, pick, 'time')
    .map((lesson) => ({ lesson, state: slotState(lesson), left: Math.max(0, spotsLeft(lesson)) }))
    .sort((a, b) => startOf(a.lesson) - startOf(b.lesson) || a.lesson.id - b.lesson.id);

/** Карточки по частям дня — утро, день, вечер; пустые части не идут. */
export const slotsByPart = (slots: DaySlot[]): { part: DayPart; slots: DaySlot[] }[] =>
  PARTS
    .map((part) => ({ part, slots: slots.filter((slot) => partOf(startOf(slot.lesson)) === part) }))
    .filter((group) => group.slots.length > 0);

/** Направления, на которые в дне есть занятие под остальной выбор. */
export const serviceIdsOf = (lessons: LessonResponse[], pick: GroupPick): Set<number> =>
  new Set(lessonsFor(lessons, pick, 'service').flatMap((row) => (row.service_id === null ? [] : [row.service_id])));

/** Тренеры, у которых в дне есть занятие под остальной выбор. */
export const teacherIdsOf = (lessons: LessonResponse[], pick: GroupPick): Set<number> =>
  new Set(lessonsFor(lessons, pick, 'teacher').flatMap((row) => (row.teacher_id === null ? [] : [row.teacher_id])));

/** Часы конкретного направления или тренера в дне — подсказка в их строке. */
export const timesOf = (lessons: LessonResponse[], match: (lesson: LessonResponse) => boolean): number[] =>
  [...new Set(lessons.filter((row) => isOffered(row) && match(row)).map(startOf))].sort((a, b) => a - b);

/** Всё, что подходит под выбор. Без часа кандидатов нет: занятие называет именно он. */
export const candidates = (lessons: LessonResponse[], pick: GroupPick): LessonResponse[] =>
  pick.time === null ? [] : lessonsFor(lessons, pick);

/**
 * Занятие, на которое ведёт выбор: выбранное карточкой, пока оно подходит,
 * иначе единственный кандидат. Несколько, но человеку их не различить (то же
 * направление у того же тренера) — первый: уточнять дальше нечем, а тупик
 * хуже любого из двух одинаковых.
 */
export function lessonOf(lessons: LessonResponse[], pick: GroupPick): LessonResponse | null {
  const found = candidates(lessons, pick);
  if (found.length === 0) return null;
  const chosen = found.find((row) => row.id === pick.lessonId);
  if (chosen) return chosen;
  const alike = found.every((row) => row.service_id === found[0].service_id && row.teacher_id === found[0].teacher_id);
  return alike ? found[0] : null;
}

/** Раздел сделан: названо человеком или выведено из занятия. */
export const isGroupChosen = (pick: GroupPick, lesson: LessonResponse | null, step: WizardStep): boolean =>
  step === 'time' ? pick.time !== null
    : step === 'service' ? pick.serviceId !== null || lesson !== null
    : step === 'master' ? pick.teacherId !== null || lesson !== null
    : lesson !== null;

/**
 * Куда вести после выбора. Занятие сложилось — на итог. Часа нет — во
 * «Время»: без него записаться не на что, а направление и тренер уже сузили
 * его список. Час есть, но занятий в нём несколько — уточнять тем, что не
 * названо.
 */
export function nextGroupStep(pick: GroupPick, lesson: LessonResponse | null): WizardStep {
  if (lesson) return 'summary';
  if (pick.time === null) return 'time';
  if (pick.serviceId === null) return 'service';
  if (pick.teacherId === null) return 'master';
  return 'summary';
}

/**
 * Смена направления или тренера. Час, в который так не бывает, снимается —
 * иначе итог обещал бы занятие, которого нет. Пока день не пришёл
 * (`lessons === null`), час не трогаем: снимать его вслепую — терять выбор.
 */
export function withChoice(
  lessons: LessonResponse[] | null,
  pick: GroupPick,
  change: Partial<Pick<GroupPick, 'serviceId' | 'teacherId'>>,
): GroupPick {
  const next = { ...pick, ...change };
  return next.time !== null && lessons !== null && lessonsFor(lessons, next).length === 0
    ? { ...next, time: null, lessonId: null }
    : next;
}

/** День пришёл — час, которого в нём под этот выбор нет, снимается. */
export function reconcileGroupTime(pick: GroupPick, lessons: LessonResponse[]): GroupPick {
  if (pick.time === null) return pick;
  return groupTimes(lessons, pick).includes(pick.time) ? pick : { ...pick, time: null, lessonId: null };
}

// ─── Отметки ленты дней ───────────────────────────────────────────────────────
//
// Сводка `GET /global/lessons/days` — одним запросом на всю ленту: в какие часы
// каждого дня есть занятия, куда можно записаться. Лента рисует по ней ритм
// дня, а мастер — не открывает человека на пустом дне.

/** Часы занятий по дням, минутами. Дня нет в объекте — записаться в нём некуда. */
export type DayMarks = Record<IsoDay, number[]>;

export const marksOf = (days: LessonDay[]): DayMarks =>
  Object.fromEntries(days.map((row) => [row.day, row.times.map(minutesOf)]));

/** Ритм дня — есть ли занятия утром, днём и вечером. Всегда три, по порядку. */
export const rhythmOf = (times: number[]): { part: DayPart; lit: boolean }[] =>
  PARTS.map((part) => ({ part, lit: times.some((minute) => partOf(minute) === part) }));

/** Ближайший после `after` день ленты, в котором есть занятия. */
export const nextMarked = (days: IsoDay[], marks: DayMarks, after: IsoDay): IsoDay | null =>
  days.find((day) => day > after && (marks[day]?.length ?? 0) > 0) ?? null;

/**
 * С какого дня открыть ленту, когда пришли отметки. Сегодня пусто, а человек
 * ещё ничего не трогал (день — сегодняшний, час не выбран) — на первый день с
 * занятиями: открывать пустой день, когда завтра их пять, значит заставлять
 * искать то, что приложение уже знает. Выбранный руками день не трогаем.
 */
export function openingDay(pick: GroupPick, today: IsoDay, days: IsoDay[], marks: DayMarks): IsoDay {
  if (pick.day !== today || pick.time !== null || (marks[today]?.length ?? 0) > 0) return pick.day;
  return nextMarked(days, marks, today) ?? pick.day;
}

/**
 * Занятие из QR-кода студии в пришедшем дне. Найдено и на него можно
 * записаться — выбор складывается в него, лист идёт на итог. Не найдено
 * (отменили, прошло) или мест нет — `null`: человек остаётся на «Времени» этого
 * дня, где занятие стоит погашенной карточкой, а не упирается в ошибку.
 */
export function focusLesson(lessons: LessonResponse[], lessonId: number): LessonResponse | null {
  const found = lessons.find((row) => row.id === lessonId);
  return found && isOffered(found) ? found : null;
}

/**
 * Занятие карточкой во «Времени» или из списка «несколько в один час»: выбор
 * становится однозначным. Направление и тренер не пишутся — они выводятся из
 * занятия (`lessonOf`), а названные сузили бы «Время» до этого одного занятия:
 * вернувшись выбрать другое, человек увидел бы только уже выбранное.
 */
export const choose = (pick: GroupPick, lesson: LessonResponse): GroupPick => ({
  ...pick, time: startOf(lesson), lessonId: lesson.id,
});

/**
 * Другой день — другое занятие: выбранное карточкой уходит вместе с часом.
 * Иначе в новом дне «сложилось» бы занятие в тот же час, которого человек не
 * выбирал. Направление и тренер, названные во вкладках, остаются.
 */
export const withDay = (pick: GroupPick, day: IsoDay): GroupPick =>
  day === pick.day ? pick : { ...pick, day, time: null, lessonId: null };
