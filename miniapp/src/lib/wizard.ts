/**
 * Мастер записи с главной: время, услуга и мастер — в любом порядке.
 *
 * Человек начинает с того, что для него главное: «хочу в 18:00», «хочу к
 * Анне», «хочу на массаж». Каждый следующий раздел показывает только то, что
 * совместимо с уже выбранным, — поэтому противоречивого выбора не бывает, и
 * отдельного состояния «конфликт», как в журнале, здесь нет.
 *
 * ИСТОЧНИК ВРЕМЕНИ — снимок дня `GET /global/availability/services`: по каждой
 * паре «услуга × филиал» свободные начала минутами от полуночи, общие и по
 * мастерам. Считает их сервер; модуль только пересекает множества. Конкретный
 * момент (`starts_at`) для quote берётся потом у `availability` выбранной услуги.
 *
 * Модуль без React: его проверяет `node src/lib/wizard.check.ts`.
 */
import type { ResourceStaffMember, ServiceDayRow } from '../api/hybrid.types';
import { ANY, type MasterChoice } from './bookingPage.ts';
import type { DayPart, IsoDay } from './slots.ts';

export type WizardStep = 'time' | 'service' | 'master' | 'summary';
/** Порядок вкладок в шапке и свайпа по листу. */
export const STEPS: WizardStep[] = ['time', 'service', 'master', 'summary'];
const WITHOUT_MASTER: WizardStep[] = ['time', 'service', 'summary'];

/**
 * Разделы листа. Мастер в студии один — раздела «Мастер» нет: выбирать не из
 * кого, и вкладка с одной строкой была бы лишним шагом. Мастер подставляется
 * сам (`withSoloMaster`) и виден на итоге.
 */
export const stepsFor = (soloMaster: boolean): WizardStep[] => (soloMaster ? WITHOUT_MASTER : STEPS);

/** Раздел, которого в листе нет, ведёт на итог: выбирать в нём нечего. */
export const shownStep = (step: WizardStep, steps: WizardStep[]): WizardStep =>
  steps.includes(step) ? step : 'summary';

export interface WizardPick {
  day: IsoDay;
  /** Минуты от местной полуночи; `null` — время ещё не выбрано. */
  time: number | null;
  serviceId: number | null;
  /** `users.id` мастера, «любой» или ещё не выбран. */
  master: MasterChoice | null;
  /** Филиал, если адресов несколько; один — выводится сам (`branchOf`). */
  branchId: number | null;
}

export const emptyPick = (day: IsoDay): WizardPick => ({
  day, time: null, serviceId: null, master: null, branchId: null,
});

export const minutesOf = (hhmm: string): number => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
export const hhmm = (minutes: number): string =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

/** Части дня — те же пороги, что у листа времени (`slots.dayPart`). */
export const partOf = (minutes: number): DayPart =>
  minutes < 12 * 60 ? 'morning' : minutes < 17 * 60 ? 'afternoon' : 'evening';

export function groupMinutes(times: number[]): { part: DayPart; times: number[] }[] {
  const parts: DayPart[] = ['morning', 'afternoon', 'evening'];
  return parts
    .map((part) => ({ part, times: times.filter((minute) => partOf(minute) === part) }))
    .filter((group) => group.times.length > 0);
}

/** Свободные начала строки: у мастера — его, у «любого» — общие. */
const freeOf = (row: ServiceDayRow, master: MasterChoice | null): number[] =>
  typeof master === 'number' ? row.free_by_teacher[String(master)] ?? [] : row.free;

/** Строки снимка, подходящие под выбор (кроме времени). */
function rowsFor(rows: ServiceDayRow[], pick: Pick<WizardPick, 'serviceId' | 'master' | 'branchId'>): ServiceDayRow[] {
  return rows.filter((row) =>
    (pick.serviceId === null || row.service_id === pick.serviceId)
    && (pick.branchId === null || row.branch_id === pick.branchId)
    && (typeof pick.master !== 'number' || String(pick.master) in row.free_by_teacher));
}

/** Свободные начала дня под текущий выбор — по возрастанию, без повторов. */
export function freeTimes(rows: ServiceDayRow[], pick: WizardPick): number[] {
  const all = new Set<number>();
  for (const row of rowsFor(rows, pick)) for (const minute of freeOf(row, pick.master)) all.add(minute);
  return [...all].sort((a, b) => a - b);
}

/** Есть ли под выбор хоть одно окно — с учётом времени, если оно названо. */
const fits = (rows: ServiceDayRow[], pick: WizardPick): boolean =>
  rowsFor(rows, pick).some((row) => {
    const free = freeOf(row, pick.master);
    return pick.time === null ? free.length > 0 : free.includes(pick.time);
  });

