/**
 * Экран «Записатись» как конечный автомат, а не набор разрозненных useState.
 *
 * СОСТОЯНИЕ: филиалы (или «все») · услуга-фильтр (или «все») · выбранный
 * мастер (или «любой») · открытый лист. День, слот и quote живут в
 * `useResourceBooking` — это домен записи, общий с главной и «Моими записями»;
 * здесь только то, КАК человек к нему пришёл.
 *
 * ДВА ПУТИ К ОДНОМУ ЛИСТУ:
 *   A. услуга → мастер → время: лист открывается сразу на времени;
 *   B. мастер → его услуга → время: лист начинается с услуг ЭТОГО мастера.
 * Без услуги время не спросить — длительность, цена и сама доступность зависят
 * от неё. Поэтому мастер без услуги ведёт в выбор услуги, а не в календарь.
 *
 * ФИЛИАЛОВ ВЫБРАНО НЕСКОЛЬКО, А ВРЕМЯ — ПО ОДНОМУ АДРЕСУ. Мастера собираются со
 * всех выбранных филиалов, но слоты и бронь сервер считает для конкретного.
 * Мастер (или «любой») с несколькими адресами получает в листе шаг «где» между
 * услугой и временем; с одним адресом шага нет.
 *
 * УСЛУГА — ФИЛЬТР, А НЕ ШАГ. Без неё видны все мастера, с ней — только те, кто
 * её оказывает. Смена услуги сбрасывает мастера, только если он её не делает.
 *
 * Модуль без React: его проверяет `node src/lib/bookingPage.check.ts`.
 */
import type { ResourceStaffMember } from '../api/hybrid.types';
import type { StudioService } from '../api/studio';

export const ANY = 'any' as const;
/** `users.id` мастера или «любой подходящий». */
export type MasterChoice = number | typeof ANY;

export interface BookingSheetState {
  master: MasterChoice;
  /** `null` — услуга ещё не выбрана: лист начинается с услуг мастера. */
  serviceId: number | null;
  /** Есть ли куда вернуться: лист открыт с мастера, и выбирать было из чего. */
  canPickService: boolean;
  /** `null` при известной услуге — адресов несколько, лист спрашивает где. */
  branchId: number | null;
  /** Спрашивали ли адрес: назад со времени ведёт к нему. */
  canPickBranch: boolean;
}

export interface BookingPageState {
  /** Выбранные филиалы. Пустой список — «Все» (lib/branchSelection.ts). */
  branchIds: number[];
  /** Фильтр мастеров. `null` — «Усі послуги». */
  serviceId: number | null;
  /** Остаётся выбранным после закрытия листа — человек видит, к кому шёл. */
  master: MasterChoice | null;
  sheet: BookingSheetState | null;
}

export type BookingPageAction =
  | { type: 'branches'; branchIds: number[] }
  | { type: 'service'; serviceId: number | null; staff: ResourceStaffMember[] }
  | { type: 'openMaster'; master: MasterChoice; staff: ResourceStaffMember[]; services: StudioService[] }
  | { type: 'pickService'; serviceId: number; staff: ResourceStaffMember[] }
  | { type: 'pickBranch'; branchId: number }
  | { type: 'back' }
  | { type: 'close' }
  | { type: 'booked' };

/** `serviceId` приходит из QR-кода услуги: экран открывается уже с ней в
 *  фильтре. Услугу, которую никто из мастеров не делает, снимет `reconcile` —
 *  отдельной проверки здесь не нужно. */
export const initialBookingPage = (branchIds: number[], serviceId: number | null = null): BookingPageState => ({
  branchIds, serviceId, master: null, sheet: null,
});

export const fullName = (member: ResourceStaffMember): string =>
  [member.name, member.last_name].filter(Boolean).join(' ');

export const initials = (member: ResourceStaffMember): string =>
  [member.name, member.last_name].filter(Boolean).map((part) => part![0]).join('').slice(0, 2).toUpperCase();

