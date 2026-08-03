/**
 * Проверяет мобильный слой (<768px) — то, что билд и eslint пропускают молча.
 *
 * Три вещи, каждая из которых один раз уже ломалась или ломается незаметно:
 *
 * 1. Каскад .mnav. Правила нижней панели стоят в App.css НИЖЕ телефонного
 *    медиазапроса, поэтому «показать на телефоне» нельзя написать как
 *    `@media (max-width: 767px) { .mnav { display: flex } }` — базовое
 *    значение ниже перебьёт его при равной специфичности. Скрытие на
 *    десктопе обязано идти через `@media (min-width: 768px)` ПОСЛЕ базового
 *    `display: flex`. Ошибка не видна ни в билде, ни в линте: панель просто
 *    не появляется (или висит на десктопе).
 *
 * 2. Ключи вкладок MobileNav существуют в navItems. Переименовали ключ —
 *    вкладка молча исчезает с телефона, TypeScript об этом не знает.
 *
 * 3. Телефонный блок в App.css — последний. Любые правила после него с той
 *    же специфичностью его перебивают.
 *
 * Запуск:  node scripts/check-mobile.mjs
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

const SRC = path.join(import.meta.dirname, '..', 'src');
const css = readFileSync(path.join(SRC, 'App.css'), 'utf8');
const mobileNav = readFileSync(path.join(SRC, 'components/ui/MobileNav.tsx'), 'utf8');
const navItems = readFileSync(path.join(SRC, 'components/ui/navItems.tsx'), 'utf8');

const fail = [];

/* 1. Каскад .mnav ────────────────────────────────────────────────────────── */
const baseMnav = css.search(/^\.mnav \{[^}]*display:\s*flex/m);
const hideMnav = css.search(/@media \(min-width: 768px\) \{\s*\.mnav \{ display: none/);

if (baseMnav === -1) fail.push('App.css: нет базового `.mnav { display: flex }` — панель не покажется');
if (hideMnav === -1) fail.push('App.css: нет `@media (min-width: 768px) { .mnav { display: none } }` — панель останется на десктопе');
if (baseMnav !== -1 && hideMnav !== -1 && hideMnav < baseMnav) {
  fail.push('App.css: скрытие .mnav на десктопе стоит ВЫШЕ базового display:flex — базовое перебьёт его, панель повиснет на десктопе');
}

/* 2. Ключи вкладок ───────────────────────────────────────────────────────── */
const tabKeys = (mobileNav.match(/const TAB_KEYS = \[([^\]]*)\]/)?.[1] ?? '')
  .split(',').map((s) => s.trim().replace(/['"]/g, '')).filter(Boolean);

if (tabKeys.length === 0) fail.push('MobileNav.tsx: не удалось прочитать TAB_KEYS');
const knownKeys = new Set([...navItems.matchAll(/key: '([a-z]+)'/g)].map((m) => m[1]));
for (const key of tabKeys) {
  if (!knownKeys.has(key)) fail.push(`MobileNav.tsx: вкладка "${key}" не найдена среди пунктов navItems.tsx — на телефоне её не будет`);
}

/* 3. Телефонный блок — последний ─────────────────────────────────────────── */
const lastMobile = css.lastIndexOf('@media (max-width: 767px)');
if (lastMobile === -1) {
  fail.push('App.css: телефонный блок @media (max-width: 767px) пропал');
} else {
  // После последнего телефонного блока допустимы только @keyframes и
  // десктопное скрытие панели — всё прочее перебивает мобильные правила.
  const after = css.slice(lastMobile);
  const strayRule = after.match(/\n(?!\s)(?!@keyframes)(?!@media \(min-width)([.#][\w-]+[^{]*)\{/);
  if (strayRule) fail.push(`App.css: после телефонного блока идёт правило "${strayRule[1].trim()}" — оно перебьёт мобильные стили`);
}

if (fail.length) {
  console.error(`Мобильный слой сломан (${fail.length}):\n` + fail.map((f) => '  - ' + f).join('\n'));
  process.exit(1);
}
console.log(`OK: каскад .mnav верный, вкладки телефона (${tabKeys.join(', ')}) на месте, телефонный блок последний`);
