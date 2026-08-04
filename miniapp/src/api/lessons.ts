import { BASE_URL } from './config';

// ==========================================
// 1. ТИПЫ (ИНТЕРФЕЙСЫ)
// ==========================================

// Этот интерфейс в точности повторяет LessonResponse из твоего schemas.py
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
  dur: string;        // "60 хв"
  price_str: string;  // "3 900 ₴"
  teacher: string;    // "Олена Соколова"
  color: string;      // "#7D9B82"
  badge: string;      // "open"
  taken_spots: number[];
  is_booked_by_user?: boolean;
}

// 🆕 1. Схема для будущих занятий (наследует всё + добавляет номер коврика)
export interface UpcomingLessonResponse extends LessonResponse {
  spot_number: number;
}

// 🆕 2. Схема для прошедших занятий (наследует всё + добавляет коврик и оценку)
export interface PastLessonResponse extends LessonResponse {
  spot_number: number;
  rating: number | null; // Может быть числом (1-5) или null, если еще не оценили
}

// 🆕 3. Финальная сборка ответа для страницы "Мои занятия"
export interface MyLessonsResponse {
  upcoming: UpcomingLessonResponse[];
  past: PastLessonResponse[];
}

// ==========================================
// 2. ФУНКЦИИ ЗАПРОСОВ (API CALLS)
// ==========================================
export const getToday1800Lesson = async (tgId: number) => {
  const now = new Date();
  
  // Получаем четкий час на телефоне (если сейчас 16:20, вернет 16)
  const localHour = now.getHours(); 
  
  // Получаем локальную дату в формате YYYY-MM-DD
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const localDate = `${year}-${month}-${day}`; 

  // Отправляем бэкенду факты: "Я юзер X, у меня сейчас дата Y и время Z часов"
  const response = await fetch(
    `${BASE_URL}/lessons/today/1800?tg_id=${tgId}&client_hour=${localHour}&client_date=${localDate}`
  );
  
  if (!response.ok) {
    throw new Error('Головне заняття не знайдено');
  }

  return response.json();
};

/**
 * Получает все занятия на сегодня по конкретному направлению (например, 'Йога').
 * Отсеивает прошедшие и те, до которых меньше 2 часов.
 * Эндпоинт: GET /lessons/today/direction/{direction_name}
 */
export const getTodayLessonsByDirection = async (direction: string, tg_id?: number): Promise<LessonResponse[]> => {
  // Додаємо tg_id у посилання, якщо він є
  const url = tg_id 
    ? `${BASE_URL}/lessons/today/direction/${direction}?tg_id=${tg_id}`
    : `${BASE_URL}/lessons/today/direction/${direction}`;

  const response = await fetch(url, {
    method: 'GET',
  });

  if (!response.ok) {
    throw new Error('Помилка при завантаженні занять напрямку');
  }

  return response.json();
};

/**
 * Отримує всі заняття на конкретну дату.
 * Фронтенд має передавати дату у форматі YYYY-MM-DD (наприклад: '2026-05-19').
 * Ендпоінт: GET /lessons/date/{target_date}
 */
export const getLessonsByDate = async (targetDate: string, tg_id: number): Promise<LessonResponse[]> => {
  // 🔥 Тепер ми передаємо tg_id як параметр у посиланні (?tg_id=...)
  const response = await fetch(`${BASE_URL}/lessons/date/${targetDate}?tg_id=${tg_id}`, {
    method: 'GET',
  });

  if (!response.ok) {
    throw new Error(`Помилка при завантаженні занять на дату: ${targetDate}`);
  }

  return response.json();
};

/**
 * 🆕 Получает списки будущих и прошлых занятий конкретного клиента по его Telegram ID.
 * Эндпоинт: GET /lessons/my/{tg_id}
 */
export const getMyLessons = async (tg_id: number): Promise<MyLessonsResponse> => {
  const response = await fetch(`${BASE_URL}/lessons/my/${tg_id}`, {
    method: 'GET',
  });

  if (!response.ok) {
    throw new Error('Помилка при завантаженні історії ваших занять');
  }

  // Бэкенд возвращает объект { upcoming: [...], past: [...] }
  return response.json();
};