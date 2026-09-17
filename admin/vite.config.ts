import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Ассеты обязаны уехать под /adm/: на этом же домене мини-приложение уже
  // смонтировало /assets, и без префикса админка перекрыла бы его собой.
  base: '/adm/',
  // 5173 занят фронтом кабинета, 5174 — мини-приложением. strictPort, чтобы
  // dev-сервер не уехал молча на чужой свободный порт.
  server: { port: 5175, strictPort: true },
})
