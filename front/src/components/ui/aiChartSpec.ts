// Контракт блока ```velora-chart и его разбор. Отдельным модулем от AIChart.tsx
// не по вкусу: файл компонента обязан экспортировать только компоненты, иначе
// ломается fast-refresh (правило react-refresh/only-export-components).

export interface AIChartPoint { label: string; value: number }

export interface AIChartSpec {
  type: 'bar' | 'line' | 'pie';
  title?: string;
  /** Код валюты студии из данных инструмента. Нет — значит, это не деньги. */
  currency?: string;
  data: AIChartPoint[];
}

// Больше 24 точек в пузыре чата нечитаемо, а модель охотно отдаёт ряд на год
// по дням. Не рисуем — показываем блок кодом, это честнее обрезки.
const MAX_POINTS = 24;

/**
 * Разбор блока ```velora-chart. Ответ модели — внешние данные: битый JSON,
 * выдуманный тип и нечисловые значения тут норма, а не исключение. Всё, что не
 * прошло проверку, возвращает null — и вызывающий показывает блок кодом,
 * вместо того чтобы уронить всю ленту чата.
 */
export function parseChartSpec(raw: string): AIChartSpec | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const spec = parsed as Record<string, unknown>;

  if (spec.type !== 'bar' && spec.type !== 'line' && spec.type !== 'pie') return null;
  if (!Array.isArray(spec.data) || spec.data.length === 0 || spec.data.length > MAX_POINTS) return null;

  const data: AIChartPoint[] = [];
  for (const item of spec.data) {
    if (!item || typeof item !== 'object') return null;
    const { label, value } = item as Record<string, unknown>;
    if (typeof value !== 'number' || !Number.isFinite(value)) return null;
    data.push({ label: String(label ?? ''), value });
  }

  return {
    type: spec.type,
    title: typeof spec.title === 'string' ? spec.title : undefined,
    currency: typeof spec.currency === 'string' ? spec.currency : undefined,
    data,
  };
}
