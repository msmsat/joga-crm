import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MotionConfig } from 'framer-motion'
// Manrope и только он: одна гарнитура на весь кабинет, иерархию держат кегль,
// вес и трекинг. Файлы — из бандла, а не с fonts.googleapis.com: тот получал
// IP каждого клиента студии без согласия (LG München I, 3 O 17493/20).
// Тоньше 400 в приложении ничего не набрано, поэтому 200 и 300 не везём.
import '@fontsource/manrope/400.css'
import '@fontsource/manrope/500.css'
import '@fontsource/manrope/600.css'
import '@fontsource/manrope/700.css'
import '@fontsource/manrope/800.css'
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
