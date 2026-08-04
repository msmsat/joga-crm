import { BASE_URL } from './config';

// Формируем базовый URL именно для юзеров
const API_URL = `${BASE_URL}/users`;

// ==========================================
// 📝 ИНТЕРФЕЙСЫ 
// ==========================================

export interface UserProfile {
  name: string;
  notifs_enabled: boolean;
  reminders_enabled: boolean;
  registration_date: string;
  reg_date_str: string;
}

export interface UserSubscription {
  type: string;
  total_classes: number;
  used_classes: number;
  expires_at: string; 
  classes_left: number;
  expires_str: string;
  status: string;
}

export interface BuySubscriptionRequest {
  type: string;
  total_classes: number;
  amount: number;
  valid_days: number;
}

export interface PaymentResponse {
  amount: number;
  description: string;
  status: string;
  created_at: string;
  amount_str: string;
  date_str: string;
  action_type: string; // "buy_subscription"
  item_key: string;  // item_key — це те, що ми будемо використовувати для отримання перекладу назви абонемента.
}

export interface SuccessResponse {
  status: string;
  message: string;
}

export interface BookLessonRequest {
  tg_id: number;
  lesson_id: number;
  spot_number: number;
}

export interface RateLessonRequest {
  tg_id: number;
  lesson_id: number;
  rating: number;
}

export interface CancelLessonRequest {
  tg_id: number;
  lesson_id: number;
}


// ==========================================
// 🚀 ФУНКЦИИ ЗАПРОСОВ К API
// ==========================================

// 1. Отримання профілю
export const getUserProfile = async (tgId: number): Promise<UserProfile> => {
  // 🔥 Додали антикеш: ?_t=${Date.now()}
  const response = await fetch(`${API_URL}/${tgId}/profile?_t=${Date.now()}`);
  if (!response.ok) {
    throw new Error('Помилка завантаження профілю');
  }
  return response.json();
};

// 2. Отримання абонемента (обробляємо 404 помилку як норму)
export const getUserSubscription = async (tgId: number): Promise<UserSubscription[]> => {
  // 🔥 Додали антикеш: ?_t=${Date.now()}
  const response = await fetch(`${API_URL}/${tgId}/subscription?_t=${Date.now()}`);
  
  if (!response.ok) {
    throw new Error('Помилка завантаження абонементів');
  }
  
  return response.json(); 
};

// 3. Купівля абонемента (POST)
export const buySubscription = async (tgId: number, data: BuySubscriptionRequest): Promise<SuccessResponse> => {
  const response = await fetch(`${API_URL}/${tgId}/buy-subscription`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    throw new Error('Помилка при покупці абонемента');
  }
  return response.json();
};

// 4. Отримання історії оплат
export const getUserPayments = async (tgId: number): Promise<PaymentResponse[]> => {
  // 🔥 Додали антикеш: ?_t=${Date.now()}
  const response = await fetch(`${API_URL}/${tgId}/payments?_t=${Date.now()}`);
  if (!response.ok) {
    throw new Error('Помилка завантаження історії оплат');
  }
  return response.json();
};

// 5. Оновлення налаштувань (Повідомлення) (PATCH)
export const updateNotifications = async (tgId: number, enabled: boolean): Promise<SuccessResponse> => {
  const response = await fetch(`${API_URL}/${tgId}/settings/notifications`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled }),
  });
  if (!response.ok) throw new Error('Помилка оновлення налаштувань');
  return response.json();
};

// 6. Оновлення налаштувань (Нагадування) (PATCH)
export const updateReminders = async (tgId: number, enabled: boolean): Promise<SuccessResponse> => {
  const response = await fetch(`${API_URL}/${tgId}/settings/reminders`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled }),
  });
  if (!response.ok) throw new Error('Помилка оновлення налаштувань');
  return response.json();
};

/**
 * Бронює конкретний килимок на занятті для користувача.
 * Ендпоінт: POST /users/book (зміни префікс /users на свій, якщо в роутері він інший)
 */
export const bookLesson = async (data: BookLessonRequest): Promise<SuccessResponse> => {
  const response = await fetch(`${BASE_URL}/users/book`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json', // Обов'язково кажемо серверу, що шлемо JSON
    },
    body: JSON.stringify(data), // Перетворюємо наш об'єкт у рядок
  });

  if (!response.ok) {
    // Якщо бэкенд викинув помилку 400 (наприклад, "Це місце вже зайнято"),
    // ми витягуємо текст цієї помилки з поля detail і прокидаємо її далі
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || 'Помилка при бронюванні заняття');
  }

  return response.json();
};

export const cancelLesson = async (data: CancelLessonRequest): Promise<SuccessResponse> => {
  const response = await fetch(`${BASE_URL}/users/cancel`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || 'Не вдалося скасувати запис');
  }

  return response.json();
};

export const rateLesson = async (data: RateLessonRequest): Promise<SuccessResponse> => {
  const response = await fetch(`${BASE_URL}/users/rate-lesson`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || 'Не вдалося зберегти оцінку заняття');
  }

  return response.json();
};
