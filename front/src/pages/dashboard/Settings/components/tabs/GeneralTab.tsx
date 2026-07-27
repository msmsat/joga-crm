import { useState } from "react";
import { useTranslation } from "react-i18next";
import { icons } from "../ui/SettingsIcons";
import SectionHeader from "../ui/SectionHeader";
import { Button, EmptyState, Input, Select, useToast } from "../../../../../components/ui/index";
import { resolveImageUrl } from "../../../../../api/client";
import {
  CURRENCIES, DATE_FORMATS, DATE_FORMAT_LABELS, FIRST_DAY_OPTIONS,
  LANGUAGES, LANGUAGE_LABELS, TIMEZONES,
} from "../../constants";
import { useGeneralSettings } from "../../hooks/useGeneralSettings";
import type { GeneralSettings, GeneralUpdate } from "../../../../../api/settings/settings.types";

// Коды (уходят на бэк) + подписи (i18n/эндонимы/примеры формата) в одном списке опций.
const zip = (values: readonly string[], labels: string[]) =>
  values.map((v, i) => ({ value: v, label: labels[i] ?? v }));

// logo_url — отдельный аплоад (uploadLogo), journal_time_step — без UI в этой задаче.
const EDITABLE_FIELDS = [
  "name", "description", "phone", "email", "website", "address",
  "timezone", "language", "currency", "date_format", "first_day_of_week",
] as const;

