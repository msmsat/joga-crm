import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { authApi } from '../../../../api';
import { clearActiveToken, listAccounts, setActiveToken } from '../../../../utils/auth';

export function useLogout() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const logout = useMutation({
    mutationFn: () => authApi.logoutCurrentSession(),
    // Сервер не ответил — токен всё равно выбрасываем: пользователь просил выйти,
    // и оставить его залогиненным из-за сетевой ошибки хуже, чем не отозвать строку в БД.
    onSettled: () => {
      qc.clear();
      clearActiveToken();

      // Выход — из ОДНОГО аккаунта, а не из всех сразу. Если в связке остались
      // другие (utils/auth.ts), активируем последний использованный: иначе их
      // токены остались бы лежать без единого пути к ним — попасть в профиль,
      // где стоит переключатель, без активной сессии нельзя.
      const next = listAccounts()[0];
      if (next) {
        setActiveToken(next.token);
        // Полная перезагрузка: токен читает и api/client вне React-дерева.
        window.location.href = '/dashboard';
        return;
      }

      navigate('/', { replace: true });
    },
  });

  return {
    // .catch swallows a network error — onSettled already logged the user out
    // locally, so the caller (ConfirmModal) shouldn't treat this as a failed action.
    handleLogout: () => logout.mutateAsync().catch(() => {}),
    isLoggingOut: logout.isPending,
  };
}
