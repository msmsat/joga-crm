export interface Hall {
  id: number
  name: string
  // Филиал зала (null — зал ни к одному не привязан). Отчёты сужают по нему
  // список залов в тулбаре.
  branch_id: number | null
  color: string
  capacity: number
  is_online: boolean
  is_active: boolean
}

export interface Lesson {
  id: number
  name: string
  teacher_id: number | null
  teacher_name: string | null
  hall_id: number | null
  start_time: string
  duration_min: number
  price: number
  total_spots: number
  booked_count: number
  /** Сколько записанных отмечены «пришёл» — только в списке занятий. */
  attended_count?: number
  /** Сколько отмечены «не пришёл» — только по ним сетка рисует неявку:
   *  посещение по умолчанию «пришёл» (back/services/attendance.py). */
  no_show_count?: number
  status: 'confirmed' | 'pending' | 'cancelled'
  level: string | null
  cancel_reason: string | null
  /** Заметка студии о занятии и снимки к ней. Клиенту не уходят никуда. */
  notes: string
  photos: string[]
  clients_notified: boolean
  service_id: number | null
  service_color: string | null
  // HB-15: снимок механики и филиала. Определять модель по total_spots === 1
  // запрещено — заранее созданное событие на одно место остаётся событием.
  branch_id: number | null
  booking_mode: 'event' | 'resource'
  tz_iana: string | null
  version?: number
  // Буферы услуги, снятые в занятие: мастер в это время занят (подготовка/уборка).
  buffer_before_min?: number
  buffer_after_min?: number
}

export interface LessonCreate {
  service_id: number
  teacher_id?: number | null
  hall_id?: number | null
  /** Филиал занятия. С залом не нужен — сервер берёт филиал из зала и
   *  отклоняет расхождение (409 BRANCH_CONFLICTS_WITH_HALL). Нужен там, где
   *  место не участвует в расписании: вывести филиал иначе неоткуда. */
  branch_id?: number | null
  start_time: string
  duration_min: number
  price?: number
  total_spots?: number
  level?: string | null
  equipment?: string | null
  notes?: string
  photos?: string[]
}

// Записанный на занятие клиент (для попапа занятия)
export interface BookedClient {
  reservation_id: number
  client_id: number
  name: string
  last_name: string | null
  phone: string | null
  avatar_color: string | null
  spot_number: number | null
  // pending — клиент записался онлайн, а студия включила «Подтверждение
  // тренером»: место держится, но бронь ждёт решения в Журнале.
  status: 'active' | 'attended' | 'pending'
  // Первое занятие клиента («Скидка на первое занятие»). Бесплатное — денег не
  // ждём; со скидкой — остаток висит долгом, как любая оплата на месте.
  is_trial: boolean
  // Процент скидки, обещанный при записи (100 — бесплатно; null у старых
  // пробных броней — это были подарки).
  trial_discount_percent?: number | null
  // Долг за занятие (оплата на месте). 0 — покрыто абонементом, подарено или
  // уже оплачено.
  debt: number
  // Сколько уже заплачено за занятие на месте (погашенный долг).
  paid_amount: number
  // Занятие списано с абонемента.
  by_subscription: boolean
  // Откуда пришла запись (crm, miniapp, ai…) и когда.
  booking_channel: string | null
  booked_at: string | null
  // Оценка и отзыв клиента об этом занятии.
  rating: number | null
  review_text: string | null
  // «Кофе после занятия».
  coffee: boolean
  // Абонемент, с которого списано занятие.
  subscription_name: string | null
  // Чем оплачено (снимок кассы). null — денег не брали или оплачено до снимков.
  payment: PaymentBreakdown | null
  // Скидка администратора, данная при записи без оплаты: долг уже с ней, окно
  // оплаты открывается с ней же.
  manual_discount_percent?: number | null
  // Явная отметка «не пришёл» (статус при ней остаётся active). Посещение по
  // умолчанию «пришёл»: до начала занятия запись ждёт, с начала — пришёл.
  no_show?: boolean
  // Долг погашен системой по окончании занятия — «не пришёл» откатит его сам.
  auto_paid?: boolean
}