export default function GeneralTab() {
  const { t } = useTranslation('settings');
  const toast = useToast();
  const { data, isLoading, isError, refetch, save, uploadLogo } = useGeneralSettings();
  const [draft, setDraft] = useState<GeneralSettings | null>(null);
  // Черновик синхронизируется с ответом сервера при смене ссылки на data (первая
  // загрузка, ответ save/uploadLogo) — правка состояния во время рендера, не в
  // useEffect (react-hooks/set-state-in-effect): нет лишнего цикла рендера.
  const [synced, setSynced] = useState<GeneralSettings | null>(null);
  if (data && data !== synced) {
    setSynced(data);
    setDraft(data);
  }

  if (isError) {
    return (
      <EmptyState
        title={t('common:errors.loadFailed')}
        action={<Button variant="primary" onClick={() => refetch()}>{t('common:errors.retry')}</Button>}
      />
    );
  }

  if (isLoading || !draft || !data) {
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: "60px 0", color: "var(--muted)", fontSize: "13px" }}>
        {t('common:loading')}
      </div>
    );
  }

  const currencyOptions = zip(CURRENCIES, t('general.locale.currencyLabels', { returnObjects: true }) as string[]);
  const languageOptions = zip(LANGUAGES, LANGUAGE_LABELS);
  const dateFormatOptions = zip(DATE_FORMATS, DATE_FORMAT_LABELS);
  const firstDayOptions = zip(FIRST_DAY_OPTIONS, t('general.locale.firstDayLabels', { returnObjects: true }) as string[]);
  const timezoneOptions = zip(TIMEZONES, t('general.locale.timezoneLabels', { returnObjects: true }) as string[]);

  const dirty = EDITABLE_FIELDS.some(k => draft[k] !== data[k]);

  const set = <K extends keyof GeneralSettings>(key: K, value: GeneralSettings[K]) =>
    setDraft(prev => (prev ? { ...prev, [key]: value } : prev));

  const handleReset = () => {
    setDraft(data);
    toast.success(t('general.resetToast'));
  };

  const handleSave = () => {
    const patch: Record<string, unknown> = {};
    EDITABLE_FIELDS.forEach(key => {
      if (draft[key] !== data[key]) patch[key] = draft[key];
    });
    save.mutate(patch as GeneralUpdate);
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadLogo.mutate(file);
    e.target.value = ""; // повторный выбор того же файла должен снова сработать
  };

  const logoSrc = resolveImageUrl(draft.logo_url);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      <div className="card" style={{ padding: "28px 28px 24px" }}>
        <SectionHeader icon={icons.building} title={t('general.company.title')} subtitle={t('general.company.subtitle')} />
        <div style={{ display: "flex", gap: "24px", marginBottom: "20px" }}>
          <label style={{
            width: "90px", height: "90px", borderRadius: "16px", flexShrink: 0,
            background: logoSrc ? "transparent" : "#FDFCFB",
            border: logoSrc ? "none" : "1.5px dashed rgba(26,26,26,0.15)",
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            gap: "6px", cursor: uploadLogo.isPending ? "default" : "pointer", transition: "all 0.25s ease",
            overflow: "hidden", position: "relative"
          }}
            onMouseOver={(e) => { if (!logoSrc) e.currentTarget.style.borderColor = "var(--peach)"; }}
            onMouseOut={(e) => { if (!logoSrc) e.currentTarget.style.borderColor = "rgba(26,26,26,0.15)"; }}
          >
            <input type="file" hidden disabled={uploadLogo.isPending} onChange={handleLogoUpload} accept="image/png,image/jpeg,image/webp" />
            {uploadLogo.isPending ? (
              <svg className="spin-anim" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--peach)" strokeWidth="3" strokeLinecap="round">
                <circle cx="12" cy="12" r="10" strokeOpacity="0.2" /><path d="M4 12a8 8 0 0 1 8-8" />
              </svg>
            ) : logoSrc ? (
              <>
                <img src={logoSrc} alt="Logo" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
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
            <Input label={t('general.company.name')} value={draft.name} onChange={v => set('name', v)} placeholder={t('general.company.namePh')} />
            <Input label={t('general.company.desc')} value={draft.description ?? ''} onChange={v => set('description', v)} placeholder={t('general.company.descPh')} />
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "20px" }}>
          <Input label={t('general.company.phone')} value={draft.phone ?? ''} onChange={v => set('phone', v)} type="tel" />
          <Input label={t('general.company.email')} value={draft.email ?? ''} onChange={v => set('email', v)} type="email" />
          <Input label={t('general.company.site')} value={draft.website ?? ''} onChange={v => set('website', v)} type="url" placeholder={t('general.company.sitePh')} />
          <Input label={t('general.company.address')} value={draft.address ?? ''} onChange={v => set('address', v)} placeholder={t('general.company.addressPh')} />
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
          <Button variant="ghost" onClick={handleReset}>{t('general.reset')}</Button>
          <Button variant="primary" onClick={handleSave} disabled={!dirty} loading={save.isPending}>{t('common:buttons.save')}</Button>
        </div>
      </div>

      <div className="card" style={{ padding: "28px" }}>
        <SectionHeader icon={icons.globe} title={t('general.locale.title')} subtitle={t('general.locale.subtitle')} />
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px" }}>
            <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--onyx)" }}>{t('general.locale.timezone')}</div>
            <div style={{ width: "260px" }}><Select value={draft.timezone ?? ''} onChange={v => set('timezone', v)} options={timezoneOptions} /></div>
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px" }}>
            <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--onyx)" }}>{t('general.locale.currency')}</div>
            <div style={{ width: "260px" }}><Select value={draft.currency ?? ''} onChange={v => set('currency', v)} options={currencyOptions} /></div>
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px" }}>
            <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--onyx)" }}>{t('general.locale.language')}</div>
            <div style={{ width: "260px" }}><Select value={draft.language ?? ''} onChange={v => set('language', v)} options={languageOptions} /></div>
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px" }}>
            <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--onyx)" }}>{t('general.locale.dateFormat')}</div>
            <div style={{ width: "260px" }}><Select value={draft.date_format ?? ''} onChange={v => set('date_format', v)} options={dateFormatOptions} /></div>
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px" }}>
            <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--onyx)" }}>{t('general.locale.firstDay')}</div>
            <div style={{ width: "260px" }}><Select value={draft.first_day_of_week ?? ''} onChange={v => set('first_day_of_week', v)} options={firstDayOptions} /></div>
          </div>
        </div>
      </div>
    </div>
  );
}
