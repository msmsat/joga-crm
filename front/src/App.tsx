import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Landing from "./pages/Landingpage";
import LoginPage from './pages/Loginpage'; // Твоя страница логина
// import RegisterPage from './pages/RegisterPage'; // Раскомментируешь, когда создашь

function App() {
  return (
    <Router>
      <Routes>
        {/* Главная страница (сайт-карточка) по адресу "/" */}
        <Route path="/" element={<Landing />} />
        
        {/* Страница логина по адресу "/login" */}
        <Route path="/login" element={<LoginPage />} />
        
        {/* Страница регистрации по адресу "/register" */}
        {/* <Route path="/register" element={<RegisterPage />} /> */}
      </Routes>
    </Router>
  );
}

export default App;