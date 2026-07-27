import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { notificationsApi } from "../../../../api/notifications";
import { queryKeys } from "../../../../api/queryKeys";
import { errorMessage } from "../../../../api/errorMessage";
import { useToast } from "../../../../components/ui/index";
import type { UserPrefRead, UserPrefRow, UserPrefUpdate } from "../../../../api/notifications/notifications.types";

function patchRow(data: UserPrefRead, v: UserPrefUpdate): UserPrefRead {
  return {
    events: data.events.map(row =>
      row.event_id === v.event_id ? { ...row, channels: { ...row.channels, [v.channel_key]: v.is_enabled } } : row,
    ),
  };
}

function mergeRow(data: UserPrefRead, row: UserPrefRow): UserPrefRead {
  return { events: data.events.map(r => (r.event_id === row.event_id ? row : r)) };
}

// «Мои уведомления» (EPIC 3, Задача 6) — видно всем ролям, только optional-события
// своей роли; бэк сам определяет роль из JWT, фронту её знать не нужно.
export function useMyNotifications() {
  const qc = useQueryClient();
  const { t } = useTranslation("settings");
  const toast = useToast();

  const query = useQuery({
    queryKey: queryKeys.notificationMyPrefs,
    queryFn: () => notificationsApi.getMyPrefs(),
  });

  const toggle = useMutation({
    mutationFn: (v: UserPrefUpdate) => notificationsApi.updateMyPref(v),
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: queryKeys.notificationMyPrefs });
      const prev = qc.getQueryData<UserPrefRead>(queryKeys.notificationMyPrefs);
      if (prev) qc.setQueryData<UserPrefRead>(queryKeys.notificationMyPrefs, patchRow(prev, v));
      return { prev };
    },
    onError: (err, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(queryKeys.notificationMyPrefs, ctx.prev);
      toast.error(errorMessage(err, t));
    },
    onSuccess: (row) => {
      qc.setQueryData<UserPrefRead>(queryKeys.notificationMyPrefs, (old) => (old ? mergeRow(old, row) : old));
    },
  });

  return { ...query, toggle };
}
