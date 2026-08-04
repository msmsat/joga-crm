import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Порт прибит гвоздями: origin мини-приложения перечислен в CORS_ORIGINS
  // бэкенда, и если Vite уедет на свободный 5175 (или займёт 5173 у front,
  // когда тот не запущен), запросы снова упрутся в CORS.
  server: { port: 5174, strictPort: true },
})
