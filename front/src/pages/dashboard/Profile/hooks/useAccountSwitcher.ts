import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { authApi } from '../../../../api';
import {
  forgetAccount, getActiveEmail, listAccounts, setActiveToken, type StoredAccount,
} from '../../../../utils/auth';
// Импорт напрямую из Toast, не из ui/index: index тянет Sidebar → UserMenu →
// хуки профиля, и через бочку получался цикл (та же причина, что в useAccounts).
import { useToast } from '../../../../components/ui/Toast';

/**
 * Переключение между аккаунтами РАЗНЫХ людей по сохранённым JWT.
 *
 * Не путать с `useAccounts`: тот меняет активную СТУДИЮ внутри одного аккаунта
 * (`/auth/select-studio`). Здесь меняется сам человек, и пароль не спрашивается —
 * его токен уже лежит в связке с прошлого входа (utils/auth.ts).
 */
export function useAccountSwitcher() {
  const qc = useQueryClient();
  const toast = useToast();
  const { t } = useTranslation('profile');

  const [accounts, setAccounts] = useState<StoredAccount[]>(() => listAccounts());
  const [switchingEmail, setSwitchingEmail] = useState<string | null>(null);
  const activeEmail = getActiveEmail();

  const switchTo = async (email: string) => {
    const target = accounts.find(a => a.email === email);
    if (!target || email === activeEmail || switchingEmail) return;

    setSwitchingEmail(email);
    try {
      // Токен проверяем ДО подмены активного: он мог протухнуть или быть отозван
      // на «Активных сессиях», и тогда переключение выбросило бы пользователя из
      // рабочего аккаунта в /login вместо честной ошибки.
      await authApi.verifyToken(target.token);
    } catch {
      forgetAccount(email);
      setAccounts(listAccounts());
      setSwitchingEmail(null);
      toast.error(t('accountSwitcher.expired', { email }));
      return;
    }

    setActiveToken(target.token);
    // Кэш набит данными прошлого аккаунта — иначе новый увидит чужие данные.
    qc.clear();
    // Полная перезагрузка, а не navigate: токен читают и модули вне React-дерева
    // (api/client), а до дашборда ещё дойдёт ProtectedRoute со свежим /auth/me.
    window.location.href = '/dashboard';
  };

  const forget = (email: string) => {
    forgetAccount(email);
    setAccounts(listAccounts());
    // Убрали активный — сидеть на защищённой странице больше не на чем.
    if (email === activeEmail) window.location.href = '/login';
  };

  return { accounts, activeEmail, switchingEmail, switchTo, forget };
}
