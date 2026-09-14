import { useCookieSettingsOpen } from '../../hooks/useCookieConsent';
import { CookieBanner } from './CookieBanner';
import { CookieSettingsModal } from './CookieSettingsModal';

/**
 * Баннер до первого выбора и окно настроек по запросу (подвалы, профиль).
 * Монтируется один раз внутри Router: баннеру нужен адрес страницы.
 */
export function CookieConsentRoot() {
  const settingsOpen = useCookieSettingsOpen();
  return (
    <>
      <CookieBanner />
      {settingsOpen && <CookieSettingsModal />}
    </>
  );
}