/**
 * Услуги раздела «Услуга». Мастер выбран — только его услуги; время названо —
 * только те, на которые в этот час есть окно. Без времени список не сужается
 * снимком дня: человек может выбрать услугу, а день — потом.
 */
export function serviceChoices(
  serviceIds: number[], staff: ResourceStaffMember[], rows: ServiceDayRow[], pick: WizardPick,
): number[] {
  const member = typeof pick.master === 'number' ? staff.find((row) => row.teacher_id === pick.master) : null;
  return serviceIds.filter((id) => {
    if (member && !member.service_ids.includes(id)) return false;
    return pick.time === null || fits(rows, { ...pick, serviceId: id });
  });
}

/** Мастера раздела «Мастер»: делают выбранную услугу и свободны в названный час. */
export function masterChoices(staff: ResourceStaffMember[], rows: ServiceDayRow[], pick: WizardPick): ResourceStaffMember[] {
  return staff.filter((member) => {
    if (pick.serviceId !== null && !member.service_ids.includes(pick.serviceId)) return false;
    return pick.time === null || fits(rows, { ...pick, master: member.teacher_id });
  });
}

/** Филиалы, где выбранное складывается целиком: услуга, мастер и время. */
export function branchChoices(rows: ServiceDayRow[], pick: WizardPick): number[] {
  if (pick.serviceId === null || pick.time === null) return [];
  const ids = rowsFor(rows, { ...pick, branchId: null })
    .filter((row) => freeOf(row, pick.master).includes(pick.time!))
    .map((row) => row.branch_id);
  return [...new Set(ids)].sort((a, b) => a - b);
}

/** Филиал записи: выбранный, если он ещё подходит, иначе единственный возможный. */
export function branchOf(rows: ServiceDayRow[], pick: WizardPick): number | null {
  const options = branchChoices(rows, pick);
  if (pick.branchId !== null && options.includes(pick.branchId)) return pick.branchId;
  return options.length === 1 ? options[0] : null;
}

export const isChosen = (pick: WizardPick, step: WizardStep): boolean =>
  step === 'time' ? pick.time !== null
    : step === 'service' ? pick.serviceId !== null
    : step === 'master' ? pick.master !== null
    : isComplete(pick);

export const isComplete = (pick: WizardPick): boolean =>
  pick.time !== null && pick.serviceId !== null && pick.master !== null;

/**
 * Куда вести после выбора в разделе `from`: в ближайший по кругу НЕвыбранный
 * раздел, а когда выбрано всё — на итог. Тот же ход, что у мастера журнала.
 */
export function nextStep(pick: WizardPick, from: WizardStep): WizardStep {
  const order: WizardStep[] = ['time', 'service', 'master'];
  const start = Math.max(0, order.indexOf(from));
  for (let i = 1; i <= order.length; i++) {
    const step = order[(start + i) % order.length];
    if (!isChosen(pick, step)) return step;
  }
  return 'summary';
}

/**
 * Время, которого в снимке дня нет, снимается — иначе итог обещал бы окно,
 * которого не существует. Зовётся, когда снимок дня приехал: при смене дня
 * его ещё нет, и снимать время вслепую значило бы терять его на каждом тапе.
 */
export function reconcileTime(pick: WizardPick, rows: ServiceDayRow[]): WizardPick {
  if (pick.time === null) return pick;
  return freeTimes(rows, { ...pick, time: null }).includes(pick.time) ? pick : { ...pick, time: null };
}

/** Смена услуги снимает мастера, который её не делает. */
export function onService(pick: WizardPick, serviceId: number, staff: ResourceStaffMember[]): WizardPick {
  const member = typeof pick.master === 'number' ? staff.find((row) => row.teacher_id === pick.master) : null;
  const keepMaster = pick.master === ANY || pick.master === null || Boolean(member?.service_ids.includes(serviceId));
  return { ...pick, serviceId, master: keepMaster ? pick.master : null };
}

/** «Любой» имеет смысл, когда выбирать есть из кого. */
export const offerAny = (choices: ResourceStaffMember[]): boolean => choices.length >= 2;

/** Единственный мастер — номер его, иначе `null`. */
export const soloOf = (staff: ResourceStaffMember[]): number | null =>
  staff.length === 1 ? staff[0].teacher_id : null;

/**
 * Мастер один — он и выбран, пока человек не назвал другого (QR-кодом). Выбор
 * не хранится, а выводится: список мастеров приходит после открытия листа, и
 * подставлять его в состояние значило бы гоняться за ответом сети.
 */
export const withSoloMaster = (pick: WizardPick, solo: number | null): WizardPick =>
  solo !== null && pick.master === null ? { ...pick, master: solo } : pick;
