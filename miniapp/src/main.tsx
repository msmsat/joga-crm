import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MotionConfig } from 'framer-motion'
import './index.css'
import App from './App.tsx'
import './i18n';

// reducedMotion="user" — один переключатель на все анимации приложения:
// у кого в системе включено «уменьшить движение», тот получает смену
// прозрачности вместо переездов и пружин. Разбирать это по компонентам
// пришлось бы в трёх десятках мест.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MotionConfig reducedMotion="user">
      <App />
    </MotionConfig>
  </StrictMode>,
)
