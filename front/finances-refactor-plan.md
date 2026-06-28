# Finances — План рефакторинга (8 задач)

## Файлы, изменяемые в рамках работы

| Файл | Задачи |
|------|--------|
| `src/pages/dashboard/Finances/types.ts` | 2 |
| `src/pages/dashboard/Finances/constants.ts` | 2 |
| `src/pages/dashboard/Finances/Finances.tsx` | 2 |
| `src/pages/dashboard/Finances/components/tabs/CounterpartiesTab.tsx` | 1, 3 |
| `src/pages/dashboard/Finances/components/tabs/SalariesTab.tsx` | 2 (создать) |
| `src/pages/dashboard/Finances/components/tabs/OperationsTab.tsx` | 4 |
| `src/pages/dashboard/Finances/components/tabs/DocumentsTab.tsx` | 5 |
| `src/pages/dashboard/Finances/components/tabs/OnlinePaymentsTab.tsx` | 6 |
| `src/pages/dashboard/Finances/components/tabs/ReportsTab.tsx` | 7 |
| `src/pages/dashboard/Finances/components/tabs/GoalsTab.tsx` | 8 |

---

## Задачи

- [x] **Задача 1** — Редизайн формы Контрагентов (двухколоночный grid, GoalsTab-паттерн, peach focus, morphContainer)
- [x] **Задача 2** — Новая вкладка «Зарплаты» (SalariesTab.tsx, expandable rows, inline rate-input, SVG мини-чарт)
- [x] **Задача 3** — Inline-редактирование Контрагентов (editingId state, инпуты вместо текста, ✓/X)
- [x] **Задача 4** — Inline-редактирование Операций (в expanded row: название/сумма/категория/дата)
- [x] **Задача 5** — Documents Popover «Опции» + Inline Status (dark popover #111, SVG иконки, inline dropdown статуса)
- [x] **Задача 6** — Online Payments: числа на барах + тёмный тултип при hover
- [x] **Задача 7** — Reports: числа на барах + тёмный тултип при hover (bar chart + donut)
- [x] **Задача 8** — Goals Inline-редактирование карточек (карандаш → три инпута, morphContainer)

---

## Правило: каждую задачу выполнять только по команде пользователя.
