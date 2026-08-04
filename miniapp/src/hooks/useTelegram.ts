// src/hooks/useTelegram.ts

// Вытягиваем глобальный объект Telegram (один раз на весь проект)
const tg = (window as any).Telegram?.WebApp;

export function useTelegram() {
  // Вытаскиваем юзера, если мы внутри Telegram
  const user = tg?.initDataUnsafe?.user;

  // ponytail: tg_id остаётся здесь до блока 6 эпика EPIC_MA_REAL_BACKEND — как только
  // последний потребитель (BuyModal → buySubscription) перейдёт на client.ts без tg_id,
  // это поле уходит из хука целиком.
  const tg_id = user?.id ?? 0;

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