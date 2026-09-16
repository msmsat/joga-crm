import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Manrope — из бандла, а не с fonts.googleapis.com: запрос шрифта у Google
// передавал ему IP каждого посетителя без согласия (так решил LG München I,
// 3 O 17493/20). Начертания — те, что есть у гарнитуры: 900 не отдавал и Google.
import '@fontsource/manrope/400.css'
import '@fontsource/manrope/500.css'
import '@fontsource/manrope/600.css'
import '@fontsource/manrope/700.css'
import '@fontsource/manrope/800.css'
import './index.css'
import App from './App.tsx'
import './i18n';
import { detectLanguage } from './lib/detectLanguage';

// Не ждём: первый кадр — явный выбор или английский (utils/lang.initialLang),
// ответ сервера переключит его, если язык другой.
void detectLanguage();

// GoogleOAuthProvider здесь больше не оборачивает приложение: он грузил скрипт
// Google на КАЖДОЙ странице. Теперь он в components/cookies/GoogleSignIn —
// только на входе и только после согласия.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
