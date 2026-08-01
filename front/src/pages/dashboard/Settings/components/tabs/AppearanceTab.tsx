import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { icons } from "../ui/SettingsIcons";
import SectionHeader from "../ui/SectionHeader";
import { useToast } from "../../../../../components/ui/index";
import { settingsApi } from "../../../../../api/settings/settings.api";
import { queryKeys } from "../../../../../api/queryKeys";
import { errorMessage } from "../../../../../api/errorMessage";
import { saveThemeSeed } from "../../../../../utils/auth";
import type { AppearanceSettings, AppearanceUpdate } from "../../../../../api/settings/settings.types";

export default function AppearanceTab() {
  const { t } = useTranslation('settings');
  const toast = useToast();
  const qc = useQueryClient();

  const { data } = useQuery({
    queryKey: queryKeys.appearance,
    queryFn: () => settingsApi.getAppearance(),
  });
  const themeMode = (data?.theme ?? "light") as "light" | "dark" | "auto";

  // Optimistic UI: клик перекрашивает интерфейс мгновенно (ThemeProvider читает
  // тот же кэш-ключ), откат — по onError. Тема дополнительно уходит в
  // localStorage — анти-мигание при следующей загрузке (см. ThemeContext.tsx).
  const save = useMutation({
    mutationFn: (patch: AppearanceUpdate) => settingsApi.updateAppearance(patch),
    onMutate: async (patch) => {
      await qc.cancelQueries({ queryKey: queryKeys.appearance });
      const prev = qc.getQueryData<AppearanceSettings>(queryKeys.appearance);
      qc.setQueryData<AppearanceSettings>(queryKeys.appearance, (o) => ({
        theme: o?.theme ?? null, accent_color: o?.accent_color ?? null, ...patch,
      }));
      return { prev };
    },
    onSuccess: (_data, patch) => {
      if (patch.theme) saveThemeSeed(patch.theme);
      toast.success(t('toast.saved'));
    },
    onError: (err, _patch, ctx) => {
      if (ctx?.prev) qc.setQueryData(queryKeys.appearance, ctx.prev);
      toast.error(errorMessage(err, t));
    },
  });

  const themes = [
    { id: "light", label: t('appearance.theme.light'), icon: icons.sun, preview: ["#FDFCFB", "#FFFFFF", "#FCAE91"] },
    { id: "dark", label: t('appearance.theme.dark'), icon: icons.moon, preview: ["#121212", "#1E1E1E", "#FCAE91"] },
    { id: "auto", label: t('appearance.theme.auto'), icon: icons.toggle, preview: ["#ECECEC", "#F5F5F5", "#FCAE91"] },
  ] as const;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      <div className="card" style={{ padding: "28px" }}>
        <SectionHeader icon={icons.palette} title={t('appearance.theme.title')} subtitle={t('appearance.theme.subtitle')} />
        <div style={{ display: "flex", gap: "12px", marginBottom: "24px" }}>
          {themes.map((th) => {
            const selected = themeMode === th.id;
            return (
              <button
                key={th.id}
                disabled={save.isPending}
                onClick={() => save.mutate({ theme: th.id })}
                style={{
                  flex: 1, padding: "16px 12px",
                  borderRadius: "12px",
                  border: `1.5px solid ${selected ? "var(--peach)" : "var(--border)"}`,
                  background: selected ? "rgba(252,174,145,0.07)" : "transparent",
                  cursor: save.isPending ? "default" : "pointer",
                  transition: "all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1)",
                  display: "flex", flexDirection: "column", alignItems: "center", gap: "10px",
                  outline: "none", opacity: save.isPending ? 0.7 : 1,
                }}
                onMouseOver={(e) => {
                  if (!selected) {
                    e.currentTarget.style.borderColor = "rgba(252,174,145,0.4)";
                    e.currentTarget.style.background = "rgba(0,0,0,0.02)";
                  }
                }}
                onMouseOut={(e) => {
                  if (!selected) {
                    e.currentTarget.style.borderColor = "var(--border)";
                    e.currentTarget.style.background = "transparent";
                  }
                }}
              >
                <div style={{ display: "flex", gap: "4px" }}>
                  {th.preview.map((c, i) => (
                    <div key={i} style={{
                      width: i === 2 ? "12px" : "20px", height: "24px",
                      borderRadius: "4px", background: c,
                      border: "1px solid rgba(0,0,0,0.06)",
                    }} />
                  ))}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "5px", color: selected ? "var(--peach)" : "var(--muted)" }}>
                  {th.icon}
                  <span style={{ fontSize: "12px", fontWeight: 600 }}>{th.label}</span>
                </div>
                <div style={{
                  width: "18px", height: "18px", borderRadius: "50%",
                  background: selected ? "var(--peach)" : "transparent",
                  border: selected ? "none" : "1.5px solid var(--border)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: "white",
                  transition: "all 0.2s ease"
                }}>
                  {selected && (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ animation: "csCheckPop 0.2s cubic-bezier(0.34, 1.5, 0.64, 1)" }}>
                      <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
