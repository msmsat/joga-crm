import { useState } from "react";
import { useTranslation } from "react-i18next";
import { icons } from "../ui/SettingsIcons";
import SectionHeader from "../ui/SectionHeader";
import { Button, Select, Switch } from "../../../../../components/ui/index";
import { useBusinessTerms } from "../../../../../hooks/useBusinessTerms";
import type { GeneralSettings, GeneralUpdate } from "../../../../../api/settings/settings.types";
import type { StudioBookingMode, TerminologyProfile } from "../../../../../api/booking/hybrid.types";

/**
 * HB-17: модель записи и отраслевой пресет студии.
 *
 * Формат услуги (групповая/индивидуальная) и МЕХАНИКА записи — разные вещи, и
 * карточка обязана объяснить это словами, а не оставить владельца гадать:
 * группа с одним местом остаётся событием, на которое записываются, а
 * resource — это выбор мастера и времени.
 *
 * Строгое расписание — предусловие resource: сервер откажет без него
 * (STRICT_SCHEDULE_REQUIRED), и включить его можно только когда аудит наследия
 * не нашёл пересечений и неизвестных зон. Блокеры сервер называет сам —
 * здесь они показываются как есть, без собственной копии правил.
 */
type Blocker = { kind: string; lesson_id: number | null; user_id: number | null };

function blockersOf(error: unknown): { code: string; findings: Blocker[] } | null {
  const detail = (error as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
  if (!detail || typeof detail !== "object") return null;
  const shaped = detail as { code?: string; params?: { findings?: Blocker[] } };
  if (!shaped.code) return null;
  return { code: shaped.code, findings: shaped.params?.findings ?? [] };
}

export default function BookingModelCard({ data, save }: {
  data: GeneralSettings;
  save: { mutate: (patch: GeneralUpdate) => void; isPending: boolean; error: unknown };
}) {
  const { t } = useTranslation(["settings"]);
  const [preview, setPreview] = useState<"event" | "resource">("resource");
  const capabilities = data.booking_capabilities;
  const terms = useBusinessTerms(preview, data.terminology?.profile ?? null);
  const failure = blockersOf(save.error);

  const modeOptions: { value: StudioBookingMode; label: string }[] =
    (["event", "resource", "hybrid"] as const).map(value => ({
      value, label: t(`general.booking.modes.${value}`),
    }));
  const profileOptions: { value: TerminologyProfile; label: string }[] =
    (["generic", "fitness", "beauty"] as const).map(value => ({
      value, label: t(`general.booking.profiles.${value}`),
    }));

  const row = (label: string, hint: string, control: React.ReactNode) => (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px" }}>
      <div>
        <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--onyx)" }}>{label}</div>
        <div style={{ fontSize: "12px", color: "var(--muted)", marginTop: "2px", maxWidth: "420px" }}>{hint}</div>
      </div>
      <div style={{ width: "min(260px, 46%)", minWidth: "150px", display: "flex", justifyContent: "flex-end" }}>
        {control}
      </div>
    </div>
  );

  return (
    <div className="card" style={{ padding: "28px" }}>
      <SectionHeader
        icon={icons.calendar ?? icons.globe}
        title={t("general.booking.title")}
        subtitle={t("general.booking.subtitle")}
      />
      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        {row(
          t("general.booking.strict"),
          t("general.booking.strictHint"),
          <Switch
            checked={capabilities.strict_schedule_enabled}
            disabled={save.isPending}
            onChange={value => save.mutate({ strict_schedule_enabled: value })}
          />,
        )}
        {row(
          t("general.booking.mode"),
          t("general.booking.modeHint"),
          <Select
            value={capabilities.booking_mode}
            options={modeOptions}
            onChange={value => save.mutate({ booking_mode: value as StudioBookingMode })}
          />,
        )}
        {row(
          t("general.booking.profile"),
          t("general.booking.profileHint"),
          <Select
            value={capabilities.terminology_profile}
            options={profileOptions}
            onChange={value => save.mutate({ terminology_profile: value as TerminologyProfile })}
          />,
        )}

        {failure && (
          <div style={{
            border: "1px solid rgba(216,140,154,0.4)", borderRadius: "12px",
            padding: "14px 16px", background: "rgba(216,140,154,0.08)",
          }}>
            <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--onyx)" }}>
              {t([`general.booking.errors.${failure.code}`, "general.booking.errors.AUDIT_BLOCKED"])}
            </div>
            {failure.findings.length > 0 && (
              <ul style={{ margin: "8px 0 0", paddingLeft: "18px", fontSize: "12px", color: "var(--muted)" }}>
                {failure.findings.slice(0, 8).map((item, index) => (
                  <li key={`${item.kind}-${item.lesson_id}-${index}`}>
                    {t([`general.booking.findings.${item.kind}`, "general.booking.findings.other"])}
                    {item.lesson_id ? ` — #${item.lesson_id}` : ""}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Предпросмотр — только слова. Никаких обращений к production-командам
            подтверждения: декоративная карточка не должна уметь создать бронь. */}
        <div style={{
          border: "1px solid rgba(var(--ink),0.08)", borderRadius: "12px", padding: "16px",
        }}>
          <div style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
            {(["event", "resource"] as const).map(mode => (
              <Button
                key={mode}
                variant={preview === mode ? "primary" : "ghost"}
                onClick={() => setPreview(mode)}
              >
                {t(`general.booking.preview.${mode}`)}
              </Button>
            ))}
          </div>
          <div style={{ fontSize: "13px", color: "var(--muted)", display: "grid", gap: "6px" }}>
            <div>{terms.ready ? terms.message("choose_staff") : "…"}</div>
            <div>{terms.ready ? terms.message("choose_offering") : "…"}</div>
            <div>{terms.ready ? terms.message("confirm_booking") : "…"}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
