// src/hooks/useTelegram.ts

interface TelegramWebApp {
  initDataUnsafe?: { user?: { id: number; first_name?: string }; start_param?: string };
  initData?: string;
  close: () => void;
  ready: () => void;
  expand: () => void;
  /**
   * Отключает «смахнуть вниз, чтобы закрыть». Нужен с тех пор, как прокрутка
   * стала прокруткой документа: у верхней границы жест закрытия перехватывал
   * обычное листание вверх. Появился в Bot API 7.7 — на старых клиентах метода
   * нет, поэтому необязательный.
   */
  disableVerticalSwipes?: () => void;
  openLink?: (url: string) => void;
  // Telegram гарантирует объект HapticFeedback всегда, если есть сам tg —
  // необязательное только всё приложение целиком (window.Telegram.WebApp).
  HapticFeedback: {
    notificationOccurred: (type: 'success' | 'error' | 'warning') => void;
    impactOccurred: (style: 'light' | 'medium' | 'heavy') => void;
    selectionChanged: () => void;
  };
}

// Вытягиваем глобальный объект Telegram (один раз на весь проект)
const tg = (window as unknown as { Telegram?: { WebApp?: TelegramWebApp } }).Telegram?.WebApp;

export function useTelegram() {
  // Вытаскиваем юзера, если мы внутри Telegram
  const user = tg?.initDataUnsafe?.user;

  return {
    tg,               // Сам оригинальный объект (на всякий случай)
    user,             // Полные данные юзера (имя, юзернейм и т.д.)

    // Заодно вынесем сюда полезные функции, чтобы не писать длинные проверки в компонентах
    onClose: () => tg?.close(),
    vibrateSuccess: () => tg?.HapticFeedback?.notificationOccurred('success'),
    vibrateError: () => tg?.HapticFeedback?.notificationOccurred('error'),
    vibrateLight: () => tg?.HapticFeedback?.impactOccurred('light'),
    vibrateMedium: () => tg?.HapticFeedback?.impactOccurred('medium'),
  };
}
