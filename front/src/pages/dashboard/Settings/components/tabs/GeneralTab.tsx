import { useState } from "react";
import { useTranslation } from "react-i18next";
import { DEFAULT_GENERAL } from "../../constants";
import type { GeneralState } from "../../types";
import { icons } from "../ui/SettingsIcons";
import SectionHeader from "../ui/SectionHeader";
import { Button, Input, Select, useToast } from "../../../../../components/ui/index";

export default function GeneralTab() {
  const { t } = useTranslation('settings');
  const toast = useToast();
  const [general, setGeneral] = useState<GeneralState>(DEFAULT_GENERAL);
  const [timezone, setTimezone] = useState("Europe/Moscow (UTC+3)");
  const [currency, setCurrency] = useState("RUB — Российский рубль (₽)");
  const [lang, setLang] = useState("Русский");
  const [dateFormat, setDateFormat] = useState("ДД.ММ.ГГГГ");
  const [firstDay, setFirstDay] = useState("Понедельник");

  const asOptions = (values: string[]) => values.map(v => ({ value: v, label: v }));

  const handleReset = () => {
    setGeneral(DEFAULT_GENERAL);
    toast.success(t('general.resetToast'));
  };

  const handleSave = () => {
    toast.success(t('toast.saved'));
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setGeneral(prev => ({ ...prev, logo: reader.result as string }));
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      <div className="card" style={{ padding: "28px 28px 24px" }}>
        <SectionHeader icon={icons.building} title={t('general.company.title')} subtitle={t('general.company.subtitle')} />
        <div style={{ display: "flex", gap: "24px", marginBottom: "20px" }}>
          <label style={{
            width: "90px", height: "90px", borderRadius: "16px", flexShrink: 0,
            background: general.logo ? "transparent" : "#FDFCFB",
            border: general.logo ? "none" : "1.5px dashed rgba(26,26,26,0.15)",
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            gap: "6px", cursor: "pointer", transition: "all 0.25s ease",
            overflow: "hidden", position: "relative"
          }}
            onMouseOver={(e) => { if (!general.logo) e.currentTarget.style.borderColor = "var(--peach)"; }}
            onMouseOut={(e) => { if (!general.logo) e.currentTarget.style.borderColor = "rgba(26,26,26,0.15)"; }}
          >
            <input type="file" hidden onChange={handleLogoUpload} accept="image/*" />
            {general.logo ? (
              <>
                <img src={general.logo} alt="Logo" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                <div style={{
                  position: "absolute", inset: 0, background: "rgba(0,0,0,0.4)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  opacity: 0, transition: "opacity 0.2s", color: "white"
                }} onMouseOver={e => e.currentTarget.style.opacity = "1"} onMouseOut={e => e.currentTarget.style.opacity = "0"}>
                  {icons.edit}
                </div>
              </>
            ) : (
              <>
                <div style={{ color: "var(--peach)" }}>{icons.plus}</div>
                <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--muted)" }}>{t('common:buttons.upload')}</span>
              </>
            )}
          </label>

          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "12px" }}>
            <Input label={t('general.company.name')} value={general.name} onChange={v => setGeneral({ ...general, name: v })} placeholder={t('general.company.namePh')} />
            <Input label={t('general.company.desc')} value={general.desc} onChange={v => setGeneral({ ...general, desc: v })} placeholder={t('general.company.descPh')} />
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "20px" }}>
          <Input label={t('general.company.phone')} value={general.phone} onChange={v => setGeneral({ ...general, phone: v })} type="tel" />
          <Input label={t('general.company.email')} value={general.email} onChange={v => setGeneral({ ...general, email: v })} type="email" />
          <Input label={t('general.company.site')} value={general.site} onChange={v => setGeneral({ ...general, site: v })} placeholder={t('general.company.sitePh')} />
          <Input label={t('general.company.address')} value={general.address} onChange={v => setGeneral({ ...general, address: v })} placeholder={t('general.company.addressPh')} />
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
          <Button variant="ghost" onClick={handleReset}>{t('general.reset')}</Button>
          <Button variant="primary" onClick={handleSave}>{t('common:buttons.save')}</Button>
        </div>
      </div>

      <div className="card" style={{ padding: "28px" }}>
        <SectionHeader icon={icons.globe} title={t('general.locale.title')} subtitle={t('general.locale.subtitle')} />
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px" }}>
            <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--onyx)" }}>{t('general.locale.timezone')}</div>
            <div style={{ width: "260px" }}><Select value={timezone} onChange={setTimezone} options={asOptions(["Europe/Moscow (UTC+3)", "Europe/London (UTC+0)", "Asia/Dubai (UTC+4)", "Asia/Almaty (UTC+5)"])} /></div>
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px" }}>
            <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--onyx)" }}>{t('general.locale.currency')}</div>
            <div style={{ width: "260px" }}><Select value={currency} onChange={setCurrency} options={asOptions(["RUB — Российский рубль (₽)", "USD — Доллар США ($)", "EUR — Евро (€)", "KZT — Тенге (₸)"])} /></div>
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px" }}>
            <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--onyx)" }}>{t('general.locale.language')}</div>
            <div style={{ width: "260px" }}><Select value={lang} onChange={setLang} options={asOptions(["Русский", "English", "Deutsch", "Español"])} /></div>
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px" }}>
            <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--onyx)" }}>{t('general.locale.dateFormat')}</div>
            <div style={{ width: "260px" }}><Select value={dateFormat} onChange={setDateFormat} options={asOptions(["ДД.ММ.ГГГГ", "ММ.ДД.ГГГГ", "ГГГГ-ММ-ДД"])} /></div>
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px" }}>
            <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--onyx)" }}>{t('general.locale.firstDay')}</div>
            <div style={{ width: "260px" }}><Select value={firstDay} onChange={setFirstDay} options={asOptions(["Понедельник", "Воскресенье"])} /></div>
          </div>
        </div>
      </div>
    </div>
  );
}
