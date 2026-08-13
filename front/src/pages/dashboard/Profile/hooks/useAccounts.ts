import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { authApi } from '../../../../api';
import { queryKeys } from '../../../../api/queryKeys';
import { errorMessage } from '../../../../api/errorMessage';
// Импорт напрямую из Toast, не из ui/index: index экспортирует Sidebar, а тот
// тянет UserMenu → этот хук — через бочку получался цикл импортов.
import { useToast } from '../../../../components/ui/Toast';
import { saveThemeSeed, setActiveToken } from '../../../../utils/auth';

export function useAccounts() {
  const { t } = useTranslation("profile");
  const qc = useQueryClient();
  const toast = useToast();

  const { data: studios = [], isLoading, isError, refetch } = useQuery({
    queryKey: queryKeys.workspaces,
    queryFn: () => authApi.getStudios(),
  });

  const select = useMutation({
    mutationFn: (studioId: number) => authApi.selectStudio(studioId),
    onSuccess: (data) => {
      // Тема аккаунта известна прямо сейчас — кладём её в затравку ДО смены
      // токена (setActiveToken сбросит кэш) и до перезагрузки. Затравку читает
      // инлайн-скрипт в index.html: новая студия открывается сразу в нужном
      // цвете, а не белеет, пока грузится бандл и летит запрос настроек.
      const theme = qc.getQueryData<{ theme?: string | null }>(queryKeys.appearance)?.theme;
      if (theme) saveThemeSeed(theme);
      if (data.access_token) setActiveToken(data.access_token);
      // Полная перезагрузка, а не navigate: смена студии меняет ВСЕ данные, а
      // queryClient.clear() внутри setActiveToken при живых подписчиках (тема,
      // язык, шапка) оставляет их с пустыми данными и БЕЗ повторного запроса —
      // наблюдатель остаётся привязан к удалённому query. Именно из-за этого
      // кабинет после переключения белел (тема читалась как «данных нет» →
      // light) и висел так до F5. См. тот же приём в SelectCrm.
      window.location.href = '/dashboard';
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
