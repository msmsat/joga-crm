import { useState } from "react";
import { useTranslation } from "react-i18next";
import { icons } from "../ui/SettingsIcons";
import SectionHeader from "../ui/SectionHeader";
import { Button, EmptyState, Input, Select, useToast } from "../../../../../components/ui/index";
import { CURRENCY_OPTIONS, LANGUAGES, TIMEZONES } from "../../../../../components/UI";
import { resolveImageUrl } from "../../../../../api/client";
import { useGeneralSettings } from "../../hooks/useGeneralSettings";
import type { GeneralSettings, GeneralUpdate } from "../../../../../api/settings/settings.types";

// logo_url — отдельный аплоад (uploadLogo), journal_time_step — без UI в этой задаче.
// Карточка компании редактируется черновиком (Сохранить/Отмена), локаль
// сохраняется сразу при выборе — у неё своих кнопок нет.
// date_format и first_day_of_week полей не имеют: их никто не читает — ни один
// формат даты и ни один календарь в продукте на них не смотрит.
const COMPANY_FIELDS = ["name", "description", "phone", "email", "website", "address"] as const;
type LocaleField = "timezone" | "language" | "currency";

export default function GeneralTab() {
  const { t } = useTranslation(['settings', 'onboarding']);
  const toast = useToast();
  const { data, isLoading, isError, refetch, save, uploadLogo } = useGeneralSettings();
  const [draft, setDraft] = useState<GeneralSettings | null>(null);
  const [logoHover, setLogoHover] = useState(false);
  // Черновик синхронизируется с ответом сервера при смене ссылки на data (первая
  // загрузка, ответ save/uploadLogo) — правка состояния во время рендера, не в
  // useEffect (react-hooks/set-state-in-effect): нет лишнего цикла рендера.
  const [synced, setSynced] = useState<GeneralSettings | null>(null);
  if (data && data !== synced) {
    // Локаль сохраняется мгновенно и обновляет data — незакоммиченные правки
    // карточки компании при этом не затираем.
    if (!draft || !synced || !COMPANY_FIELDS.some(k => draft[k] !== synced[k])) setDraft(data);
    setSynced(data);
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

  // Те же списки значений и подписи (namespace "onboarding"), что и на шаге
  // регион-настроек онбординга (StepSettings) — набор валют/поясов/языков
  // должен совпадать один в один, обычный kit Select, без визуальных правок.
  const currencyOptions = CURRENCY_OPTIONS.map(c => ({ value: c.value, label: `${c.symbol}  ${t(`onboarding:settings.currencies.${c.value}`)}` }));
  const languageOptions = LANGUAGES;
  const timezoneOptions = TIMEZONES.map(tz => ({ value: tz.value, label: t(`onboarding:settings.timezones.${tz.value}`) }));

  const dirty = COMPANY_FIELDS.some(k => draft[k] !== data[k]);

  const set = <K extends keyof GeneralSettings>(key: K, value: GeneralSettings[K]) =>
    setDraft(prev => (prev ? { ...prev, [key]: value } : prev));

  // Локаль: выбор сразу уходит на бэк, поэтому кнопок «Сохранить»/«Отмена» у неё нет.
  const setLocale = <K extends LocaleField>(key: K, value: GeneralSettings[K]) => {
    set(key, value);
    save.mutate({ [key]: value } as GeneralUpdate);
  };

  const handleCancel = () => {
    setDraft(data);
    toast.success(t('general.resetToast'));
  };

  const handleSave = () => {
    const patch: Record<string, unknown> = {};
    COMPANY_FIELDS.forEach(key => {
      if (draft[key] !== data[key]) patch[key] = draft[key];
    });
    save.mutate(patch as GeneralUpdate);
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadLogo.mutate(file);
    e.target.value = ""; // повторный выбор того же файла должен снова сработать
  };

  // Логотип — из ответа сервера: черновик мог не пересинхронизироваться, если в
  // полях компании есть несохранённые правки.
  const logoSrc = resolveImageUrl(data.logo_url);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      <div className="card" style={{ padding: "28px 28px 24px" }}>
        <SectionHeader icon={icons.building} title={t('general.company.title')} subtitle={t('general.company.subtitle')} />
        {/* Класс нужен телефону: там логотип 96px рядом с полями оставлял им
            71px ширины — в поле не влезало даже название студии. На узком
            экране строка становится колонкой (см. Settings.css). */}
        <div className="set-logo-row" style={{ display: "flex", gap: "24px", marginBottom: "20px" }}>
          <label
            onMouseEnter={() => setLogoHover(true)}
            onMouseLeave={() => setLogoHover(false)}
            style={{
              width: "96px", height: "96px", borderRadius: "20px", flexShrink: 0,
              background: logoSrc
                ? "transparent"
                : logoHover
                  ? "linear-gradient(135deg, rgba(252,174,145,0.16), rgba(249,160,139,0.06))"
                  : "linear-gradient(135deg, rgba(252,174,145,0.07), rgba(var(--ink),0.02))",
              border: logoSrc ? "none" : `2px dashed ${logoHover ? "var(--peach)" : "rgba(var(--ink),0.14)"}`,
              boxShadow: logoHover
                ? logoSrc
                  ? "0 14px 28px -8px rgba(249,160,139,0.35), 0 0 0 1px rgba(var(--ink),0.05)"
                  : "0 10px 24px -8px rgba(249,160,139,0.35), 0 0 0 4px var(--peach-glow)"
                : logoSrc
                  ? "0 4px 14px rgba(26,26,26,0.10), 0 0 0 1px rgba(var(--ink),0.05)"
                  : "none",
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
              gap: "6px", cursor: uploadLogo.isPending ? "default" : "pointer",
              transition: "all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)",
              transform: logoHover ? "translateY(-2px)" : "none",
              overflow: "hidden", position: "relative"
            }}
          >
            <input type="file" hidden disabled={uploadLogo.isPending} onChange={handleLogoUpload} accept="image/png,image/jpeg,image/webp" />
            {uploadLogo.isPending ? (
              <svg className="spin-anim" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--peach)" strokeWidth="3" strokeLinecap="round">
                <circle cx="12" cy="12" r="10" strokeOpacity="0.2" /><path d="M4 12a8 8 0 0 1 8-8" />
              </svg>
            ) : logoSrc ? (
              <>
                <img src={logoSrc} alt="Logo" style={{
                  width: "100%", height: "100%", objectFit: "cover",
                  transition: "transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)",
                  transform: logoHover ? "scale(1.06)" : "scale(1)",
                }} />
                <div style={{
                  position: "absolute", inset: 0,
                  background: "linear-gradient(0deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.1) 55%, transparent 100%)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  opacity: logoHover ? 1 : 0, transition: "opacity 0.25s ease", color: "white"
                }}>
                  <div style={{
                    width: "30px", height: "30px", borderRadius: "10px",
                    background: "linear-gradient(135deg, var(--peach-light), var(--peach))",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    boxShadow: "0 4px 12px rgba(0,0,0,0.25)",
                    transform: logoHover ? "scale(1)" : "scale(0.7)",
                    transition: "transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)",
                  }}>
                    {icons.edit}
                  </div>
                </div>
              </>
            ) : (
              <>
                <div style={{
                  width: "34px", height: "34px", borderRadius: "12px",
                  background: logoHover ? "linear-gradient(135deg, var(--peach-light), var(--peach))" : "rgba(var(--ink),0.05)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: logoHover ? "white" : "var(--peach)",
                  transform: logoHover ? "scale(1.1) rotate(90deg)" : "scale(1) rotate(0deg)",
                  transition: "all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)",
                }}>
                  {icons.plus}
                </div>
                <span style={{ fontSize: "10.5px", fontWeight: 700, letterSpacing: "0.2px", color: logoHover ? "var(--peach)" : "var(--muted)", transition: "color 0.2s ease" }}>
                  {t('common:buttons.upload')}
                </span>
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
          {/* «Отмена» появляется только когда есть что отменять. */}
          {dirty && <Button variant="ghost" onClick={handleCancel}>{t('common:buttons.cancel')}</Button>}
          <Button variant="primary" onClick={handleSave} disabled={!dirty} loading={save.isPending && dirty}>{t('common:buttons.save')}</Button>
        </div>
      </div>

      <div className="card" style={{ padding: "28px" }}>
        <SectionHeader icon={icons.globe} title={t('general.locale.title')} subtitle={t('general.locale.subtitle')} />
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px" }}>
            <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--onyx)" }}>{t('general.locale.timezone')}</div>
            {/* searchable — 26 поясов, искать город быстрее, чем листать. */}
            <div style={{ width: "min(260px, 46%)", minWidth: "150px" }}>
              <Select
                value={draft.timezone ?? ''}
                onChange={v => setLocale('timezone', v)}
                options={timezoneOptions}
                searchable
                searchPlaceholder={t('general.locale.timezoneSearch')}
                emptyText={t('general.locale.timezoneNotFound')}
              />
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px" }}>
            <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--onyx)" }}>{t('general.locale.currency')}</div>
            <div style={{ width: "min(260px, 46%)", minWidth: "150px" }}><Select value={draft.currency ?? ''} onChange={v => setLocale('currency', v)} options={currencyOptions} /></div>
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px" }}>
            <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--onyx)" }}>{t('general.locale.language')}</div>
            <div style={{ width: "min(260px, 46%)", minWidth: "150px" }}><Select value={draft.language ?? ''} onChange={v => setLocale('language', v)} options={languageOptions} /></div>
          </div>
        </div>
      </div>
    </div>
  );
}
