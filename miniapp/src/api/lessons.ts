import { apiGet } from './client';

// ==========================================
// 1. ТИПЫ (ИНТЕРФЕЙСЫ)
// ==========================================

// Повторяет MiniappLesson из back/routers/booking/miniapp_lessons.py
export interface LessonResponse {
  id: number;
  name: string;
  level: string;
  equipment: string;
  total_spots: number;
  teacher_name: string;
  start_time: string; // datetime в JSON всегда передается как строка (ISO формат)
  duration_min: number;
  price: number;

  // Наши @computed_field:
  time: string;       // "18:00"
  price_str: string;  // "3 900 ₴"
  teacher: string;    // "Олена Соколова"
  color: string;      // "#7D9B82"
  badge: string;      // "open"
  taken_spots: number[];
  is_booked_by_user?: boolean;
  /**
   * Занятие проходит правила онлайн-записи студии (запись включена, окно дней,
   * минимум времени до начала, часы работы виджета). false — карточка видна,
   * но записаться нельзя: расписание студии клиент должен видеть целиком.
   */
  bookable: boolean;
}

// Схема для будущих занятий (наследует всё + добавляет номер коврика)
export interface UpcomingLessonResponse extends LessonResponse {
  spot_number: number;
  /** "pending" — бронь ждёт подтверждения студии, место уже держится. */
  status: 'active' | 'pending';
}

// Схема для прошедших занятий (наследует всё + добавляет коврик и оценку)
export interface PastLessonResponse extends LessonResponse {
  spot_number: number;
  rating: number | null; // Может быть числом (1-5) или null, если еще не оценили
}

// Финальная сборка ответа для страницы "Мои занятия"
export interface MyLessonsResponse {
  upcoming: UpcomingLessonResponse[];
  past: PastLessonResponse[];
}

// ==========================================
// 2. ФУНКЦИИ ЗАПРОСОВ (API CALLS)
// ==========================================

/**
 * Найближче заняття студії (з урахуванням min_booking_advance_min на сервері).
 * Немає найближчого заняття — сервер відповідає 204, client.ts повертає undefined.
 * Ендпоінт: GET /global/lessons/next
 */
export const getNextLesson = async (): Promise<LessonResponse | null> =>
  (await apiGet<LessonResponse | undefined>('/global/lessons/next')) ?? null;

/**
 * Отримує всі заняття на конкретну дату.
 * Фронтенд має передавати дату у форматі YYYY-MM-DD (наприклад: '2026-05-19').
 * Ендпоінт: GET /global/lessons/date/{target_date}
 */
export const getLessonsByDate = (targetDate: string): Promise<LessonResponse[]> =>
  apiGet(`/global/lessons/date/${targetDate}`);

/**
 * Отримує списки майбутніх і минулих занять поточного клієнта (з токена).
 * Ендпоінт: GET /global/lessons/my
 */
export const getMyLessons = (): Promise<MyLessonsResponse> => apiGet('/global/lessons/my');
