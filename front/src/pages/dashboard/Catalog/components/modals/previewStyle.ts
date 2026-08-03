// Стилевые хелперы превью-панели модалок каталога (сами компоненты — в
// previewKit.tsx, разметочные классы .cmod-* — в Catalog.css).

const HEX_RE = /^#[0-9a-f]{6}$/i;

// Затемняет hex на долю k (0…1) — цвет услуги/зала на белой плашке иначе
// тонет: светлый персик поверх белого нечитаем.
function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => Math.round(v * (1 - k)));
  return `#${ch.map(v => v.toString(16).padStart(2, '0')).join('')}`;
}

// CSS-переменные превью из выбранного цвета: сам цвет, мягкая заливка,
// контур и затемнённый вариант под текст.
export function colorVars(raw: string | null | undefined): React.CSSProperties {
  const c = raw && HEX_RE.test(raw) ? raw : '#FCAE91';
  return {
    ['--cmod-c' as string]: c,
    ['--cmod-c-soft' as string]: `${c}1F`,
    ['--cmod-c-line' as string]: `${c}59`,
    ['--cmod-c-text' as string]: shade(c, 0.32),
  };
}

// Левая панель — жемчужный фон, чтобы белое превью «лежало» на поверхности,
// а не сливалось с ней.
export const LEFT_PANEL_STYLE: React.CSSProperties = {
  background: 'var(--bg)',
  borderRight: '1px solid var(--border)',
  padding: '26px 22px',
};
