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

// "Системная" тема — это НЕ prefers-color-scheme: та отражает статичный
// переключатель тёмного режима ОС, который большинство никогда не трогает,
// и на практике не "живёт" сама. Вместо этого auto светлеет/темнеет по часам
// устройства — ровно то же условие продублировано в инлайн-скрипте
// index.html (см. его комментарий).
function isAutoDark() {
  const h = new Date().getHours();
  return h < 6 || h >= 18;
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
  });
  // Ответа ещё нет (первый запрос) или его отобрали (queryClient.clear() при
  // смене студии/аккаунта) — берём тему этого аккаунта с прошлого раза. Читать
  // «данных нет» как light нельзя: после clear() подписанный наблюдатель
  // остаётся с пустыми данными и сам не перезапрашивает, и кабинет белел
  // насовсем. Затравку кладём в fallback, а не в initialData: тем ключом
  // делятся Настройки и DashboardLayout, и подсовывать им полу-ответ незачем.
  const theme = data?.theme ?? readThemeSeed() ?? "light";

  // Layout-эффект, а не обычный: при входе кабинет открывается без перезагрузки
  // страницы, и класс должен встать ДО первого кадра — иначе видна вспышка
  // светлого, ради устранения которой всё и затевалось.
  useLayoutEffect(() => {
    const dark = theme === "dark" || (theme === "auto" && isAutoDark());
    applyDarkClass(dark);
    // Затравку пишем и с серверного ответа, а не только по клику в AppearanceTab:
    // иначе на новом устройстве первый заход мигнёт светлым (её читает инлайн-
    // скрипт в index.html ещё до старта React). ТОЛЬКО с ответа сервера: раньше
    // сюда попадал и угаданный дефолт "light", затирая в localStorage реальную
    // тёмную — и следующая загрузка начиналась белым экраном.
    if (data?.theme) saveThemeSeed(data.theme);
  }, [theme, data?.theme]);

  // auto → пока кабинет открыт, пересчитываем каждую минуту: смена должна
  // произойти ровно в 6:00/18:00 по часам устройства, а не после перезахода.
  useEffect(() => {
    if (theme !== "auto") return;
    const id = setInterval(() => applyDarkClass(isAutoDark()), 60_000);
    return () => clearInterval(id);
  }, [theme]);

  return children;
}
