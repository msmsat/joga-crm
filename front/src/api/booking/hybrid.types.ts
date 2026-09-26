/** Matches schemas/schedule/hybrid.py and services/terminology.py. */
export type BookingMode = 'event' | 'resource';
/** Услуга — одна механика: resource+group запрещена сервером (§6.1). */
export type ServiceBookingMode = BookingMode;
export type StudioBookingMode = BookingMode | 'hybrid';
/** Разделы экрана «Вид деятельности» в онбординге: что владелец выбрал, тем
 *  студия и говорит. Старые имена (generic/fitness/beauty) сервер переводит
 *  сам — сюда они уже не приходят. */
export type TerminologyProfile = 'studio' | 'sport' | 'beauty' | 'recovery' | 'relax' | 'other';
export interface BookingCapabilities {
  booking_mode: StudioBookingMode;
  terminology_profile: TerminologyProfile;
  booking_config_version: number;
  strict_schedule_enabled: boolean;
  /** Участвует ли место (зал/кресло/кабинет) в расписании. Приходит УЖЕ с
   *  учётом тумблера владельца — складывать отрасль с переопределением здесь
   *  нельзя, это серверное правило. */
  space_is_axis: boolean;
}
export interface TermForms { singular: string; plural: string; accusative: string }
export type BusinessMessage = 'choose_staff' | 'choose_offering' | 'empty_slots' | 'my_bookings' | 'confirm_booking';
export interface Terminology {
  version: number;
  locale: string;
  profile: TerminologyProfile;
  profiles: Record<TerminologyProfile, {
    staff: TermForms;
    offering: Record<BookingMode, TermForms>;
    /** Зал / кресло / кабинет / место — смотря чем студия занимается. */
    space: TermForms;
    /** Отраслевое значение по умолчанию, БЕЗ тумблера владельца. */
    space_is_axis: boolean;
    messages: Record<BusinessMessage, string>;
  }>;
  /** То же, что booking_capabilities.space_is_axis — с учётом тумблера. */
  space_is_axis: boolean;
}
export interface EventQuoteRequest { booking_mode: 'event'; lesson_id: number; spot_number?: number | null; payment_method?: 'venue' | 'card' }
/** `first_lesson` — только CRM: false выключает скидку на первое занятие для этой записи
 *  (выключатель шага оплаты). Не прислано — скидка ставится сама, если положена. */
export interface ResourceQuoteRequest { booking_mode: 'resource'; service_id: number; branch_id: number; teacher_id?: number | null; starts_at: string; payment_method?: 'venue' | 'card'; first_lesson?: boolean }
export type QuoteRequest = EventQuoteRequest | ResourceQuoteRequest;
/** Перенос индивидуальной записи из Журнала (CrmRescheduleQuoteRequest): перетаскивание,
 *  растягивание, поля карточки. Время — МЕСТНОЕ время студии (`local_start`, «2026-09-26T10:30:00»)
 *  либо точный момент из availability (`starts_at`), ровно одно: перевести местное в UTC браузеру
 *  нечем, это делает сервер по зоне студии. `duration_min` — растягивание, `hall_id` — другой зал.
 *  Способ оплаты при переносе стойка не выбирает — сервер берёт его у самой записи. */
export interface CrmRescheduleQuoteRequest {
  booking_mode: 'resource'; service_id: number; branch_id: number; teacher_id?: number | null;
  starts_at?: string; local_start?: string; duration_min?: number; hall_id?: number;
}
/** `hall_id` и `exclude_lesson_id` принимает только CRM-ручка (`/schedule/availability`):
 *  первое — выбор зала, второе — перенос, при котором занятие не должно
 *  занимать само себя (иначе предпросмотр прячет время, которое сервер примет). */
export interface AvailabilityQuery { service_id: number; branch_id: number; date_from: string; date_to: string; teacher_id?: number; hall_id?: number; exclude_lesson_id?: number }
export interface AvailabilitySlot { starts_at: string; local_start: string; tz_iana: string; teacher_ids: number[] }
export interface AvailabilityRead { slots: AvailabilitySlot[]; reason: string | null }
/** Мастер и то, что с ним реально связано: его индивидуальные услуги (с его ценой) и филиалы,
 *  где он принимает. Зеркало ResourceStaffMemberRead (back/schemas/schedule/hybrid.py). */
