import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { PremiumSelect, TIMEZONES, WEEK_START_OPTIONS } from "../../UI";
import { currencyOptionsFor } from "../../../utils/currencyOptions";
import type { OnboardingData } from "./types";

interface Props {
  data: OnboardingData;
  onChange: (patch: Partial<OnboardingData>) => void;
}

const labelStyle: React.CSSProperties = {
  display: "block", fontSize: "12px", fontWeight: 700,
  color: "var(--muted)", letterSpacing: "0.5px", textTransform: "uppercase", marginBottom: "8px",
};

const WEEK_START_DAY_KEY: Record<string, string> = { monday: "mon", sunday: "sun" };

export default function StepSettings({ data, onChange }: Props) {
  const { t, i18n } = useTranslation(["onboarding", "common"]);

  // У пояса подпись уже готова (города — имена собственные, их не переводят),
  // у валюты переводится название — и сортируется по нему же (currencyOptions.ts).
  const currencyOptions = useMemo(() => currencyOptionsFor(t, i18n.language), [t, i18n.language]);
  const weekStartOptions = WEEK_START_OPTIONS.map(o => ({ ...o, label: t(`common:days.${WEEK_START_DAY_KEY[o.value]}`) }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      <div>
        <h3 style={{ fontSize: "22px", fontWeight: 900, color: "var(--onyx)", letterSpacing: "-0.8px", margin: "0 0 6px" }}>
          {t("onboarding:settings.title")}
        </h3>
        <p style={{ fontSize: "13px", color: "var(--text3)", margin: 0 }}>
          {t("onboarding:settings.subtitle")}
        </p>
      </div>

      {/* minmax(0, …), а не 1fr: у 1fr минимум = min-content, и длинная подпись
          пояса («Берлин, Париж, Мадрид (UTC+1)») раздувала свою колонку и
          сдвигала валюту влево. С нулевым минимумом колонки равны всегда, а
          текст обрезается многоточием (ellipsis уже в PremiumSelect). */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: "14px" }}>
        <div>
          <label style={labelStyle}>{t("onboarding:settings.timezoneLabel")}</label>
          <PremiumSelect
            value={data.timezone}
            onChange={v => onChange({ timezone: v })}
            options={TIMEZONES}
            placeholder={t("onboarding:settings.timezonePlaceholder")}
          />
        </div>
        <div>
          <label style={labelStyle}>{t("onboarding:settings.currencyLabel")}</label>
          <PremiumSelect
            value={data.currency}
            onChange={v => onChange({ currency: v })}
            options={currencyOptions}
            placeholder={t("onboarding:settings.currencyPlaceholder")}
            searchable
            searchPlaceholder={t("onboarding:settings.currencySearch")}
            emptyText={t("onboarding:settings.currencyNotFound")}
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
                background: data.firstDayOfWeek === opt.value ? "rgba(252,174,145,0.1)" : "var(--bg-card)",
                fontSize: "13px", fontWeight: data.firstDayOfWeek === opt.value ? 700 : 500,
                color: data.firstDayOfWeek === opt.value ? "var(--onyx)" : "var(--text3)",
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
