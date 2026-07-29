import { useTranslation } from 'react-i18next';
import { useAccounts } from './hooks/useAccounts';
import { useProfileForm } from './hooks/useProfileForm';
import LinkedAccounts from './components/sections/LinkedAccounts';
import SecuritySettings from './components/sections/SecuritySettings';
import ActiveSessionCard from './components/sections/ActiveSessionCard';
import PersonalInfoForm from './components/sections/PersonalInfoForm';
import { icons } from './components/ui/ProfileIcons';
import styles from './Profile.module.css';

export default function Profile() {
  const { t } = useTranslation(["profile", "common"]);

  const { studios, isLoading: studiosLoading, isError: studiosError, refetch: refetchStudios, switchingId, handleSwitchAccount } = useAccounts();
  const { userInfo, setUserInfo, email, isLoading, isSavingInfo, handleSaveInfo } = useProfileForm();

  return (
    <div className={styles.page}>
      <div style={{
        width: '100%', maxWidth: '980px',
        display: 'flex', flexDirection: 'column', gap: '32px',
        animation: 'fadeSlideIn 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards',
      }}>
        {/* Page header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ display: 'flex', padding: '12px', borderRadius: '14px', background: 'rgba(252,174,145,0.12)', color: 'var(--peach)' }}>
            {icons.shield}
          </div>
          <div>
            <h1 style={{ fontSize: '28px', fontWeight: 900, color: 'var(--onyx)', letterSpacing: '-0.8px', margin: '0 0 4px 0' }}>{t("profile:page.title")}</h1>
            <p style={{ fontSize: '13px', color: 'var(--muted)', margin: 0, fontWeight: 500 }}>{t("profile:page.sub")}</p>
          </div>
        </div>

        {/* Two-column grid */}
        <div className={styles.grid}>
          {/* Left column */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
            <LinkedAccounts
              studios={studios}
              isLoading={studiosLoading}
              isError={studiosError}
              refetch={refetchStudios}
              switchingId={switchingId}
              handleSwitchAccount={handleSwitchAccount}
            />
            <SecuritySettings />
          </div>

          {/* Right column */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
            <ActiveSessionCard />
            <PersonalInfoForm
              userInfo={userInfo}
              setUserInfo={setUserInfo}
              email={email}
              isLoading={isLoading}
              isSavingInfo={isSavingInfo}
              handleSaveInfo={handleSaveInfo}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
