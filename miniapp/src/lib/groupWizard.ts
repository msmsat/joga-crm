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
}

export const emptyGroupPick = (day: IsoDay): GroupPick => ({
  day, time: null, serviceId: null, teacherId: null,
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

/**
 * Часы, в которые занятия есть, но записаться нельзя: мест нет или студия
 * закрыла запись. Лента их не прячет — кнопки погашены: «занятия нет» и
 * «занятие есть, но мест нет» — разные ответы, и человек вправе знать второй.
 */
export function closedTimes(lessons: LessonResponse[], pick: GroupPick): number[] {
  const open = new Set(groupTimes(lessons, pick));
  return [...new Set(matching(lessons, pick, 'time').map(startOf))]
    .filter((minute) => !open.has(minute))
    .sort((a, b) => a - b);
}

/** Почему час погашен: открытое, но полное занятие — «мест нет», иначе — запись закрыта. */
export const closedReason = (lessons: LessonResponse[], pick: GroupPick, minute: number): 'full' | 'closed' =>
  matching(lessons, { ...pick, time: minute }).some((row) => row.bookable && spotsLeft(row) <= 0) ? 'full' : 'closed';

/** Занятия, начинающиеся в этот час, — подпись под кнопкой времени. */
export const lessonsAt = (lessons: LessonResponse[], pick: GroupPick, minute: number): LessonResponse[] =>
  lessonsFor(lessons, { ...pick, time: minute });

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
 * Занятие, на которое ведёт выбор: единственный кандидат. Несколько, но
 * человеку их не различить (то же направление у того же тренера) — первый:
 * уточнять дальше нечем, а тупик хуже любого из двух одинаковых.
 */
export function lessonOf(lessons: LessonResponse[], pick: GroupPick): LessonResponse | null {
  const found = candidates(lessons, pick);
  if (found.length === 0) return null;
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
    ? { ...next, time: null }
    : next;
}

/** День пришёл — час, которого в нём под этот выбор нет, снимается. */
export function reconcileGroupTime(pick: GroupPick, lessons: LessonResponse[]): GroupPick {
  if (pick.time === null) return pick;
  return groupTimes(lessons, pick).includes(pick.time) ? pick : { ...pick, time: null };
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

const PARTS: DayPart[] = ['morning', 'afternoon', 'evening'];

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
 * дня, где занятие стоит погашенной кнопкой, а не упирается в ошибку.
 */
export function focusLesson(lessons: LessonResponse[], lessonId: number): LessonResponse | null {
  const found = lessons.find((row) => row.id === lessonId);
  return found && isOffered(found) ? found : null;
}

/** Занятие из списка «несколько в один час»: выбор становится однозначным. */
export const choose = (pick: GroupPick, lesson: LessonResponse): GroupPick => ({
  ...pick, time: startOf(lesson), serviceId: lesson.service_id, teacherId: lesson.teacher_id,
});
