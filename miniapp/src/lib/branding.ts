/**
 * Брендинг мини-приложения из настроек студии (CRM → «Онлайн-запись» →
 * «Брендинг виджета»): фирменный цвет, тёмная тема и язык по умолчанию.
 *
 * Цвет не прокидывается пропсами по компонентам — весь UI уже написан на
 * токенах `--v-brand*` (index.css), поэтому студийный акцент подменяет сами
 * токены на `<html>`, и его подхватывают разом все `bg-brand`, `text-brand`,
 * SVG-обводки и тени.
 */
import i18n from '../i18n';
import { CHOICE_KEY, resolveLanguage } from './language';

const DEFAULT_ACCENT = '#F9A08B';

/** #abc / #aabbcc → [r, g, b]; мусор → null. */
function parseHex(hex: string): [number, number, number] | null {
  const clean = hex.trim().replace(/^#/, '');
  const full = clean.length === 3 ? clean.replace(/./g, (c) => c + c) : clean;
  if (!/^[0-9a-f]{6}$/i.test(full)) return null;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as [number, number, number];
}

/**
 * Цвет текста на плашке акцента: оникс или белый — что читается.
 * Студия выбирает акцент сама (шесть вариантов в CRM, среди них тёмно-зелёный и
 * синий), и жёстко зашитый оникс на них давал бы 2:1 вместо 4.5:1 по WCAG.
 */
function foregroundFor(rgb: [number, number, number]): string {
  // Относительная яркость, WCAG 2.1 (sRGB → linear).
  const [r, g, b] = rgb.map((channel) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.4 ? '#1A1A1A' : '#FFFFFF';
}

export function applyBranding(accentColor?: string | null, darkMode?: boolean | null): void {
  const root = document.documentElement;
  const rgb = parseHex(accentColor || DEFAULT_ACCENT) ?? parseHex(DEFAULT_ACCENT)!;
  const hex = `#${rgb.map((c) => c.toString(16).padStart(2, '0')).join('')}`.toUpperCase();

  root.style.setProperty('--v-brand', hex);
  // Sheet.tsx дописывает к этому значению hex-альфу (`var(--v-brand-light)26`),
  // поэтому здесь обязателен 6-значный hex, а не rgb()/hsl().
  root.style.setProperty('--v-brand-light', hex);
  root.style.setProperty('--v-brand-foreground', foregroundFor(rgb));
  root.style.setProperty('--v-shadow-brand', `0 12px 28px -8px rgba(${rgb.join(', ')}, 0.5)`);

  // Тёмная тема виджета — тот же класс `.dark`, под который написан index.css.
  root.classList.toggle('dark', Boolean(darkMode));
}

/** Человек выбрал язык сам. Пишем СВОЙ ключ, а не полагаемся на `i18nextLng`:
 *  тот детектор ставит на старте и без всякого выбора (см. lib/language.ts). */
export function chooseLanguage(code: string): void {
  try {
    localStorage.setItem(CHOICE_KEY, code);
  } catch {
    // Приватный режим: выбор не переживёт перезагрузку, но сейчас сработает.
  }
  i18n.changeLanguage(code);
}

/**
 * Язык студии — именно ДЕФОЛТНЫЙ, и по-настоящему только для тех, чьё
 * устройство говорит на языке, которого у нас нет. Порядок и его обоснование —
 * в `lib/language.ts`; здесь остаётся только собрать источники и применить.
 *
 * Языка, которого нет в мини-приложении, у студии не бывает: список в CRM
 * собран из ровно тех же кодов (front/.../Booking/mapping.ts) — но проверку
 * держим, значение в базе свободное (String(5)).
 */
export function applyDefaultLanguage(language?: string | null): void {
  let choice: string | null = null;
  try {
    choice = localStorage.getItem(CHOICE_KEY);
  } catch {
    // Сторадж недоступен — считаем, что выбора не было.
  }

  const next = resolveLanguage({
    supported: Object.keys(i18n.options.resources ?? {}),
    choice,
    device: navigator.languages?.length ? navigator.languages : [navigator.language],
    studio: language,
  });

  if (next && next !== i18n.language) i18n.changeLanguage(next);
}
