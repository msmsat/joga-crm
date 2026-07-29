import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { authApi } from '../../../../api';

export function useLogout() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const logout = useMutation({
    mutationFn: () => authApi.logoutCurrentSession(),
    // Сервер не ответил — токен всё равно выбрасываем: пользователь просил выйти,
    // и оставить его залогиненным из-за сетевой ошибки хуже, чем не отозвать строку в БД.
    onSettled: () => {
      qc.clear();
      localStorage.removeItem('token');
      navigate('/login', { replace: true });
    },
  });

  return {
    // .catch swallows a network error — onSettled already logged the user out
    // locally, so the caller (ConfirmModal) shouldn't treat this as a failed action.
    handleLogout: () => logout.mutateAsync().catch(() => {}),
    isLoggingOut: logout.isPending,
  };
}
