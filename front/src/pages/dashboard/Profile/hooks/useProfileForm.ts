import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { authApi, ApiError } from '../../../../api';
import type { UserInfo } from '../types';
import { emptyUserInfo } from '../constants';

export function useProfileForm(triggerToast: (msg: string) => void) {
  const { t } = useTranslation("profile");
  const [userInfo, setUserInfo] = useState<UserInfo>(emptyUserInfo);
  const [isSavingInfo, setIsSavingInfo] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    authApi.getMe(controller.signal)
      .then(me => setUserInfo({
        name: me.name ?? '',
        email: me.email ?? '',
        phone: me.phone ?? '',
      }))
      .catch(() => { /* 401 обрабатывает клиент; иначе остаётся пустая форма */ });
    return () => controller.abort();
  }, []);

  const handleSaveInfo = async () => {
    setIsSavingInfo(true);
    try {
      const me = await authApi.updateMe({
        name: userInfo.name,
        phone: userInfo.phone || null,
      });
      setUserInfo({ name: me.name ?? '', email: me.email ?? '', phone: me.phone ?? '' });
      triggerToast(t("toasts.infoSaved"));
    } catch (error) {
      triggerToast(error instanceof ApiError ? error.message : t("toasts.infoSaveError"));
    } finally {
      setIsSavingInfo(false);
    }
  };

  return { userInfo, setUserInfo, isSavingInfo, handleSaveInfo };
}
