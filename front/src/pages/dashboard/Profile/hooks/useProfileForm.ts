import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { authApi } from '../../../../api';
import { queryKeys } from '../../../../api/queryKeys';
import { errorMessage } from '../../../../api/errorMessage';
import { useToast } from '../../../../components/ui/index';
import { useContactCheck } from '../../../../hooks/useContactCheck';
import type { UserInfo } from '../types';

export function useProfileForm() {
  const qc = useQueryClient();
  const toast = useToast();
  const { t } = useTranslation('profile');

  const { data: me, isLoading } = useQuery({
    queryKey: queryKeys.me,
    queryFn: () => authApi.getMe(),
    staleTime: 60_000, // тот же staleTime, что в useSecurity — один кэш на двоих
  });

  // Черновик формы: пока пользователь не тронул поле — показываем серверное значение.
  const [draft, setDraft] = useState<Partial<UserInfo>>({});
  const userInfo: UserInfo = {
    name:      draft.name      ?? me?.name      ?? '',
    last_name: draft.last_name ?? me?.last_name  ?? '',
    phone:     draft.phone     ?? me?.phone      ?? '',
  };

  // Телефон — контакт аккаунта: занят другим пользователем → «Сохранить» серая.
  // Свой номер сервер из проверки исключает сам (/auth/check-contact), а неизменённый
  // не проверяем вовсе — как и PATCH /me.
  const phoneCheck = useContactCheck('user', 'phone', userInfo.phone, {
    enabled: userInfo.phone.replace(/\D/g, '').length >= 6 && userInfo.phone !== (me?.phone ?? ''),
  });

  const save = useMutation({
    mutationFn: () => authApi.updateMe({
      name: userInfo.name,
      last_name: userInfo.last_name || null,
      phone: userInfo.phone || null,
    }),
    onSuccess: (updated) => {
      // Ответ PATCH — это готовый UserMe: кладём его в кэш вместо повторного GET.
      qc.setQueryData(queryKeys.me, updated);
      setDraft({}); // черновик слит с сервером — дальше показываем кэш
      toast.success(t('toasts.infoSaved'));
    },
    onError: (err) => toast.error(errorMessage(err, t)),
  });

  return {
    userInfo,
    setUserInfo: (info: UserInfo) => setDraft(info),
    email: me?.email ?? '',
    isLoading,
    isSavingInfo: save.isPending,
    phoneTaken: phoneCheck.taken,
    isCheckingPhone: phoneCheck.checking,
    handleSaveInfo: () => save.mutate(),
  };
}
