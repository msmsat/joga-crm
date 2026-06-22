import { useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { UserAccount, UserInfo } from '../types';
import { initialUserInfo } from '../constants';

export function useProfileForm(
  triggerToast: (msg: string) => void,
  setAccounts: Dispatch<SetStateAction<UserAccount[]>>,
) {
  const [userInfo, setUserInfo] = useState<UserInfo>(initialUserInfo);
  const [isSavingInfo, setIsSavingInfo] = useState(false);

  const handleSaveInfo = () => {
    setIsSavingInfo(true);
    setTimeout(() => {
      setIsSavingInfo(false);
      triggerToast('Личные данные успешно обновлены');
      setAccounts(prev =>
        prev.map(a => a.id === '1' ? { ...a, name: userInfo.name, email: userInfo.email } : a),
      );
    }, 1000);
  };

  return { userInfo, setUserInfo, isSavingInfo, handleSaveInfo };
}
