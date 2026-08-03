import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import styles from '../../Profile.module.css';
import { Button } from '../../../../../components/ui/index';
import { forgetAccount, listRecentAccounts } from '../../../../../utils/auth';
import { icons } from '../ui/ProfileIcons';

function initials(value: string): string {
  const parts = value.trim().split(/\s+/).slice(0, 2);
  return parts.map(w => w[0]?.toUpperCase() ?? '').join('') || value[0]?.toUpperCase() || '?';
}

/**
 * Вход в ДРУГОЙ аккаунт (другого человека) — не путать со студиями выше: те
 * принадлежат этому же аккаунту и переключаются без пароля.
 *
 * Список всех входивших аккаунтов с живыми токенами убран сознательно: держать
 * в браузере несколько открытых сессий разных людей — это не удобство, а
 * незакрытая дверь. Здесь остаются только адреса, куда можно вернуться, вход по
 * ним обычный — с паролем (utils/auth.ts).
 */
export default function AnotherAccount() {
  const navigate = useNavigate();
  const { t } = useTranslation(['profile', 'common']);
  const [recent, setRecent] = useState(() => listRecentAccounts());

  const goLogin = (email?: string) =>
    navigate(`/login?switch=1${email ? `&email=${encodeURIComponent(email)}` : ''}`);

  return (
    <div>
      <div style={{ marginBottom: '16px', padding: '0 4px' }}>
        <h3 style={{ fontSize: '15px', fontWeight: 800, color: 'var(--onyx)', margin: 0 }}>
          {t('profile:otherAccount.title')}
        </h3>
        <p style={{ fontSize: '12px', color: 'var(--muted)', margin: '4px 0 0', lineHeight: 1.5 }}>
          {t('profile:otherAccount.sub')}
        </p>
      </div>

      {/* На телефоне кнопки не растягиваются на пол-экрана каждая (см. .authRow):
          это редкое действие — войти в чужой аккаунт, — а не главный CTA страницы. */}
      <div className={styles.authRow} style={{ display: 'flex', gap: '10px' }}>
        <Button variant="primary" icon={icons.login} style={{ flex: 1 }} onClick={() => goLogin()}>
          {t('profile:accounts.login')}
        </Button>
        <Button variant="dark" icon={icons.plus} style={{ flex: 1 }} onClick={() => navigate('/register')}>
          {t('profile:accounts.register')}
        </Button>
      </div>

      {recent.length > 0 && (
        <div style={{ marginTop: '18px' }}>
          <div style={{ fontSize: '10.5px', fontWeight: 800, letterSpacing: '0.6px', textTransform: 'uppercase', color: 'var(--muted)', margin: '0 0 8px 4px' }}>
            {t('profile:otherAccount.recentTitle')}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {recent.map(account => (
              <div key={account.email} className={styles.recentRow} onClick={() => goLogin(account.email)}>
                <span className={styles.recentAvatar}>{initials(account.name || account.email)}</span>
                <span style={{ minWidth: 0, flex: 1 }}>
                  <span className={styles.recentName}>{account.name || account.email}</span>
                  {account.name && <span className={styles.recentMail}>{account.email}</span>}
                </span>
                <span className={styles.recentAction}>{t('profile:otherAccount.return')}</span>
                <button
                  type="button"
                  title={t('profile:otherAccount.forget')}
                  className={styles.recentForget}
                  onClick={e => {
                    e.stopPropagation();
                    forgetAccount(account.email);
                    setRecent(listRecentAccounts());
                  }}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
