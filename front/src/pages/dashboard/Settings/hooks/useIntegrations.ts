import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { settingsApi } from "../../../../api/settings/settings.api";
import { queryKeys } from "../../../../api/queryKeys";
import { errorMessage } from "../../../../api/errorMessage";
import { useToast } from "../../../../components/ui/index";
import type {
  GoogleCalendarUpdatePayload, IgConnectPayload, IntegrationType, WaConnectIntegrationPayload,
} from "../../../../api/settings/settings.types";

export function useIntegrations() {
  const qc = useQueryClient();
  const { t } = useTranslation("settings");
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [expandedIntegration, setExpandedIntegration] = useState<IntegrationType | null>(null);

  const integrationsQuery = useQuery({
    queryKey: queryKeys.integrations,
    queryFn: () => settingsApi.getIntegrations(),
  });

  const google = integrationsQuery.data?.find(i => i.type === "google_calendar") ?? null;

  // Список календарей нужен только пока открыта карточка Google — не тянем его
  // ради всех остальных владельцев, которые Google вообще не подключали.
  const calendarsQuery = useQuery({
    queryKey: queryKeys.integration("google_calendars"),
    queryFn: () => settingsApi.getGoogleCalendars(),
    enabled: expandedIntegration === "google_calendar" && !!google?.connected,
  });

  // Инвалидируем и свою вкладку, и канал в Уведомлениях — то же самое
  // подключение видно в двух местах интерфейса (эпик 6, «точка отсчёта»:
  // вкладка «Интеграции» и раздел Уведомлений читают одни и те же
  // StudioIntegration-строки на бэке; без кросс-инвалидации один экран
  // отстаёт от другого до ручного F5).
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: queryKeys.integrations });
    qc.invalidateQueries({ queryKey: queryKeys.notifyIntegrations });
  };

  const onError = (err: unknown) => toast.error(errorMessage(err, t));
  const onConnected = () => {
    invalidate();
    toast.success(t("integrations.toast.connected"));
    setExpandedIntegration(null);
  };

  const connectTelegram = useMutation({
    mutationFn: (token: string) => settingsApi.connectTelegramIntegration(token),
    onSuccess: onConnected,
    onError,
  });

  const connectWhatsApp = useMutation({
    mutationFn: (payload: WaConnectIntegrationPayload) => settingsApi.connectWhatsAppIntegration(payload),
    onSuccess: onConnected,
    onError,
  });

  const connectInstagram = useMutation({
    mutationFn: (payload: IgConnectPayload) => settingsApi.connectInstagram(payload),
    onSuccess: onConnected,
    onError,
  });

  // Навигация на accounts.google.com — не fetch: редирект на чужой origin CORS
  // не пропустит. Ручка /google/start сама только отдаёт готовый URL (обычный
  // fetch с Authorization-заголовком), браузер уходит по нему уже сам.
  const startGoogleAuth = useMutation({
    mutationFn: () => settingsApi.getGoogleAuthUrl(),
    onSuccess: ({ url }) => { window.location.assign(url); },
    onError,
  });

  const disconnect = useMutation({
    mutationFn: (type: IntegrationType) =>
      type === "google_calendar"
        ? settingsApi.disconnectGoogleCalendar()
        : settingsApi.disconnectIntegration(type),
    onSuccess: () => {
      invalidate();
      toast.success(t("integrations.toast.disconnected"));
    },
    onError,
  });

  const updateGoogleCalendar = useMutation({
    mutationFn: (payload: GoogleCalendarUpdatePayload) => settingsApi.updateGoogleCalendar(payload),
    onSuccess: () => { invalidate(); toast.success(t("integrations.google.settingsSaved")); },
    onError,
  });

  const syncGoogleCalendar = useMutation({
    mutationFn: () => settingsApi.syncGoogleCalendar(),
    onSuccess: (result) => {
      invalidate();
      if (result.errors.length > 0) {
        toast.error(result.errors[0]);
      } else {
        toast.success(t("integrations.google.syncResult", { pushed: result.pushed, pulled: result.pulled }));
      }
    },
    onError,
  });

  // Возврат из consent-экрана Google: /dashboard/settings?tab=integrations&google=ok|denied|error.
  // Код обмена идёт на бэке (google_calendar_callback) — сюда долетает только статус.
  useEffect(() => {
    const status = params.get("google");
    if (!status) return;
    if (status === "ok") {
      qc.invalidateQueries({ queryKey: queryKeys.integrations });
      toast.success(t("integrations.google.connected"));
    } else if (status === "denied") {
      toast.error(t("integrations.google.denied"));
    } else {
      toast.error(t("integrations.google.error"));
    }
    const next = new URLSearchParams(params);
    next.delete("google");
    setParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  return {
    integrations: integrationsQuery.data ?? [],
    loading: integrationsQuery.isPending,
    loadError: integrationsQuery.isError,
    expandedIntegration, setExpandedIntegration,
    calendars: calendarsQuery.data ?? [],
    calendarsLoading: calendarsQuery.isFetching,
    connectTelegram,
    connectWhatsApp,
    connectInstagram,
    startGoogleAuth,
    disconnect,
    updateGoogleCalendar,
    syncGoogleCalendar,
  };
}