/** Чем оплачено занятие — снимок кассы в момент оплаты. */
export interface PaymentBreakdown {
  base_price: number
  discounts: { kind: ReservationDiscountKind; amount: number }[]
  promo_code: string | null
  bonuses_applied: number
  bonuses_value: number
  deposit_applied: number
  certificate_applied: number
  certificate_code: string | null
  total: number
  /** cash / transfer / stripe (карта онлайн). */
  method: string | null
  paid_at: string | null
}

/** Где проходит занятие. Без филиала адрес — из карточки студии. */
export interface LessonLocation {
  hall_name: string | null
  branch_name: string | null
  address: string | null
  city: string | null
}

export interface LessonCompensation {
  kind: 'owner' | 'percent' | 'hourly' | 'salary' | 'unconfigured'
  amount: number | null
  base_amount: number | null
  rate: number | null
  duration_min: number
}

export interface LessonDetail extends Lesson {
  compensation: LessonCompensation | null
  equipment: string | null
  booked_clients: BookedClient[]
  location: LessonLocation | null
}

/** Чем, кроме денег, закрывается долг за занятие у стойки. */
export interface ReservationPaymentOptions {
  /** null — скидка, данная брони при записи; 0 — без скидки администратора. */
  manual_discount_percent?: number | null
  use_bonuses?: boolean
  use_deposit?: boolean
  /** false — скидку первого занятия не засчитывать: бронь перестаёт быть пробной. */
  first_lesson?: boolean
  promo_code?: string | null
  certificate_code?: string | null
}

export type ReservationDiscountKind = 'studio' | 'offer' | 'promo' | 'referral' | 'first_lesson' | 'manual'

/** Приглашения клиента — строкой в окне оплаты (back/services/referral.summary). */
export interface ReferralSummary {
  /** Кто привёл клиента; null — пришёл сам. */
  invited_by: string | null
  /** Скидка новичка по приглашению ещё ждёт — её снимет расчёт цены. */
  discount_percent: number | null
  /** Скольких друзей привёл сам клиент. */
  invited_count: number
  /** Что студия дарит пригласившему за друга. */
  invite_bonus: number | null
  invite_bonus_type: 'points' | 'deposit' | 'discount' | null
}

/** Строки чека оплаты занятия — общие для оплаты при записи и оплаты долга:
 *  окно оплаты у них одно (components/lesson/PaySheet). */
export interface PaymentCheckPreview {
  currency: string
  base_price: number
  discounts: { kind: ReservationDiscountKind; amount: number }[]
  manual_outweighed: boolean
  /** Бронь пробная — у чека есть выключатель «Первое занятие». */
  first_lesson_offered: boolean
  first_lesson_applied: boolean
  first_lesson_percent: number | null
  /** null — промокод не вводили, false — не принят. */
  promo_valid: boolean | null
  promo_outweighed: boolean
  /** Код ошибки сертификата (loyalty.cert_*) — чек посчитан без него. */
  certificate_error: string | null
  certificate_amount: number
  certificate_applied: number
  bonuses_available: number
  bonuses_applied: number
  bonuses_value: number
  point_value: number
  deposit_available: number
  deposit_applied: number
  cashback_percent: number | null
  points_to_earn: number
  referral: ReferralSummary | null
  total: number
}

/** POST /schedule/reservations/{id}/payment-preview — чек тем же ядром, что оплата. */
export interface ReservationPaymentPreview extends PaymentCheckPreview {
  debt: number
  /** Скидка администратора, по которой посчитан чек. */
  manual_discount_percent: number | null
}

// Клиент, которого можно записать на занятие (CL-6.4) — уже прошёл проверку
// доступа на бэке (assert_can_book), фронт только отображает.
export interface EligibleClient {
  id: number
  name: string
  last_name: string | null
  phone: string | null
  avatar_color: string | null
  subscription_hint: string | null
}

// Ответ GET /schedule/lessons/days — точки мини-календаря Журнала (даты месяца
// с неотменёнными занятиями), без загрузки полного списка занятий.
export interface LessonDaysResponse {
  days: string[]
}

export interface Reservation {
  id: number
  client_id: number
  lesson_id: number
  spot_number: number | null
  status: 'active' | 'cancelled' | 'attended' | 'pending'
  booking_channel: string | null
  created_at: string
  no_show?: boolean
  auto_paid?: boolean
}

export interface StaffScheduleBlock {
  staff_id: number;
  date: string;
  start_minute: number;
  end_minute: number;
  kind: 'day_off' | 'off_hours' | 'break' | 'busy';
  label: string | null;
}
