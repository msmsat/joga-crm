import { useTranslation } from "react-i18next";
import type { UseMutationResult } from "@tanstack/react-query";
import { Button, Select } from "../../../../../components/ui/index";
import StatusBadge from "../ui/StatusBadge";
import ConnectGuide from "./ConnectGuide";
import type {
  GoogleCalendarInfo, GoogleCalendarUpdatePayload, GoogleSyncResult, IgConnectPayload,
  Integration, IntegrationType, WaConnectIntegrationPayload,
} from "../../../../../api/settings/settings.types";

interface IntegrationCardProps {
  type: IntegrationType;
  name: string;
  sub: string;
  color: string;
  data: Integration;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onRequestDisconnect: () => void;
  connectTelegram: UseMutationResult<Integration, unknown, string>;
  connectWhatsApp: UseMutationResult<Integration, unknown, WaConnectIntegrationPayload>;
  connectInstagram: UseMutationResult<Integration, unknown, IgConnectPayload>;
  startGoogleAuth: UseMutationResult<{ url: string }, unknown, void>;
  calendars: GoogleCalendarInfo[];
  calendarsLoading: boolean;
  updateGoogleCalendar: UseMutationResult<Integration, unknown, GoogleCalendarUpdatePayload>;
  syncGoogleCalendar: UseMutationResult<GoogleSyncResult, unknown, void>;
}

function formatDate(iso: string | null, lang: string, withTime = false): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString(lang === "ru" ? "ru-RU" : "en-US", {
    day: "numeric", month: "long", ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  });
}

