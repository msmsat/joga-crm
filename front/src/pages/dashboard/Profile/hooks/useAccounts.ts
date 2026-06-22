import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { UserAccount } from '../types';
import { initialAccounts } from '../constants';

export function useAccounts(triggerToast: (msg: string) => void) {
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState<UserAccount[]>(initialAccounts);
  const [isSwitching, setIsSwitching] = useState<string | null>(null);

  const handleSwitchAccount = (id: string) => {
    const acc = accounts.find(a => a.id === id);
    if (!acc || acc.active) return;
    setIsSwitching(id);
    setTimeout(() => {
      setAccounts(prev => prev.map(a => ({ ...a, active: a.id === id })));
      setIsSwitching(null);
      triggerToast(`Выполнен вход как ${acc.email}`);
    }, 1200);
  };

  const handleLogoutAll = () => {
    triggerToast('Безопасный выход из всех аккаунтов...');
    setTimeout(() => {
      localStorage.removeItem('token');
      navigate('/login');
    }, 1500);
  };

  return { accounts, setAccounts, isSwitching, handleSwitchAccount, handleLogoutAll };
}
