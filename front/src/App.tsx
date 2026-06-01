import React from "react";

// ─── Импорты страниц ─────────────────────────────────────────────────────────
// Импортируем твой компонент лендинга из файла card-home.tsx
import Landing from "./pages/Landingpage";

// Если в будущем ты вынесешь логин в отдельный файл (например, src/pages/Login.tsx):
// import LoginPage from "./pages/Login";

// ─── Главный компонент App ───────────────────────────────────────────────────
/**
 * App является точкой входа и координатором приложения.
 * Здесь настраиваются:
 * 1. Роутинг (навигация между страницами)
 * 2. Глобальные провайдеры (Theme, Auth, Store, React Query и т.д.)
 * 3. Глобальные компоненты (Toasts, Modals)
 */
export default function App() {
  return (
    // StrictMode помогает отлавливать потенциальные проблемы на этапе разработки
    <React.StrictMode>
      
      {/* ========================================================================
        Пример того, как это будет выглядеть при подключении react-router-dom:
        ========================================================================
        
        <ThemeProvider>
          <AuthProvider>
            <BrowserRouter>
              <Routes>
                <Route path="/" element={<Landing />} />
                <Route path="/login" element={<LoginPage />} />
                <Route path="/dashboard" element={<Dashboard />} />
              </Routes>
            </BrowserRouter>
          </AuthProvider>
        </ThemeProvider>
      */}

      {/* Сейчас, пока мы не подключили роутер, мы просто рендерим Landing как главную страницу */}
      <Landing />
      
    </React.StrictMode>
  );
}