export interface ResourceStaffMember {
  teacher_id: number; name: string; last_name: string | null; photo_url: string | null; department: string | null;
  service_ids: number[]; service_prices: Record<number, number>;
  /** {service_id: минуты} — сколько услуга длится у ЭТОГО мастера. */
  service_durations: Record<number, number>; branch_ids: number[];
}
export interface ResourceStaffRead { staff: ResourceStaffMember[]; reason: string | null }
export type BookingStatus = 'active' | 'pending' | 'hold' | 'attended' | 'cancelled';
export type NextAction = 'none' | 'wait_approval' | 'pay';
/** Сумма клиента поменялась при переносе к мастеру с другой ценой. `paid` — сколько уже
 *  заплачено (картой или у стойки); null — не платил, долг уже получил новую сумму сам.
 *  Заплаченные деньги система не двигает: разницу возвращает или берёт человек. */
export interface BookingRepricing { previous: number; current: number; paid: number | null }
export interface BookingRead { reservation_id: number; lesson_id: number; booking_mode: BookingMode; status: BookingStatus; version: number; next_action: NextAction; payment_url: string | null; repricing?: BookingRepricing | null }
export interface BookingTerms {
  domain: {
    base_price: number; lesson_id: number; local_start: string; service_name: string;
    trainer_name: string; branch_name: string | null; approval_required: boolean;
    funding: { kind: 'subscription' | 'trial' | 'free' | 'pay'; subscription_id: number | null; price: number; currency: string };
  };
  booking_mode: BookingMode; service_id: number | null; teacher_id: number | null; branch_id: number | null;
  hall_id: number | null; tz_iana: string | null; starts_at: string | null; duration_min: number;
  buffer_before_min: number; buffer_after_min: number; lesson_version: number;
  booking_config_version: number; cancellation_deadline_min: number; payment_method: 'venue' | 'card'; spot_number: number | null;
  /** Скидка на первое занятие: просили ли её (эхо выключателя), положена ли она клиенту
   *  и сколько процентов даёт (100 — бесплатно). Применена = положена и не выключена. */
  first_lesson: boolean; first_lesson_offered: boolean; first_lesson_percent: number | null;
}
export interface QuoteRead { quote_id: string; expires_at: string; booking_mode: BookingMode; terms: BookingTerms; next_action: NextAction; reservation_id: number | null }
/** Промокод и ваучер (подарочный сертификат) шага оплаты. */
export interface PaymentCodes { promo_code?: string | null; certificate_code?: string | null }
/** Оплата наличными при подтверждении записи. `expected_total` — итог, который видел
 *  администратор: сервер считает заново и при расхождении не записывает ничего. */
export interface ConfirmPayment extends PaymentCodes { expected_total: number }
export type PaymentDiscountKind = 'studio' | 'offer' | 'promo' | 'referral' | 'first_lesson';
/** Чек шага оплаты — зеркало PaymentPreviewRead (back/schemas/schedule/hybrid.py). */
export interface PaymentPreview {
  currency: string;
  base_price: number;
  /** Чем покрыта запись, когда платить нечего. */
  covered_by: 'subscription' | 'trial' | 'free' | null;
  discounts: { kind: PaymentDiscountKind; amount: number }[];
  first_lesson_offered: boolean;
  first_lesson_applied: boolean;
  first_lesson_percent: number | null;
  /** null — промокод не вводили. */
  promo_valid: boolean | null;
  /** Промокод действует, но выгоднее другая скидка: скидки не суммируются. */
  promo_outweighed: boolean;
  /** Код ошибки ваучера (`loyalty.cert_used` …) — переводится через common:errors. */
  certificate_error: string | null;
  certificate_amount: number;
  certificate_applied: number;
  total: number;
}
