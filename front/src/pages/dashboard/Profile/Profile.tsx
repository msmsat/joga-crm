import { useState } from 'react';
import { useAccounts } from './hooks/useAccounts';
import { useProfileForm } from './hooks/useProfileForm';
import LinkedAccounts from './components/sections/LinkedAccounts';
import SecuritySettings from './components/sections/SecuritySettings';
import ActiveSessionCard from './components/sections/ActiveSessionCard';
import PersonalInfoForm from './components/sections/PersonalInfoForm';
import Toast from './components/ui/Toast';
import { icons } from './components/ui/ProfileIcons';

export default function Profile() {
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const triggerToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3000);
  };

  const { accounts, setAccounts, isSwitching, handleSwitchAccount, handleLogoutAll } = useAccounts(triggerToast);
  const { userInfo, setUserInfo, isSavingInfo, handleSaveInfo } = useProfileForm(triggerToast, setAccounts);

  return (
    <div style={{
      width: '100%', minHeight: 'calc(100vh - 80px)',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      padding: '40px', boxSizing: 'border-box',
    }}>
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
            <h1 style={{ fontSize: '28px', fontWeight: 900, color: 'var(--onyx)', letterSpacing: '-0.8px', margin: '0 0 4px 0' }}>Ваш профиль</h1>
            <p style={{ fontSize: '13px', color: 'var(--muted)', margin: 0, fontWeight: 500 }}>Управление личными данными и сессиями</p>
          </div>
        </div>

        {/* Two-column grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '380px 1fr', gap: '40px', alignItems: 'start' }}>
          {/* Left column */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
            <LinkedAccounts
              accounts={accounts}
              isSwitching={isSwitching}
              handleSwitchAccount={handleSwitchAccount}
            />
            <SecuritySettings handleLogoutAll={handleLogoutAll} />
          </div>

          {/* Right column */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
            <ActiveSessionCard accounts={accounts} />
            <PersonalInfoForm
              userInfo={userInfo}
              setUserInfo={setUserInfo}
              isSavingInfo={isSavingInfo}
              handleSaveInfo={handleSaveInfo}
            />
          </div>
        </div>
      </div>

      <Toast message={toastMsg} />
    </div>
  );
}
