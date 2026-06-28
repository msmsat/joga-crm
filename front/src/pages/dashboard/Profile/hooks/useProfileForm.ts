import { useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';
import type { UserAccount, UserInfo } from '../types';
import { initialUserInfo } from '../constants';

export function useProfileForm(
  triggerToast: (msg: string) => void,
  setAccounts: Dispatch<SetStateAction<UserAccount[]>>,
) {
  const { t } = useTranslation("profile");
  const [userInfo, setUserInfo] = useState<UserInfo>(initialUserInfo);
  const [isSavingInfo, setIsSavingInfo] = useState(false);

  const handleSaveInfo = () => {
    setIsSavingInfo(true);
    setTimeout(() => {
      setIsSavingInfo(false);
      triggerToast(t("toasts.infoSaved"));
      setAccounts(prev =>
        prev.map(a => a.id === 1 ? { ...a, name: userInfo.name, email: userInfo.email } : a),
      );
    }, 1000);
  };

  return { userInfo, setUserInfo, isSavingInfo, handleSaveInfo };
}