/** На услугу можно записаться сам: индивидуальная и открытая для записи. */
export const isBookableResource = (service: StudioService): boolean =>
  service.booking_mode === 'resource' && service.is_bookable && service.service_type !== 'group';

export const offers = (member: ResourceStaffMember, serviceId: number): boolean =>
  member.service_ids.includes(serviceId);

export const visibleStaff = (staff: ResourceStaffMember[], serviceId: number | null): ResourceStaffMember[] =>
  serviceId === null ? staff : staff.filter((member) => offers(member, serviceId));

/** Филиалы, где принимает хоть кто-то из этих мастеров, — по возрастанию id. */
export const staffBranches = (staff: ResourceStaffMember[]): number[] =>
  [...new Set(staff.flatMap((member) => member.branch_ids))].sort((a, b) => a - b);

/**
 * Услуги, которые здесь есть смысл предлагать: из каталога, в его порядке, и
 * только те, что оказывает хоть кто-то из этих мастеров. Услуга без мастера в
 * филиале — выбор, ведущий в пустой список.
 */
export function offeredServices(staff: ResourceStaffMember[], services: StudioService[]): StudioService[] {
  const offered = new Set(staff.flatMap((member) => member.service_ids));
  return services.filter((service) => isBookableResource(service) && offered.has(service.id));
}

/** Услуги под выбор в листе: у мастера — его, у «любого» — все услуги филиалов. */
export function choiceServices(
  choice: MasterChoice, staff: ResourceStaffMember[], services: StudioService[],
): StudioService[] {
  if (choice === ANY) return offeredServices(staff, services);
  const member = staff.find((row) => row.teacher_id === choice);
  return member ? offeredServices([member], services) : [];
}

/**
 * Куда можно прийти на эту услугу: у мастера — его филиалы из выбранных, у
 * «любого» — филиалы всех, кто её оказывает.
 */
export function branchOptions(choice: MasterChoice, serviceId: number, staff: ResourceStaffMember[]): number[] {
  const members = choice === ANY
    ? visibleStaff(staff, serviceId)
    : staff.filter((row) => row.teacher_id === choice && offers(row, serviceId));
  return staffBranches(members);
}

/**
 * Услуги мастера для карточки: несколько штук и «ещё N». Выбранная в фильтре —
 * первой: карточка сразу объясняет, почему мастер остался в списке.
 */
export function masterPills(
  member: ResourceStaffMember, services: StudioService[], selected: number | null, limit = 3,
): { shown: StudioService[]; more: number } {
  const own = offeredServices([member], services);
  const ordered = selected === null
    ? own
    : [...own.filter((service) => service.id === selected), ...own.filter((service) => service.id !== selected)];
  return { shown: ordered.slice(0, limit), more: Math.max(0, ordered.length - limit) };
}

/** «Любой мастер» стоит показывать, когда есть из кого выбирать. */
export const showAnyMaster = (visible: ResourceStaffMember[]): boolean => visible.length >= 2;

export const teacherIdOf = (choice: MasterChoice | null): number | null =>
  choice === null || choice === ANY ? null : choice;

export const sheetStep = (state: BookingPageState): 'service' | 'branch' | 'time' | null =>
  state.sheet === null
    ? null
    : state.sheet.serviceId === null
      ? 'service'
      : state.sheet.branchId === null ? 'branch' : 'time';

/** Лист с услугой: один адрес — сразу он, несколько — шаг выбора адреса. */
function withService(
  sheet: BookingSheetState, serviceId: number | null, staff: ResourceStaffMember[], canPickService: boolean,
): BookingSheetState {
  if (serviceId === null) return { ...sheet, serviceId, canPickService, branchId: null, canPickBranch: false };
  const places = branchOptions(sheet.master, serviceId, staff);
  return {
    ...sheet, serviceId, canPickService,
    branchId: places.length === 1 ? places[0] : null,
    canPickBranch: places.length > 1,
  };
}

const sameBranches = (a: number[], b: number[]): boolean =>
  a.length === b.length && a.every((id) => b.includes(id));

