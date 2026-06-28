import { useTranslation } from 'react-i18next';
import styles from '../../Profile.module.css';
import type { UserInfo } from '../../types';
import PremiumInput from '../ui/PremiumInput';

interface Props {
  userInfo: UserInfo;
  setUserInfo: (info: UserInfo) => void;
  isSavingInfo: boolean;
  handleSaveInfo: () => void;
}

const spinnerSvg = (
  <svg className={styles.spinAnim} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
    <circle cx="12" cy="12" r="10" strokeOpacity="0.2" />
    <path d="M12 2a10 10 0 0 1 10 10" />
  </svg>
);

export default function PersonalInfoForm({ userInfo, setUserInfo, isSavingInfo, handleSaveInfo }: Props) {
  const { t } = useTranslation(["profile", "common"]);
  return (
    <div style={{ padding: '32px', background: '#FFFFFF', border: '1px solid var(--border)', borderRadius: '24px', boxShadow: '0 8px 32px rgba(0,0,0,0.02)' }}>
      <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--onyx)', marginBottom: '24px', letterSpacing: '-0.2px' }}>
        {t("profile:personalInfo.heading")}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <PremiumInput
          label={t("common:fields.fullName")}
          value={userInfo.name}
          onChange={v => setUserInfo({ ...userInfo, name: v })}
        />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
          <PremiumInput
            label={t("common:fields.email")}
            type="email"
            value={userInfo.email}
            onChange={v => setUserInfo({ ...userInfo, email: v })}
          />
          <PremiumInput
            label={t("common:fields.phone")}
            value={userInfo.phone}
            onChange={v => setUserInfo({ ...userInfo, phone: v })}
          />
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '24px' }}>
        <button
          onClick={handleSaveInfo}
          disabled={isSavingInfo}
          style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            padding: '12px 24px', borderRadius: '12px',
            background: 'var(--peach)', border: 'none',
            color: 'white', fontSize: '13px', fontWeight: 700,
            cursor: isSavingInfo ? 'default' : 'pointer',
            boxShadow: '0 8px 24px rgba(252,174,145,0.3)',
            transition: 'all 0.25s cubic-bezier(0.34, 1.5, 0.64, 1)',
          }}
          onMouseEnter={e => { if (!isSavingInfo) e.currentTarget.style.transform = 'translateY(-2px)'; }}
          onMouseLeave={e => { if (!isSavingInfo) e.currentTarget.style.transform = 'none'; }}
        >
          {isSavingInfo ? spinnerSvg : t("common:buttons.saveChanges")}
        </button>
      </div>
    </div>
  );
}
