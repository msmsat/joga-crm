// Ключи кэша TanStack Query в одном месте — чтобы инвалидация после мутаций не
// разъехалась с загрузкой из-за опечатки в строке.
//
// Соглашение (для будущих страниц): ключ = сущность (+ id при детали). Любая
// мутация обязана перечислить ВСЕ ключи, где изменённая сущность видна (напр.
// правка зала трогает и деталь филиала, и счётчик залов в списке филиалов).
// Трансформация данных под UI — через `select` квери, не отдельным ключом.
//
// Занято Каталогом: branches, branch(id), services.
// Очередь миграции (по мере аудитов): Клиенты, Журнал, Сотрудники, Финансы, Отчёты.
export const queryKeys = {
  branches: ['branches'] as const,
  branch: (id: number) => ['branch', id] as const,
  services: ['services'] as const,
  serviceWeek: (id: number) => ['services', id, 'week'] as const,
  packages: ['catalog', 'packages'] as const,
  subscriptionConfig: ['catalog', 'subscription-config'] as const,
}
