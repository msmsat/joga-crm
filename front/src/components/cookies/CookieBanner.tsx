import { useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Button } from '../ui/index';
import { ACCEPT_ALL, REJECT_ALL, openCookieSettings, saveConsent } from '../../utils/cookieConsent';
import { useCookieConsent, useCookieSettingsOpen } from '../../hooks/useCookieConsent';
import { COOKIES_URL, LEGAL_LINK_PROPS } from '../../utils/legal';
import { CookieIcon } from './CookieIcon';

/**
 * Плашка первого визита. Не модалка и не затемнение: сайт до выбора работает
 * полностью, иначе это был бы запрещённый cookie wall.
 *
 * «Отклонить» и «Принять» — один вариант кнопки и одна строка: разная
 * заметность — это тёмный паттерн, за который штрафуют (CNIL, EDPB 03/2022).
 * Закрытие без выбора не предусмотрено: крестик неизбежно читался бы как
 * «согласен», а решения за человека мы не принимаем.
 */
export function CookieBanner() {
  const { t } = useTranslation('cookies');
  const consent = useCookieConsent();
  const settingsOpen = useCookieSettingsOpen();
  const { pathname } = useLocation();
  // В кабинете на телефоне плашка встаёт над нижней панелью (App.css, .is-dash):
  // навигацию до выбора закрывать нельзя.
  const inDashboard = pathname.startsWith('/dashboard');

  return (
    <AnimatePresence>
      {consent === null && !settingsOpen && (
        <motion.section
          aria-labelledby="cookie-banner-title"
          className={`v-cookie-banner fixed bottom-6 left-6 z-[900] w-[min(440px,calc(100vw-48px))] rounded-2xl p-6${inDashboard ? ' is-dash' : ''}`}
          style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            boxShadow: '0 24px 64px -16px rgba(26,26,26,0.24), 0 8px 24px -4px rgba(0,0,0,0.04)',
          }}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 16 }}
          transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="flex items-start gap-3.5">
            <span
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
              style={{ background: 'rgba(252,174,145,0.14)', color: 'var(--peach)' }}
            >
              <CookieIcon />
            </span>
            <div className="min-w-0">
              <h2 id="cookie-banner-title" className="m-0 text-[15px] font-extrabold tracking-[-0.3px]" style={{ color: 'var(--onyx)' }}>
                {t('banner.title')}
              </h2>
              <p className="mt-1.5 mb-0 text-[13px] leading-[1.6]" style={{ color: 'var(--muted)' }}>
                {t('banner.text')}{' '}
                <a href={COOKIES_URL} {...LEGAL_LINK_PROPS} className="font-semibold no-underline hover:underline" style={{ color: 'var(--peach)' }}>
                  {t('banner.policy')}
                </a>
              </p>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-2.5">
            <Button variant="dark" fullWidth onClick={() => saveConsent(REJECT_ALL, 'banner')}>
              {t('actions.reject')}
            </Button>
            <Button variant="dark" fullWidth onClick={() => saveConsent(ACCEPT_ALL, 'banner')}>
              {t('actions.accept')}
            </Button>
          </div>
          <button
            type="button"
            onClick={openCookieSettings}
            className="mt-3 w-full cursor-pointer border-0 bg-transparent p-1 text-center text-[12.5px] font-semibold transition-colors hover:text-[var(--peach)]"
            style={{ color: 'var(--text2)' }}
          >
            {t('actions.settings')}
          </button>
        </motion.section>
      )}
    </AnimatePresence>
  );
}
