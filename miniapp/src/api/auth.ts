// src/api/auth.ts
import { BASE_URL } from './config';

// 1. Описываем типы для TypeScript (чтобы редактор подсказывал поля)
export interface UserResponse {
  id: number;
  tg_id: number;
  name: string;
  phone: string | null;
  notifs_enabled: boolean;
  reminders_enabled: boolean;
  registration_date: string;
}

export interface CheckUserResult {
  exists: boolean;
  message: string;
  user: UserResponse | null;
}

// То, что возвращает бэкенд (Профиль юзера)
export interface UserResponse {
  id: number;
  tg_id: number;
  name: string;
  phone: string | null;
  notifs_enabled: boolean;
  reminders_enabled: boolean;
  registration_date: string;
}

// Ответ для проверки юзера
export interface CheckUserResult {
  exists: boolean;
  message: string;
  user: UserResponse | null;
}

// 🆕 То, что мы ОТПРАВЛЯЕМ при регистрации (соответствует UserCreate в schemas.py)
export interface UserCreateRequest {
  tg_id: number;
  name: string;
  phone?: string | null; // Знак вопроса означает, что поле необязательное
}

// проверка юзера
export const checkUser = async (tg_id: number): Promise<CheckUserResult> => {
  const response = await fetch(`${BASE_URL}/global/check-user`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    // Превращаем наш tg_id в JSON, как того ждет бэкенд
    body: JSON.stringify({ tg_id }), 
  });

  if (!response.ok) {
    throw new Error('Помилка з\'єднання з сервером при перевірці користувача');
  }

  // Возвращаем готовый JavaScript объект
  return response.json();
};

// 🆕 Регистрация нового юзера
export const registerUser = async (data: UserCreateRequest): Promise<UserResponse> => {
  const response = await fetch(`${BASE_URL}/global/register`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data), // Передаем объект { tg_id, name, phone }
  });

  if (!response.ok) {
    throw new Error('Помилка при реєстрації користувача');
  }

  // Бэкенд вернет готовый профиль юзера (UserResponse)
  return response.json();
};

export const getUserByTgId = async (tg_id: number): Promise<UserResponse> => {
  const response = await fetch(`${BASE_URL}/global/user/${tg_id}`);

  if (!response.ok) {
    throw new Error('Помилка завантаження даних користувача з бази');
  }

  return response.json();
};