/**
 * Состояние с поправкой на свежий список мастеров — вычислением, без записи.
 *
 * Список перечитывается (другие филиалы, чужая правка графика), и выбранные
 * услуга или мастер могли из него исчезнуть. Хранить «исправленное» значение
 * эффектом значило бы лишний рендер и гонку с кликом; достаточно не показывать
 * то, чего уже нет. `staff === null` — ответа ещё нет, решать нечего.
 */
export function reconcile(
  state: BookingPageState, staff: ResourceStaffMember[] | null, services: StudioService[],
): BookingPageState {
  if (staff === null) return state;
  const offered = offeredServices(staff, services);
  const serviceId = state.serviceId !== null && offered.some((service) => service.id === state.serviceId)
    ? state.serviceId
    : null;
  const master = typeof state.master === 'number'
    && !visibleStaff(staff, serviceId).some((member) => member.teacher_id === state.master)
    ? null
    : state.master;
  return serviceId === state.serviceId && master === state.master ? state : { ...state, serviceId, master };
}

export function bookingPageReducer(state: BookingPageState, action: BookingPageAction): BookingPageState {
  switch (action.type) {
    case 'branches':
      // Филиалы — смена контекста (MA-01): мастер и лист прошлого выбора здесь
      // могут не существовать. Фильтр услуги остаётся — если в новом списке её
      // никто не делает, `reconcile` её просто не покажет.
      return sameBranches(action.branchIds, state.branchIds)
        ? state
        : { ...initialBookingPage(action.branchIds), serviceId: state.serviceId };

    case 'service': {
      // Повторное касание активного чипа снимает фильтр.
      const serviceId = action.serviceId === state.serviceId ? null : action.serviceId;
      const master = typeof state.master === 'number' && serviceId !== null
        && !action.staff.some((member) => member.teacher_id === state.master && offers(member, serviceId))
        ? null
        : state.master;
      return { ...state, serviceId, master, sheet: null };
    }

    case 'openMaster': {
      const options = choiceServices(action.master, action.staff, action.services);
      const current = state.serviceId !== null && options.some((service) => service.id === state.serviceId)
        ? state.serviceId
        : null;
      // Одна услуга у мастера — выбирать нечего, лишнего шага нет.
      const serviceId = current ?? (options.length === 1 ? options[0].id : null);
      const blank = { master: action.master, serviceId: null, canPickService: false, branchId: null, canPickBranch: false };
      return {
        ...state,
        master: action.master,
        serviceId,
        sheet: withService(blank, serviceId, action.staff, current === null && options.length > 1),
      };
    }

    case 'pickService':
      // Выбранная в листе услуга становится и фильтром страницы: закрыв лист,
      // человек видит ровно тот выбор, с которым шёл.
      return state.sheet
        ? {
          ...state,
          serviceId: action.serviceId,
          sheet: withService(state.sheet, action.serviceId, action.staff, state.sheet.canPickService),
        }
        : state;

    case 'pickBranch':
      return state.sheet && state.sheet.serviceId !== null
        ? { ...state, sheet: { ...state.sheet, branchId: action.branchId } }
        : state;

    case 'back': {
      // Назад — только на шаг, который человек действительно проходил: к
      // адресу, если его спрашивали, иначе к услугам, если лист с них начинался
      // (тогда и фильтра до открытия не было).
      const sheet = state.sheet;
      if (!sheet) return state;
      if (sheet.branchId !== null && sheet.canPickBranch) {
        return { ...state, sheet: { ...sheet, branchId: null } };
      }
      if (sheet.serviceId !== null && sheet.canPickService) {
        return { ...state, serviceId: null, sheet: { ...sheet, serviceId: null, branchId: null, canPickBranch: false } };
      }
      return state;
    }

    case 'close':
      return state.sheet ? { ...state, sheet: null } : state;

    case 'booked':
      // Запись создана: мастер больше не «выбран», фильтр услуги — выбор
      // человека, он остаётся.
      return { ...state, master: null, sheet: null };
  }
}
