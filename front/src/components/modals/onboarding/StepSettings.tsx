import { useTranslation } from "react-i18next";
import { PremiumSelect, TIMEZONES, LANGUAGES, CURRENCIES, DATE_FORMATS, WEEK_START_OPTIONS } from "../../UI";
import type { OnboardingData } from "./types";

interface Props {
  data: OnboardingData;
  onChange: (patch: Partial<OnboardingData>) => void;
}

const labelStyle: React.CSSProperties = {
  display: "block", fontSize: "12px", fontWeight: 700,
  color: "#666", letterSpacing: "0.5px", textTransform: "uppercase", marginBottom: "8px",
};

const WEEK_START_DAY_KEY: Record<string, string> = { monday: "mon", sunday: "sun" };

export default function StepSettings({ data, onChange }: Props) {
  const { t } = useTranslation(["onboarding", "common"]);

  const timezoneOptions = TIMEZONES.map(o => ({ ...o, label: t(`onboarding:settings.timezones.${o.value}`) }));
  const currencyOptions = CURRENCIES.map(o => ({ ...o, label: t(`onboarding:settings.currencies.${o.value}`) }));
  const weekStartOptions = WEEK_START_OPTIONS.map(o => ({ ...o, label: t(`common:days.${WEEK_START_DAY_KEY[o.value]}`) }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      <div>
        <h3 style={{ fontSize: "22px", fontWeight: 900, color: "#1A1A1A", letterSpacing: "-0.8px", margin: "0 0 6px" }}>
          {t("onboarding:settings.title")}
        </h3>
        <p style={{ fontSize: "13px", color: "#888", margin: 0 }}>
          {t("onboarding:settings.subtitle")}
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
        <div>
          <label style={labelStyle}>{t("onboarding:settings.timezoneLabel")}</label>
          <PremiumSelect
            value={data.timezone}
            onChange={v => onChange({ timezone: v })}
            options={timezoneOptions}
            placeholder={t("onboarding:settings.timezonePlaceholder")}
          />
        </div>
        <div>
          <label style={labelStyle}>{t("onboarding:settings.languageLabel")}</label>
          <PremiumSelect
            value={data.language}
            onChange={v => onChange({ language: v })}
            options={LANGUAGES}
            placeholder={t("onboarding:settings.languagePlaceholder")}
          />
        </div>
        <div>
          <label style={labelStyle}>{t("onboarding:settings.currencyLabel")}</label>
          <PremiumSelect
            value={data.currency}
            onChange={v => onChange({ currency: v })}
            options={currencyOptions}
            placeholder={t("onboarding:settings.currencyPlaceholder")}
          />
        </div>
        <div>
          <label style={labelStyle}>{t("onboarding:settings.dateFormatLabel")}</label>
          <PremiumSelect
            value={data.dateFormat}
            onChange={v => onChange({ dateFormat: v })}
            options={DATE_FORMATS}
            placeholder={t("onboarding:settings.dateFormatPlaceholder")}
          />
        </div>
      </div>

      <div>
        <label style={labelStyle}>{t("onboarding:settings.firstDayLabel")}</label>
        <div style={{ display: "flex", gap: "8px" }}>
          {weekStartOptions.map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange({ firstDayOfWeek: opt.value })}
              style={{
                flex: 1, padding: "10px 14px", borderRadius: "10px",
                border: data.firstDayOfWeek === opt.value ? "1.5px solid #FCAE91" : "1.5px solid #EEEBE6",
                background: data.firstDayOfWeek === opt.value ? "rgba(252,174,145,0.1)" : "white",
                fontSize: "13px", fontWeight: data.firstDayOfWeek === opt.value ? 700 : 500,
                color: data.firstDayOfWeek === opt.value ? "#1A1A1A" : "#888",
                cursor: "pointer", fontFamily: "inherit",
                transition: "all 0.2s ease",
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
