import { GoogleLogin, GoogleOAuthProvider } from '@react-oauth/google';
import { useTranslation } from 'react-i18next';
import { GoogleIcon } from '../Icons';
import { grantConsent } from '../../utils/cookieConsent';
import { useConsentGranted } from '../../hooks/useCookieConsent';
import { COOKIES_URL, LEGAL_LINK_PROPS } from '../../utils/legal';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

/**
 * Кнопка входа через Google, которая сначала спрашивает согласие на cookie Google.
 *
 * GoogleOAuthProvider при монтировании грузит accounts.google.com/gsi/client,
 * а тот читает cookie Google и ставит `g_state` на наш домен — это доступ к
 * устройству, на который нужно согласие (§ 89 odst. 3 ZEK, ст. 5(3) ePrivacy).
 * Раньше провайдер оборачивал всё приложение, и скрипт уходил к каждому
 * посетителю лендинга. Теперь он живёт только здесь и только после согласия.
 *
 * Без согласия рисуем свою кнопку того же размера — «двухкликовое» решение:
 * клик по ней с пояснением прямо под ней и есть согласие именно на вход через
 * Google, после него появляется настоящая кнопка (и One Tap). Цвета — из
 * брендбука Google для кнопок входа, поэтому литералами, а не токенами.
 */
export function GoogleSignIn({ width, onCredential, onError, dark = false }: {
  width: number;
  onCredential: (credential: string) => void;
  onError: () => void;
  /** Кнопка стоит на тёмной подложке (страница входа). Тема БЕРЁТСЯ У GOOGLE
   *  (`filled_black`), а не подкрашивается нами: настоящая кнопка живёт в
   *  iframe, снаружи её не перекрасить, да и брендбук Google разрешает ровно
   *  два вида — светлый на светлом, тёмный на тёмном. */
  dark?: boolean;
}) {
  const { t } = useTranslation('cookies');
  const allowed = useConsentGranted('functional');

  if (allowed) {
    return (
      // minHeight — кнопка Google рисуется в iframe не сразу, а форма под ней
      // не должна подпрыгивать, пока скрипт грузится.
      <div style={{ minHeight: 40, display: 'flex', justifyContent: 'center', width: '100%' }}>
        <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
          <GoogleLogin
            width={String(width)}
            theme={dark ? 'filled_black' : 'outline'}
            shape="pill"
            text="continue_with"
            onSuccess={(response) => {
              if (response.credential) onCredential(response.credential);
            }}
            onError={onError}
            useOneTap
          />
        </GoogleOAuthProvider>
      </div>
    );
  }

  // Своя кнопка до согласия повторяет вид настоящей — включая тёмный вариант:
  // иначе после клика на месте белой кнопки появлялась бы чёрная.
  const bg = dark ? '#131314' : '#FFFFFF';
  const bgHover = dark ? '#28292B' : '#F8FAFF';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, width, maxWidth: '100%' }}>
      <button
        type="button"
        onClick={() => grantConsent('functional', 'google_button')}
        style={{
          width: '100%', height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
          background: bg, border: `1px solid ${dark ? '#3C4043' : '#DADCE0'}`, borderRadius: 100,
          color: dark ? '#E3E3E3' : '#3C4043', fontSize: 14, fontWeight: 500, fontFamily: 'Roboto, Arial, sans-serif',
          cursor: 'pointer', transition: 'background 0.2s',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = bgHover; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = bg; }}
      >
        <GoogleIcon />
        {t('google.button')}
      </button>
      <p style={{
        margin: 0, fontSize: 11.5, lineHeight: 1.5, textAlign: 'center',
        color: dark ? 'rgba(255,255,255,0.45)' : 'var(--muted)',
      }}>
        {t('google.notice')}{' '}
        <a
          href={COOKIES_URL}
          {...LEGAL_LINK_PROPS}
          className={dark ? undefined : 'text-link'}
          style={dark ? { color: '#FCAE91', fontWeight: 600, textDecoration: 'none' } : undefined}
        >
          {t('google.policy')}
        </a>
      </p>
    </div>
  );
}
