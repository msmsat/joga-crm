import { useEffect, useLayoutEffect } from "react";
import type { ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { settingsApi } from "../api/settings/settings.api";
import { queryKeys } from "../api/queryKeys";
import { readThemeSeed, saveThemeSeed } from "../utils/auth";

function applyDarkClass(dark: boolean) {
  document.documentElement.classList.toggle("dark", dark);
}

/**
 * Снимает `.dark` везде, кроме кабинета. Живёт отдельно от ThemeProvider и
 * висит на роутере, а не на layout'е, потому что класс ставится ДО React
 * (инлайн-скрипт в index.html), а ThemeProvider может не смонтироваться вовсе:
 * на /dashboard с протухшим токеном ProtectedRoute уводит на /login, а
 * DashboardLayout так и не появляется — и снять класс становится некому.
 * Ставить класс по-прежнему может ТОЛЬКО ThemeProvider; здесь — только снятие.
 * Условие пути — то же самое, что в инлайн-скрипте index.html.
 */
export function DarkClassGuard() {
  const { pathname } = useLocation();
  // Именно layout-эффект: обычный сработал бы после отрисовки, и редирект
  // /dashboard → /login успел бы мигнуть чёрным кадром.
  useLayoutEffect(() => {
    if (!pathname.startsWith("/dashboard")) applyDarkClass(false);
  }, [pathname]);
  return null;
}

// Единственная задача — держать класс .dark на <html> синхронно с
// User.theme (Tailwind v4 в проекте настроен именно на класс .dark, см. §5
// CLAUDE.md). Сама смена темы (мутация, optimistic UI) — в AppearanceTab,
// который читает/пишет тот же кэш-ключ queryKeys.appearance.
export function ThemeProvider({ children }: { children: ReactNode }) {
  const { data } = useQuery({
    queryKey: queryKeys.appearance,
    queryFn: () => settingsApi.getAppearance(),
    // Пока первый запрос в пути, берём тему этого аккаунта с прошлого раза,
    // чтобы не мигать светлым при theme === 'dark' в БД.
    initialData: () => {
      const cached = readThemeSeed();
      return cached ? { theme: cached, accent_color: null } : undefined;
    },
  });
  const theme = data?.theme ?? "light";

  // Layout-эффект, а не обычный: при входе кабинет открывается без перезагрузки
  // страницы, и класс должен встать ДО первого кадра — иначе видна вспышка
  // светлого, ради устранения которой всё и затевалось.
  useLayoutEffect(() => {
    const dark = theme === "dark"
      || (theme === "auto" && matchMedia("(prefers-color-scheme: dark)").matches);
    applyDarkClass(dark);
    // Затравку пишем и с серверного ответа, а не только по клику в AppearanceTab:
    // иначе на новом устройстве первый заход мигнёт светлым (её читает инлайн-
    // скрипт в index.html ещё до старта React).
    saveThemeSeed(theme);
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
