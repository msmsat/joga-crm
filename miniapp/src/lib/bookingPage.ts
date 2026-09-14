/**
 * Экран «Записатись» как конечный автомат, а не набор разрозненных useState.
 *
 * СОСТОЯНИЕ: филиал · услуга-фильтр (или «все») · выбранный мастер (или «любой»)
 * · открытый лист. День, слот и quote живут в `useResourceBooking` — это домен
 * записи, общий с главной и «Моими записями»; здесь только то, КАК человек к
 * нему пришёл.
 *
 * ДВА ПУТИ К ОДНОМУ ЛИСТУ:
 *   A. услуга → мастер → время: лист открывается сразу на времени;
 *   B. мастер → его услуга → время: лист начинается с услуг ЭТОГО мастера.
 * Без услуги время не спросить — длительность, цена и сама доступность зависят
 * от неё. Поэтому мастер без услуги ведёт в выбор услуги, а не в календарь.
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
}

export interface BookingPageState {
  branchId: number | null;
  /** Фильтр мастеров. `null` — «Усі послуги». */
  serviceId: number | null;
  /** Остаётся выбранным после закрытия листа — человек видит, к кому шёл. */
  master: MasterChoice | null;
  sheet: BookingSheetState | null;
}

export type BookingPageAction =
  | { type: 'branch'; branchId: number }
  | { type: 'service'; serviceId: number | null; staff: ResourceStaffMember[] }
  | { type: 'openMaster'; master: MasterChoice; staff: ResourceStaffMember[]; services: StudioService[] }
  | { type: 'pickService'; serviceId: number }
  | { type: 'backToServices' }
  | { type: 'close' }
  | { type: 'booked' };

export const initialBookingPage = (branchId: number | null): BookingPageState => ({
  branchId, serviceId: null, master: null, sheet: null,
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

/**
 * Услуги, которые здесь есть смысл предлагать: из каталога, в его порядке, и
 * только те, что оказывает хоть кто-то из этих мастеров. Услуга без мастера в
 * филиале — выбор, ведущий в пустой список.
 */
export function offeredServices(staff: ResourceStaffMember[], services: StudioService[]): StudioService[] {
  const offered = new Set(staff.flatMap((member) => member.service_ids));
  return services.filter((service) => isBookableResource(service) && offered.has(service.id));
}

/** Услуги под выбор в листе: у мастера — его, у «любого» — все услуги филиала. */
export function choiceServices(
  choice: MasterChoice, staff: ResourceStaffMember[], services: StudioService[],
): StudioService[] {
  if (choice === ANY) return offeredServices(staff, services);
  const member = staff.find((row) => row.teacher_id === choice);
  return member ? offeredServices([member], services) : [];
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

export const sheetStep = (state: BookingPageState): 'service' | 'time' | null =>
  state.sheet === null ? null : state.sheet.serviceId === null ? 'service' : 'time';

/**
 * Состояние с поправкой на свежий список мастеров — вычислением, без записи.
 *
 * Список перечитывается (другой филиал, чужая правка графика), и выбранные
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
    case 'branch':
      // Филиал — смена контекста (MA-01): мастера и услуги прошлого адреса
      // здесь не существуют, оставлять их выбранными нельзя.
      return action.branchId === state.branchId ? state : initialBookingPage(action.branchId);

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
      return {
        ...state,
        master: action.master,
        serviceId,
        sheet: { master: action.master, serviceId, canPickService: current === null && options.length > 1 },
      };
    }

    case 'pickService':
      // Выбранная в листе услуга становится и фильтром страницы: закрыв лист,
      // человек видит ровно тот выбор, с которым шёл.
      return state.sheet
        ? { ...state, serviceId: action.serviceId, sheet: { ...state.sheet, serviceId: action.serviceId } }
        : state;

    case 'backToServices':
      // Назад к услугам можно только если лист с них и начинался — тогда и
      // фильтра до открытия не было.
      return state.sheet?.canPickService
        ? { ...state, serviceId: null, sheet: { ...state.sheet, serviceId: null } }
        : state;

    case 'close':
      return state.sheet ? { ...state, sheet: null } : state;

    case 'booked':
      // Запись создана: мастер больше не «выбран», фильтр услуги — выбор
      // человека, он остаётся.
      return { ...state, master: null, sheet: null };
  }
}
