import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { UserAccount } from '../types';
import { initialAccounts } from '../constants';

export function useAccounts(triggerToast: (msg: string) => void) {
  const navigate = useNavigate();
  const { t } = useTranslation("profile");
  const [accounts, setAccounts] = useState<UserAccount[]>(initialAccounts);
  const [isSwitching, setIsSwitching] = useState<number | null>(null);

  const handleSwitchAccount = (id: number) => {
    const acc = accounts.find(a => a.id === id);
    if (!acc || acc.active) return;
    setIsSwitching(id);
    setTimeout(() => {
      setAccounts(prev => prev.map(a => ({ ...a, active: a.id === id })));
      setIsSwitching(null);
      triggerToast(t("toasts.switchedAs", { email: acc.email }));
    }, 1200);
  };

  const handleLogoutAll = () => {
    triggerToast(t("toasts.logoutAll"));
    setTimeout(() => {
      localStorage.removeItem('token');
      navigate('/login');
    }, 1500);
  };

  return { accounts, setAccounts, isSwitching, handleSwitchAccount, handleLogoutAll };
}
