import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import styles from '../../Profile.module.css';
import { Button, EmptyState } from '../../../../../components/ui/index';
import { useAccountSwitcher } from '../../hooks/useAccountSwitcher';
import { icons } from '../ui/ProfileIcons';

function initials(value: string): string {
  const parts = value.trim().split(/\s+/).slice(0, 2);
  return parts.map(w => w[0]?.toUpperCase() ?? '').join('') || value[0]?.toUpperCase() || '?';
}

/**
 * Аккаунты РАЗНЫХ людей, вход в которые уже выполнялся на этом устройстве.
 * Ниже по странице LinkedAccounts показывает студии активного аккаунта — это
 * другая ось, их намеренно не смешиваем в один список.
 */
export default function AccountSwitcher() {
  const navigate = useNavigate();
  const { t } = useTranslation(['profile', 'common']);
  const { accounts, activeEmail, switchingEmail, switchTo, forget } = useAccountSwitcher();

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', padding: '0 4px' }}>
        <h3 style={{ fontSize: '15px', fontWeight: 800, color: 'var(--onyx)', margin: 0 }}>{t('profile:accountSwitcher.title')}</h3>
        <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--muted)', background: 'rgba(0,0,0,0.04)', padding: '3px 10px', borderRadius: '100px' }}>
          {t('profile:accountSwitcher.count', { count: accounts.length })}
        </span>
      </div>

      {accounts.length === 0 ? (
        <EmptyState
          size="sm"
          icon="search"
          title={t('profile:accountSwitcher.emptyTitle')}
          action={<Button variant="ghost" size="sm" onClick={() => navigate('/login?switch=1')}>{t('profile:accountSwitcher.add')}</Button>}
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {accounts.map(account => {
            const isCurrent = account.email === activeEmail;
            const loading = switchingEmail === account.email;
            const label = account.name || account.email;
            return (
              <div
                key={account.email}
                className={`${styles.accCard} ${isCurrent ? styles.accCardActive : ''}`}
                onClick={() => switchTo(account.email)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '16px', borderRadius: '16px',
                  background: isCurrent ? 'rgba(252,174,145,0.03)' : '#FFFFFF',
                  border: `1.5px solid ${isCurrent ? 'var(--peach)' : 'rgba(26,26,26,0.06)'}`,
                  cursor: isCurrent ? 'default' : 'pointer',
                  boxShadow: isCurrent ? '0 8px 24px rgba(252,174,145,0.12)' : '0 2px 6px rgba(0,0,0,0.015)',
                  transform: loading ? 'scale(0.98)' : 'none',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px', minWidth: 0 }}>
                  <div style={{
                    width: '40px', height: '40px', borderRadius: '50%', flexShrink: 0,
                    background: isCurrent ? 'linear-gradient(135deg,#FCAE91,#F9A08B)' : 'rgba(26,26,26,0.06)',
                    color: isCurrent ? '#FFFFFF' : 'var(--muted)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '13px', fontWeight: 800,
                  }}>
                    {initials(label)}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: '13.5px', fontWeight: 700, color: 'var(--onyx)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
                      {isCurrent && (
                        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '14px', height: '14px', background: 'var(--peach)', color: 'white', borderRadius: '50%', flexShrink: 0 }}>
                          {icons.check}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '11.5px', color: 'var(--muted)', marginTop: '1px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {account.email}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                  {loading ? (
                    <div className={styles.spinAnim} style={{ color: 'var(--peach)' }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                        <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                      </svg>
                    </div>
                  ) : isCurrent ? (
                    <span style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--peach)' }}>{t('common:status.active')}</span>
                  ) : (
                    <>
                      <div className={styles.accAction}>{t('profile:accounts.enter')} {icons.arrowRight}</div>
                      <button
                        type="button"
                        title={t('profile:accountSwitcher.forget')}
                        onClick={e => { e.stopPropagation(); forget(account.email); }}
                        style={{ display: 'flex', padding: '6px', background: 'transparent', border: 'none', borderRadius: '8px', color: 'var(--muted)', cursor: 'pointer' }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}

          {/* Вход в ещё один аккаунт: ?switch=1 не даёт PublicRoute увести на
              дашборд, а текущий токен остаётся в связке — оба будут в списке. */}
          <Button variant="dark" icon={icons.plus} style={{ marginTop: '6px' }} onClick={() => navigate('/login?switch=1')}>
            {t('profile:accountSwitcher.add')}
          </Button>
        </div>
      )}
    </div>
  );
}
