import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { authApi } from '../../../../api';
import { queryKeys } from '../../../../api/queryKeys';
import { errorMessage } from '../../../../api/errorMessage';
// Импорт напрямую из Toast, не из ui/index: index экспортирует Sidebar, а тот
// тянет UserMenu → этот хук — через бочку получался цикл импортов.
import { useToast } from '../../../../components/ui/Toast';
import { setActiveToken } from '../../../../utils/auth';

export function useAccounts() {
  const navigate = useNavigate();
  const { t } = useTranslation("profile");
  const toast = useToast();

  const { data: studios = [], isLoading, isError, refetch } = useQuery({
    queryKey: queryKeys.workspaces,
    queryFn: () => authApi.getStudios(),
  });

  const select = useMutation({
    mutationFn: (studioId: number) => authApi.selectStudio(studioId),
    onSuccess: (data) => {
      // Кэш прошлой студии чистит сам setActiveToken — иначе увидим чужие данные.
      if (data.access_token) setActiveToken(data.access_token);
      navigate('/dashboard');
    },
    onError: (err) => toast.error(errorMessage(err, t)),
  });

  const handleSwitchAccount = (studioId: number) => {
    const studio = studios.find(s => s.id === studioId);
    if (!studio || studio.is_current || select.isPending) return;
    select.mutate(studioId);
  };

  return {
    studios,
    isLoading,
    isError,
    refetch,
    switchingId: select.isPending ? select.variables ?? null : null,
    handleSwitchAccount,
  };
}
