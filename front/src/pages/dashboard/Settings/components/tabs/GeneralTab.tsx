import { useState } from "react";
import { DEFAULT_GENERAL } from "../../constants";
import type { GeneralState } from "../../types";
import { icons } from "../ui/SettingsIcons";
import SectionHeader from "../ui/SectionHeader";
import PremiumButton from "../ui/PremiumButton";
import InputRow from "../ui/form/InputRow";
import DarkSelectRow from "../ui/form/DarkSelectRow";

interface GeneralTabProps {
  savedStates: Record<string, boolean>;
  triggerSave: (key: string, msg: string) => void;
  triggerToast: (msg: string) => void;
}

export default function GeneralTab({ savedStates, triggerSave, triggerToast }: GeneralTabProps) {
  const [general, setGeneral] = useState<GeneralState>(DEFAULT_GENERAL);
  const [timezone, setTimezone] = useState("Europe/Moscow (UTC+3)");
  const [currency, setCurrency] = useState("RUB — Российский рубль (₽)");
  const [lang, setLang] = useState("Русский");
  const [dateFormat, setDateFormat] = useState("ДД.ММ.ГГГГ");
  const [firstDay, setFirstDay] = useState("Понедельник");

  const handleReset = () => {
    setGeneral(DEFAULT_GENERAL);
    triggerToast("Настройки сброшены");
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
        <SectionHeader icon={icons.building} title="Данные компании" subtitle="Публичная информация вашего бизнеса" />
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
                <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--muted)" }}>Загрузить</span>
              </>
            )}
          </label>

          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "12px" }}>
            <InputRow label="Название компании" value={general.name} onChange={v => setGeneral({ ...general, name: v })} placeholder="Например: My Studio" />
            <InputRow label="Описание" value={general.desc} onChange={v => setGeneral({ ...general, desc: v })} placeholder="Чем занимается ваша студия…" />
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "20px" }}>
          <InputRow label="Телефон" value={general.phone} onChange={v => setGeneral({ ...general, phone: v })} type="tel" />
          <InputRow label="Email" value={general.email} onChange={v => setGeneral({ ...general, email: v })} type="email" />
          <InputRow label="Сайт" value={general.site} onChange={v => setGeneral({ ...general, site: v })} placeholder="https://studio.ru" />
          <InputRow label="Адрес" value={general.address} onChange={v => setGeneral({ ...general, address: v })} placeholder="Москва, ул. Примерная, 1" />
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
          <button onClick={handleReset} className="topbar-ghost" style={{ padding: "9px 18px", fontSize: "12px" }}>Сбросить</button>
          <PremiumButton
            isSaved={savedStates['general']}
            onClick={() => triggerSave('general', 'Сохранено')}
            text="Сохранить"
          />
        </div>
      </div>

      <div className="card" style={{ padding: "28px" }}>
        <SectionHeader icon={icons.globe} title="Язык и регион" subtitle="Настройки локализации интерфейса" />
        <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
          <DarkSelectRow label="Часовой пояс" value={timezone} onChange={setTimezone} options={["Europe/Moscow (UTC+3)", "Europe/London (UTC+0)", "Asia/Dubai (UTC+4)", "Asia/Almaty (UTC+5)"]} />
          <DarkSelectRow label="Валюта" value={currency} onChange={setCurrency} options={["RUB — Российский рубль (₽)", "USD — Доллар США ($)", "EUR — Евро (€)", "KZT — Тенге (₸)"]} />
          <DarkSelectRow label="Язык интерфейса" value={lang} onChange={setLang} options={["Русский", "English", "Deutsch", "Español"]} />
          <DarkSelectRow label="Формат даты" value={dateFormat} onChange={setDateFormat} options={["ДД.ММ.ГГГГ", "ММ.ДД.ГГГГ", "ГГГГ-ММ-ДД"]} />
          <DarkSelectRow label="Первый день недели" value={firstDay} onChange={setFirstDay} options={["Понедельник", "Воскресенье"]} />
        </div>
      </div>
    </div>
  );
}
