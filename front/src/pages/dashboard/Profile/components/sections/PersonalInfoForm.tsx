import { useTranslation } from 'react-i18next';
import { Button, Input } from '../../../../../components/ui/index';
import type { UserInfo } from '../../types';

interface Props {
  userInfo: UserInfo;
  setUserInfo: (info: UserInfo) => void;
  email: string;
  isLoading: boolean;
  isSavingInfo: boolean;
  handleSaveInfo: () => void;
}

export default function PersonalInfoForm({ userInfo, setUserInfo, email, isLoading, isSavingInfo, handleSaveInfo }: Props) {
  const { t } = useTranslation(["profile", "common"]);
  return (
    <div style={{ padding: '32px', background: '#FFFFFF', border: '1px solid var(--border)', borderRadius: '24px', boxShadow: '0 8px 32px rgba(0,0,0,0.02)' }}>
      <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--onyx)', marginBottom: '24px', letterSpacing: '-0.2px' }}>
        {t("profile:personalInfo.heading")}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
          <Input
            label={t("common:fields.firstName")}
            value={userInfo.name}
            onChange={v => setUserInfo({ ...userInfo, name: v })}
            disabled={isLoading}
          />
          <Input
            label={t("common:fields.lastName")}
            value={userInfo.last_name}
            onChange={v => setUserInfo({ ...userInfo, last_name: v })}
            disabled={isLoading}
          />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
          <div>
            <Input
              label={t("common:fields.email")}
              type="email"
              value={email}
              onChange={() => {}}
              disabled
            />
            <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '6px', lineHeight: 1.4 }}>
              {t("profile:personalInfo.emailLocked")}
            </div>
          </div>
          <Input
            label={t("common:fields.phone")}
            value={userInfo.phone}
            onChange={v => setUserInfo({ ...userInfo, phone: v })}
            disabled={isLoading}
          />
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '24px' }}>
        <Button variant="primary" onClick={handleSaveInfo} loading={isSavingInfo}>
          {t("common:buttons.saveChanges")}
        </Button>
      </div>
    </div>
  );
}
