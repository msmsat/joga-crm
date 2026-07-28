import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { settingsApi } from "../../../../api/settings/settings.api";
import { authApi } from "../../../../api/auth/auth.api";
import { queryKeys } from "../../../../api/queryKeys";
import { errorMessage } from "../../../../api/errorMessage";
import { useToast } from "../../../../components/ui/index";
import type { ExportArchivePayload } from "../../../../api/settings/settings.types";

export function useSecurity() {
  const qc = useQueryClient();
  const { t } = useTranslation("settings");
  const toast = useToast();
  const [secExpanded, setSecExpanded] = useState<"sessions" | "export" | null>(null);

  const sessionsQuery = useQuery({
    queryKey: queryKeys.sessions,
    queryFn: () => settingsApi.getSessions(),
  });

  const meQuery = useQuery({
    queryKey: queryKeys.me,
    queryFn: () => authApi.getMe(),
    staleTime: 60_000,
  });

  const terminateSession = useMutation({
    mutationFn: (id: number) => settingsApi.terminateSession(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.sessions });
      toast.success(t("security.sessions.terminatedToast"));
    },
    onError: (err) => toast.error(errorMessage(err, t)),
  });

  const terminateOtherSessions = useMutation({
    mutationFn: () => settingsApi.terminateOtherSessions(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.sessions });
      toast.success(t("security.sessions.terminatedAllToast"));
    },
    onError: (err) => toast.error(errorMessage(err, t)),
  });

  const setTwoFa = useMutation({
    mutationFn: ({ enabled, otpToken }: { enabled: boolean; otpToken: string }) =>
      settingsApi.setTwoFa(enabled, otpToken),
    onSuccess: (data) => {
      qc.setQueryData(queryKeys.me, (prev) => (prev ? { ...prev, two_fa_enabled: data.enabled } : prev));
      toast.success(data.enabled ? t("security.twoFa.enabledToast") : t("security.twoFa.disabledToast"));
    },
    onError: (err) => toast.error(errorMessage(err, t)),
  });

  const requestExportArchive = useMutation({
    mutationFn: (include: ExportArchivePayload["include"]) => settingsApi.requestExportArchive({ include }),
    onSuccess: () => {
      toast.success(t("security.danger.export.started"));
      setSecExpanded(null);
    },
    onError: (err) => toast.error(errorMessage(err, t)),
  });

  // wipe-data/delete-account намеренно без onError-тоста здесь: ошибку
  // показывает OtpConfirmModal под полем кода (см. DangerZoneModal) —
  // дублировать тем же текстом в тосте незачем.
  const wipeData = useMutation({
    mutationFn: ({ confirmName, otpToken }: { confirmName: string; otpToken: string }) =>
      settingsApi.wipeData(confirmName, otpToken),
  });

  const deleteAccount = useMutation({
    mutationFn: ({ confirmName, otpToken }: { confirmName: string; otpToken: string }) =>
      settingsApi.deleteAccount(confirmName, otpToken),
  });

  return {
    secExpanded, setSecExpanded,
    sessions: sessionsQuery.data ?? [],
    sessionsLoading: sessionsQuery.isLoading,
    twoFaEnabled: meQuery.data?.two_fa_enabled ?? false,
    email: meQuery.data?.email ?? null,
    terminateSession,
    terminateOtherSessions,
    setTwoFa,
    requestExportArchive,
    wipeData,
    deleteAccount,
  };
}
