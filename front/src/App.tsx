import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import Landing from "./pages/Landingpage";
import LoginPage from './pages/Loginpage'; // Твоя страница логина
import Dashboard from './pages/Dashboard';
import RegisterPage from './pages/Registerpage';
// import RegisterPage from './pages/RegisterPage'; // Раскомментируешь, когда создашь

// ─── 1. ЗАЩИТА КАБИНЕТА (Пускает только с токеном) ──────────────────────────
const ProtectedRoute = ({ children }: { children: ReactNode }) => {
  const token = localStorage.getItem('token');
  
  if (!token) {
    // Токена нет? Отправляем на страницу входа
    return <Navigate to="/login" replace />;
  }
  
  // Токен есть? Проходи, показываем компонент
  return children; 
};

// ─── 2. ЗАЩИТА ЛОГИНА (Не пускает, если УЖЕ вошел) ──────────────────────────
const PublicRoute = ({ children }: { children: ReactNode }) => {
  const token = localStorage.getItem('token');
  
  if (token) {
    // Уже есть токен? Чего тебе на странице логина делать, иди в кабинет!
    return <Navigate to="/dashboard" replace />;
  }
  
  return children;
};

// ─── ГЛАВНЫЙ КОМПОНЕНТ APP ──────────────────────────────────────────────────
function App() {
  return (
    <Router>
      <Routes>
        {/* Лендинг доступен абсолютно всем */}
        <Route path="/" element={<Landing />} />
        
        {/* Страницу логина оборачиваем в PublicRoute */}
        <Route 
          path="/login" 
          element={
            <PublicRoute>
              <LoginPage />
            </PublicRoute>
          } 
        />

        {/* Твой Дашборд оборачиваем в ProtectedRoute */}
        <Route 
          path="/dashboard" 
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          } 
        />

        <Route 
          path="/register" 
          element={<RegisterPage />} 
        />
      </Routes>
    </Router>
  );
}

export default App;