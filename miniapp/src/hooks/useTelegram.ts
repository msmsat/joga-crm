// src/hooks/useTelegram.ts
import { getSession } from '../lib/session';

// Вытягиваем глобальный объект Telegram (один раз на весь проект)
const tg = (window as any).Telegram?.WebApp;

export function useTelegram() {
  // Вытаскиваем юзера, если мы внутри Telegram
  const user = tg?.initDataUnsafe?.user;

  // 🔥 ЕДИНАЯ ТОЧКА ПРАВДЫ ДЛЯ TG_ID
  // Внутри Telegram — id из бота. Снаружи (сайт, Instagram) — id из сохранённого
  // ключа, который выдаётся один раз при знакомстве и живёт на устройстве.
  // Нуля не бывает: без ключа App показывает экран знакомства, а не экраны данных.
  const tg_id = user?.id ?? getSession()?.tg_id ?? 0;

  return {
    tg,               // Сам оригинальный объект (на всякий случай)
    user,             // Полные данные юзера (имя, юзернейм и т.д.)
    tg_id,            // Тот самый ID, который нам нужен для API
    
    // Заодно вынесем сюда полезные функции, чтобы не писать длинные проверки в компонентах
    onClose: () => tg?.close(),
    vibrateSuccess: () => tg?.HapticFeedback?.notificationOccurred('success'),
    vibrateError: () => tg?.HapticFeedback?.notificationOccurred('error'),
    vibrateLight: () => tg?.HapticFeedback?.impactOccurred('light'),
    vibrateMedium: () => tg?.HapticFeedback?.impactOccurred('medium'),
  };
}