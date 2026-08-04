/**
 * Один хелпер вместо голого `alert()`: внутри Telegram — нативный
 * `tg.showAlert`, снаружи (открыли в браузере) — обычный `alert`. Своих
 * тостов не пишем — у Telegram уже есть нативный диалог, и он выглядит
 * уместнее собственного.
 */
interface TelegramWebApp {
  showAlert?: (message: string) => void;
}

function getTelegramWebApp(): TelegramWebApp | undefined {
  return (window as unknown as { Telegram?: { WebApp?: TelegramWebApp } }).Telegram?.WebApp;
}

export function notify(message: string): void {
  const tg = getTelegramWebApp();
  if (tg?.showAlert) {
    tg.showAlert(message);
  } else {
    alert(message);
  }
}
