import { useEffect } from "react";
import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { settingsApi } from "../api/settings/settings.api";
import { queryKeys } from "../api/queryKeys";

// Тот же ключ, что и в onSuccess мутации AppearanceTab — анти-мигание тёмной
// темой между заходами (localStorage — только затравка, сервер остаётся
// источником истины).
export const THEME_STORAGE_KEY = "velora_theme";

function applyDarkClass(dark: boolean) {
  document.documentElement.classList.toggle("dark", dark);
}

// Единственная задача — держать класс .dark на <html> синхронно с
// User.theme (Tailwind v4 в проекте настроен именно на класс .dark, см. §5
// CLAUDE.md). Сама смена темы (мутация, optimistic UI) — в AppearanceTab,
// который читает/пишет тот же кэш-ключ queryKeys.appearance.
export function ThemeProvider({ children }: { children: ReactNode }) {
  const { data } = useQuery({
    queryKey: queryKeys.appearance,
    queryFn: () => settingsApi.getAppearance(),
    // Пока первый запрос в пути, берём последнюю известную тему из localStorage,
    // чтобы избежать вспышки светлого экрана при theme === 'dark' в БД.
    initialData: () => {
      const cached = localStorage.getItem(THEME_STORAGE_KEY);
      return cached ? { theme: cached, accent_color: null } : undefined;
    },
  });
  const theme = data?.theme ?? "light";

  useEffect(() => {
    const dark = theme === "dark"
      || (theme === "auto" && matchMedia("(prefers-color-scheme: dark)").matches);
    applyDarkClass(dark);
    // Кладём серверное значение в localStorage, а не только клик в AppearanceTab:
    // иначе на новом устройстве первый заход всё равно мигнёт светлым (затравку
    // читает инлайн-скрипт в index.html до старта React).
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  // auto → слушаем смену системной темы на лету.
  useEffect(() => {
    if (theme !== "auto") return;
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const onChange = (e: MediaQueryListEvent) => applyDarkClass(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [theme]);

  return children;
}
