import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { icons } from '../ui/ProfileIcons';
import { ChangePasswordModal } from '../../../Settings/components/modals/ChangePasswordModal';
import { useLogout } from '../../hooks/useLogout';

export default function SecuritySettings() {
  const { t } = useTranslation("profile");
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const { handleLogout, isLoggingOut } = useLogout();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <button
        onClick={() => setShowPasswordModal(true)}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: '10px',
          padding: '16px 20px', borderRadius: '14px',
          background: 'var(--bg-card)', border: '1.5px solid rgba(var(--ink),0.06)',
          color: 'var(--onyx)', fontSize: '13px', fontWeight: 700,
          cursor: 'pointer', transition: 'all 0.2s', boxShadow: '0 2px 6px rgba(0,0,0,0.015)',
        }}
        onMouseEnter={e => {
          e.currentTarget.style.borderColor = 'var(--peach)';
          e.currentTarget.style.color = 'var(--peach)';
          e.currentTarget.style.transform = 'translateY(-2px)';
          e.currentTarget.style.boxShadow = '0 8px 24px rgba(252,174,145,0.12)';
        }}
        onMouseLeave={e => {
          e.currentTarget.style.borderColor = 'rgba(var(--ink),0.06)';
          e.currentTarget.style.color = 'var(--onyx)';
          e.currentTarget.style.transform = 'none';
          e.currentTarget.style.boxShadow = '0 2px 6px rgba(0,0,0,0.015)';
        }}
      >
        <span style={{ color: 'var(--muted)' }}>{icons.key}</span> {t("security.changePassword")}
      </button>

      <button
        onClick={() => handleLogout()}
        disabled={isLoggingOut}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: '10px',
          padding: '16px 20px', borderRadius: '14px',
          background: 'rgba(216,140,154,0.06)', border: '1.5px solid transparent',
          color: '#C0607A', fontSize: '13px', fontWeight: 700,
          cursor: 'pointer', transition: 'all 0.2s',
        }}
        onMouseEnter={e => {
          e.currentTarget.style.background = 'rgba(216,140,154,0.12)';
          e.currentTarget.style.borderColor = 'rgba(216,140,154,0.2)';
          e.currentTarget.style.transform = 'translateY(-2px)';
        }}
        onMouseLeave={e => {
          e.currentTarget.style.background = 'rgba(216,140,154,0.06)';
          e.currentTarget.style.borderColor = 'transparent';
          e.currentTarget.style.transform = 'none';
        }}
      >
        {icons.logout} {t("security.logout")}
      </button>

      {showPasswordModal && (
        <ChangePasswordModal
          onClose={() => setShowPasswordModal(false)}
          onSuccess={() => setShowPasswordModal(false)}
        />
      )}
    </div>
  );
}