export default function IntegrationCard({
  type, name, sub, color, data, isExpanded, onToggleExpand, onRequestDisconnect,
  connectTelegram, connectWhatsApp, connectInstagram, startGoogleAuth,
  calendars, calendarsLoading, updateGoogleCalendar, syncGoogleCalendar,
}: IntegrationCardProps) {
  const { t, i18n } = useTranslation("settings");
  const { connected, connected_at, details } = data;

  const connectLoading =
    connectTelegram.isPending || connectWhatsApp.isPending || connectInstagram.isPending || startGoogleAuth.isPending;

  const handleSubmit = (fields: Record<string, string>) => {
    if (type === "telegram") connectTelegram.mutate(fields.token);
    else if (type === "whatsapp") connectWhatsApp.mutate({ token: fields.token, phone_number_id: fields.phone_number_id, waba_id: fields.waba_id || undefined });
    else if (type === "instagram") connectInstagram.mutate({ token: fields.token, ig_user_id: fields.ig_user_id });
  };

  const maskedKey =
    (details?.token_masked as string | undefined) ??
    (details?.calendar_id as string | undefined) ??
    null;
  const identity =
    (details?.bot_username as string | undefined) ??
    (details?.username as string | undefined) ??
    (details?.display_phone_number as string | undefined) ??
    (details?.connected_email as string | undefined) ??
    null;

  const calendarOptions = calendars.map(c => ({ value: c.id, label: c.primary ? `${c.name} (${t("integrations.google.primary")})` : c.name }));
  const syncModeOptions = [
    { value: "push", label: t("integrations.google.syncModeOptions.push") },
    { value: "two_way", label: t("integrations.google.syncModeOptions.two_way") },
  ];

  return (
    <div
      style={{
        borderRadius: "14px",
        background: isExpanded ? "#FFFFFF" : "rgba(0,0,0,0.015)",
        border: `1px solid ${isExpanded ? "var(--peach)" : "rgba(0,0,0,0.04)"}`,
        boxShadow: isExpanded ? "0 12px 32px rgba(252,174,145,0.1), 0 2px 6px rgba(252,174,145,0.05)" : "none",
        transition: "all 0.3s cubic-bezier(0.34, 1.5, 0.64, 1)",
      }}
    >
      <div
        onClick={onToggleExpand}
        style={{ display: "flex", alignItems: "center", gap: "14px", padding: "16px 20px", cursor: "pointer", background: isExpanded ? "rgba(252,174,145,0.02)" : "transparent" }}
      >
        <div style={{ width: "38px", height: "38px", borderRadius: "10px", background: `${color}14`, border: `1.5px solid ${color}25`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "11px", fontWeight: 900, color, flexShrink: 0 }}>
          {name.slice(0, 2).toUpperCase()}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: "13.5px", fontWeight: 700, color: "var(--onyx)" }}>{name}</div>
          <div style={{ fontSize: "11.5px", color: "var(--muted)", marginTop: "2px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {connected && identity ? identity : sub}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "12px", pointerEvents: "none" }}>
          <StatusBadge type={connected ? "active" : "warning"}>
            {connected ? t("integrations.status.connected") : t("integrations.status.notActive")}
          </StatusBadge>
          <button style={{ display: "flex", alignItems: "center", gap: "5px", padding: "6px 14px", borderRadius: "8px", background: isExpanded ? "var(--peach)" : "#FFFFFF", color: isExpanded ? "#FFFFFF" : "var(--onyx)", border: isExpanded ? "1px solid var(--peach)" : "1px solid rgba(26,26,26,0.1)", fontSize: "11.5px", fontWeight: 700, cursor: "pointer", transition: "all 0.3s cubic-bezier(0.34, 1.5, 0.64, 1)", boxShadow: isExpanded ? "0 4px 12px rgba(252,174,145,0.35)" : "0 2px 6px rgba(0,0,0,0.02)" }}>
            {connected ? t("integrations.actions.configure") : t("integrations.actions.connect")}
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.3s ease" }}>
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
          </button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateRows: isExpanded ? "1fr" : "0fr", transition: "grid-template-rows 0.3s cubic-bezier(0.34, 1.5, 0.64, 1)" }}>
        <div style={{ minHeight: 0, overflow: "hidden" }}>
          <div style={{ padding: "0 20px 20px 20px" }}>
            <div style={{ width: "100%", height: "1px", background: "rgba(0,0,0,0.06)", marginBottom: "20px" }} />

            {!connected && (
              <ConnectGuide type={type} loading={connectLoading} onSubmit={handleSubmit} onGoogleConnect={() => startGoogleAuth.mutate()} />
            )}

            {connected && (
              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "10px 24px" }}>
                  {maskedKey && (
                    <div>
                      <div style={{ fontSize: "11px", color: "var(--muted)", marginBottom: "2px" }}>{t("integrations.fields.keyLabel")}</div>
                      <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--onyx)", fontFamily: "monospace" }}>{maskedKey}</div>
                    </div>
                  )}
                  {connected_at && (
                    <div>
                      <div style={{ fontSize: "11px", color: "var(--muted)", marginBottom: "2px" }}>{t("integrations.fields.connectedAtLabel")}</div>
                      <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--onyx)" }}>{formatDate(connected_at, i18n.language)}</div>
                    </div>
                  )}
                </div>

                {type === "google_calendar" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "14px", padding: "16px", background: "rgba(0,0,0,0.015)", borderRadius: "12px", border: "1px solid var(--border)" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                      <div>
                        <div style={{ fontSize: "11.5px", fontWeight: 700, color: "var(--onyx)", marginBottom: "6px" }}>{t("integrations.google.calendar")}</div>
                        <Select
                          value={(details?.calendar_id as string) ?? ""}
                          options={calendarOptions}
                          placeholder={calendarsLoading ? t("integrations.google.loadingCalendars") : t("integrations.google.selectCalendar")}
                          onChange={(v) => updateGoogleCalendar.mutate({ calendar_id: v })}
                          disabled={calendarsLoading || updateGoogleCalendar.isPending}
                        />
                      </div>
                      <div>
                        <div style={{ fontSize: "11.5px", fontWeight: 700, color: "var(--onyx)", marginBottom: "6px" }}>{t("integrations.google.syncMode")}</div>
                        <Select
                          value={(details?.sync_mode as string) ?? "push"}
                          options={syncModeOptions}
                          onChange={(v) => updateGoogleCalendar.mutate({ sync_mode: v as "push" | "two_way" })}
                          disabled={updateGoogleCalendar.isPending}
                        />
                      </div>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
                      <div style={{ fontSize: "11.5px", color: "var(--muted)" }}>
                        {details?.last_sync_at
                          ? t("integrations.google.lastSync", { date: formatDate(details.last_sync_at as string, i18n.language, true) })
                          : t("integrations.google.neverSynced")}
                      </div>
                      <Button variant="ghost" size="sm" loading={syncGoogleCalendar.isPending} onClick={() => syncGoogleCalendar.mutate()}>
                        {t("integrations.google.syncNow")}
                      </Button>
                    </div>
                  </div>
                )}

                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <button
                    onClick={onRequestDisconnect}
                    style={{ display: "flex", alignItems: "center", gap: "5px", padding: "9px 18px", borderRadius: "10px", background: "rgba(216,140,154,0.08)", border: "1px solid rgba(216,140,154,0.2)", color: "#C0607A", fontSize: "12px", fontWeight: 700, cursor: "pointer", transition: "all 0.2s" }}
                    onMouseEnter={e => e.currentTarget.style.background = "rgba(216,140,154,0.15)"}
                    onMouseLeave={e => e.currentTarget.style.background = "rgba(216,140,154,0.08)"}
                  >
                    {t("integrations.actions.disconnect")}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
