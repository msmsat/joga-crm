import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import styles from '../../Profile.module.css';
import { resolveImageUrl } from '../../../../../api/client';
import { Button, EmptyState } from '../../../../../components/ui/index';
import type { StudioListItem } from '../../../../../api/auth/auth.types';
import { icons } from '../ui/ProfileIcons';

// Инициалы студии для карточки без лого — первые буквы первых двух слов названия
// (как в StudioCard на /select-crm).
function initials(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('');
}

interface Props {
  studios: StudioListItem[];
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
  switchingId: number | null;
  handleSwitchAccount: (id: number) => void;
}

export default function LinkedAccounts({ studios, isLoading, isError, refetch, switchingId, handleSwitchAccount }: Props) {
  const navigate = useNavigate();
  const { t } = useTranslation(["profile", "common", "settings", "staff"]);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', padding: '0 4px' }}>
        <h3 style={{ fontSize: '15px', fontWeight: 800, color: 'var(--onyx)', margin: 0 }}>{t("profile:accounts.title")}</h3>
        <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--muted)', background: 'rgba(0,0,0,0.04)', padding: '3px 10px', borderRadius: '100px' }}>
          {t("profile:accounts.count", { count: studios.length })}
        </span>
      </div>

      {isLoading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '32px 0' }}>
          <span className={styles.spinAnim} style={{ color: 'var(--peach)' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
          </span>
        </div>
      ) : isError ? (
        <EmptyState
          size="sm"
          icon="search"
          title={t("settings:workspace.loadError")}
          action={<Button variant="ghost" size="sm" onClick={() => refetch()}>{t("common:errors.retry")}</Button>}
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {studios.map(studio => {
            const loading = switchingId === studio.id;
            const logoSrc = resolveImageUrl(studio.logo_url);
            return (
              <div
                key={studio.id}
                className={`${styles.accCard} ${studio.is_current ? styles.accCardActive : ''}`}
                onClick={() => handleSwitchAccount(studio.id)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '16px', borderRadius: '16px',
                  background: studio.is_current ? 'rgba(252,174,145,0.03)' : '#FFFFFF',
                  border: `1.5px solid ${studio.is_current ? 'var(--peach)' : 'rgba(26,26,26,0.06)'}`,
                  cursor: studio.is_current ? 'default' : 'pointer',
                  boxShadow: studio.is_current ? '0 8px 24px rgba(252,174,145,0.12)' : '0 2px 6px rgba(0,0,0,0.015)',
                  transform: loading ? 'scale(0.98)' : 'none',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                  <div style={{
                    width: '40px', height: '40px', borderRadius: '12px',
                    background: logoSrc ? 'transparent' : 'rgba(252,174,145,0.12)', color: 'var(--peach)',
                    overflow: 'hidden',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '14px', fontWeight: 800,
                  }}>
                    {logoSrc ? <img src={logoSrc} alt={studio.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : initials(studio.name)}
                  </div>
                  <div>
                    <div style={{ fontSize: '13.5px', fontWeight: 700, color: 'var(--onyx)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      {studio.name}
                      {studio.is_current && (
                        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '14px', height: '14px', background: 'var(--peach)', color: 'white', borderRadius: '50%' }}>
                          {icons.check}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '11.5px', color: 'var(--muted)', marginTop: '1px' }}>
                      {t(`staff:roles.${studio.role}`, { defaultValue: studio.role })} · {t("settings:workspace.membersCount", { count: studio.members_count })}
                    </div>
                  </div>
                </div>

                <div>
                  {loading ? (
                    <div className={styles.spinAnim} style={{ color: 'var(--peach)' }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                        <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                      </svg>
                    </div>
                  ) : studio.is_current ? (
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

          {/* Вход/регистрация в другой аккаунт: текущий токен не трогаем —
              ?switch=1 отключает редирект PublicRoute на дашборд. */}
          <div style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
            <Button variant="primary" icon={icons.login} style={{ flex: 1 }} onClick={() => navigate('/login?switch=1')}>
              {t("profile:accounts.login")}
            </Button>
            <Button variant="dark" icon={icons.plus} style={{ flex: 1 }} onClick={() => navigate('/register')}>
              {t("profile:accounts.register")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
