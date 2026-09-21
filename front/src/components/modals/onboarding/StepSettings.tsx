import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { PremiumSelect, TIMEZONES } from "../../UI";
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

export default function StepSettings({ data, onChange }: Props) {
  const { t, i18n } = useTranslation("onboarding");

  // У пояса подпись уже готова (города — имена собственные, их не переводят),
  // у валюты переводится название — и сортируется по нему же (currencyOptions.ts).
  const currencyOptions = useMemo(() => currencyOptionsFor(t, i18n.language), [t, i18n.language]);

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

      {/* Пояс и валюта — каждый на своей строке, а не в две колонки: обе подписи
          длинные («UTC+1 · Prague, Berlin, Paris», «Чешская крона (CZK)»), и в
          половине ширины их резало многоточием ровно там, где начинается
          отличие одного варианта от другого. */}
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

      {/* «Первый день недели» отсюда убран: поле никто не читает — ни один
          календарь и ни один формат даты в продукте на него не смотрит (то же
          записано в GeneralTab, где его тоже нет). Спрашивать при первом входе
          то, что ни на что не влияет, — брать время за просто так; в студию
          по-прежнему уходит понедельник по умолчанию (Onboarding.tsx). */}
    </div>
  );
}
