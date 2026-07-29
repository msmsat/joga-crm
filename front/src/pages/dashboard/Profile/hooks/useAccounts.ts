import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { authApi } from '../../../../api';
import { queryKeys } from '../../../../api/queryKeys';
import { errorMessage } from '../../../../api/errorMessage';
import { useToast } from '../../../../components/ui/index';

export function useAccounts() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { t } = useTranslation("profile");
  const toast = useToast();

  const { data: studios = [], isLoading, isError, refetch } = useQuery({
    queryKey: queryKeys.workspaces,
    queryFn: () => authApi.getStudios(),
  });

  const select = useMutation({
    mutationFn: (studioId: number) => authApi.selectStudio(studioId),
    onSuccess: (data) => {
      if (data.access_token) localStorage.setItem('token', data.access_token);
      // Кэш набит данными прошлой студии — иначе пользователь увидит чужие данные.
      qc.clear();
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
