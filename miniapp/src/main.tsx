import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MotionConfig } from 'framer-motion'
import './index.css'
// До первого кадра: `--app-h` должна стоять раньше, чем React нарисует раму,
// иначе первый кадр уедет по запасному `100dvh` и тут же поправится.
import './lib/appHeight'
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
