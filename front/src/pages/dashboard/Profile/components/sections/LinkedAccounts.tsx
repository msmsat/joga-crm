import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import styles from '../../Profile.module.css';
import type { UserAccount } from '../../types';
import { icons } from '../ui/ProfileIcons';

interface Props {
  accounts: UserAccount[];
  isSwitching: number | null;
  handleSwitchAccount: (id: number) => void;
}

export default function LinkedAccounts({ accounts, isSwitching, handleSwitchAccount }: Props) {
  const navigate = useNavigate();
  const { t } = useTranslation(["profile", "common"]);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', padding: '0 4px' }}>
        <h3 style={{ fontSize: '15px', fontWeight: 800, color: 'var(--onyx)', margin: 0 }}>{t("profile:accounts.title")}</h3>
        <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--muted)', background: 'rgba(0,0,0,0.04)', padding: '3px 10px', borderRadius: '100px' }}>
          {t("profile:accounts.count", { count: accounts.length })}
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {accounts.map(acc => {
          const loading = isSwitching === acc.id;
          return (
            <div
              key={acc.id}
              className={`${styles.accCard} ${acc.active ? styles.accCardActive : ''}`}
              onClick={() => handleSwitchAccount(acc.id)}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '16px', borderRadius: '16px',
                background: acc.active ? 'rgba(252,174,145,0.03)' : '#FFFFFF',
                border: `1.5px solid ${acc.active ? 'var(--peach)' : 'rgba(26,26,26,0.06)'}`,
                cursor: acc.active ? 'default' : 'pointer',
                boxShadow: acc.active ? '0 8px 24px rgba(252,174,145,0.12)' : '0 2px 6px rgba(0,0,0,0.015)',
                transform: loading ? 'scale(0.98)' : 'none',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <div style={{
                  width: '40px', height: '40px', borderRadius: '12px',
                  background: `${acc.color}15`, color: acc.color,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '14px', fontWeight: 800,
                }}>
                  {acc.name.split(' ').map(n => n[0]).join('')}
                </div>
                <div>
                  <div style={{ fontSize: '13.5px', fontWeight: 700, color: 'var(--onyx)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {acc.name}
                    {acc.active && (
                      <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '14px', height: '14px', background: 'var(--peach)', color: 'white', borderRadius: '50%' }}>
                        {icons.check}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: '11.5px', color: 'var(--muted)', marginTop: '1px' }}>{acc.email}</div>
                </div>
              </div>

              <div>
                {loading ? (
                  <div className={styles.spinAnim} style={{ color: 'var(--peach)' }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                    </svg>
                  </div>
                ) : acc.active ? (
                  <span style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--peach)' }}>{t("common:status.active")}</span>
                ) : (
                  <div className={styles.accAction}>
                    {t("profile:accounts.enter")} {icons.arrowRight}
                  </div>
                )}
              </div>
            </div>
          );
        })}

        <div className={styles.addAccountBtn} onClick={() => navigate('/register')}>
          <div className={styles.iconWrapper}>{icons.plus}</div>
          <span style={{ flex: 1 }}>{t("profile:accounts.createNew")}</span>
          <div className={styles.addArrow}>{icons.arrowRight}</div>
        </div>
      </div>
    </div>
  );
}
