import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
  },
  {
    // shadcn/ui-компоненты экспортируют *Variants рядом с компонентом — это их норма
    files: ['src/components/ui-shadcn/**/*.{ts,tsx}'],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
  {
    // Файлы, где соседство компонента с не-компонентом — намеренное:
    //   Icons/LoyaltyIcons — словарь-объект из компонентов (рулу его не опознать);
    //   Toast/ModalShell/AIDrawerContext — провайдер и его хук, канонический
    //     React-паттерн: разносить их по файлам пришлось бы ценой правки десятков
    //     импортов ради эвристики HMR;
    //   UI.tsx — легаси лендинга/авторизации, там же лежат константы онбординга.
    // Цена ровно одна: правка этих файлов перезагружает страницу вместо
    // горячей замены. На сборку и рантайм не влияет.
    files: [
      'src/components/Icons.tsx',
      'src/components/UI.tsx',
      'src/components/ui/Toast.tsx',
      'src/components/ui/modal/ModalShell.tsx',
      'src/contexts/AIDrawerContext.tsx',
      'src/pages/dashboard/Loyalty/components/ui/LoyaltyIcons.tsx',
    ],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
])
