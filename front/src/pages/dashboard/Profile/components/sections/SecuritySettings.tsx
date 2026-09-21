import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { icons } from '../ui/ProfileIcons';
import { ChangePasswordModal } from '../../../Settings/components/modals/ChangePasswordModal';
import { DeleteAccountModal } from '../modals/DeleteAccountModal';
import { useLogout } from '../../hooks/useLogout';
import { CookieIcon } from '../../../../../components/cookies/CookieIcon';
import { openCookieSettings } from '../../../../../utils/cookieConsent';

// Нейтральная кнопка блока: персиковая обводка и подъём при наведении.
function NeutralButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
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
      {children}
    </button>
  );
}

export default function SecuritySettings({ email }: { email: string }) {
  const { t } = useTranslation(["profile", "cookies"]);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const { handleLogout, isLoggingOut } = useLogout();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <NeutralButton onClick={() => setShowPasswordModal(true)}>
        <span style={{ color: 'var(--muted)' }}>{icons.key}</span> {t("security.changePassword")}
      </NeutralButton>

      {/* Отозвать согласие на cookie так же просто, как дать (ст. 7(3) GDPR):
          вошедшему в кабинет подвал лендинга не попадается, поэтому окно
          открывается и отсюда. */}
      <NeutralButton onClick={openCookieSettings}>
        <span style={{ color: 'var(--muted)', display: 'flex' }}><CookieIcon size={16} /></span> {t("cookies:profile.button")}
      </NeutralButton>

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

      {/* Удаление аккаунта — ниже выхода и отделено воздухом: соседство с
          «Выйти» без отступа сделало бы промах пальцем необратимым. Обводка
          вместо заливки: это не действие, которое предлагают, а действие,
          которое должно быть доступно. */}
      <button
        onClick={() => setShowDeleteModal(true)}
        style={{
          marginTop: '12px',
          display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: '10px',
          padding: '16px 20px', borderRadius: '14px',
          background: 'transparent', border: '1.5px solid rgba(216,140,154,0.3)',
          color: '#C0607A', fontSize: '13px', fontWeight: 700,
          cursor: 'pointer', transition: 'all 0.2s',
        }}
        onMouseEnter={e => {
          e.currentTarget.style.background = 'rgba(216,140,154,0.08)';
          e.currentTarget.style.borderColor = '#D88C9A';
        }}
        onMouseLeave={e => {
          e.currentTarget.style.background = 'transparent';
          e.currentTarget.style.borderColor = 'rgba(216,140,154,0.3)';
        }}
      >
        {icons.trash} {t("security.deleteAccount.button")}
      </button>

      {showPasswordModal && (
        <ChangePasswordModal
          onClose={() => setShowPasswordModal(false)}
          onSuccess={() => setShowPasswordModal(false)}
        />
      )}

      {showDeleteModal && (
        <DeleteAccountModal email={email} onClose={() => setShowDeleteModal(false)} />
      )}
    </div>
  );
}
