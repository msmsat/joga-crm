/**
 * Проверяет, что каждая якорная ссылка лендинга ведёт в существующий раздел.
 *
 * Так уже ломалось: кнопка «Смотреть демо» вела на #showcase, а у секции id
 * был #product — клик не делал ничего. Плюс полподвала стояло на href={null}
 * с подстановкой "#top": ссылки выглядели рабочими, а уносили наверх страницы.
 * Ни билд, ни eslint про мёртвый якорь не знают — браузер тоже молчит.
 *
 * Запуск:  node scripts/check-landing-anchors.mjs
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const DIR = path.join(import.meta.dirname, '..', 'src', 'pages', 'Landing');

function sources(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? sources(path.join(dir, e.name))
      : e.name.endsWith('.tsx') ? [path.join(dir, e.name)] : []);
}

const ids = new Set();
const links = [];   // { target, file }

for (const file of sources(DIR)) {
  const code = readFileSync(file, 'utf8');
  const where = path.basename(file);
  // id="product" и id: "booking" (последнее — поля BLOCKS, из них Showcase
  // делает якоря разборов).
  for (const [, id] of code.matchAll(/\bid[=:]\s*"([\w-]+)"/g)) ids.add(id);
  // href="#faq" и href: "#faq"
  for (const [, target] of code.matchAll(/\bhref[=:]\s*"#([\w-]+)"/g)) links.push({ target, where });
}

const dead = links.filter((l) => !ids.has(l.target));
if (dead.length) {
  console.error(
    `Битые якоря лендинга (${dead.length}):\n` +
    dead.map((l) => `  - ${l.where}: href="#${l.target}" — раздела с таким id на странице нет`).join('\n'));
  process.exit(1);
}

// «Ведёт наверх» допустимо ровно одному элементу — логотипу в шапке и подвале.
const toTop = links.filter((l) => l.target === 'top');
if (toTop.length > 1) {
  console.error(`Наверх страницы ведут ${toTop.length} ссылки — так и выглядит подвал из заглушек. Наверх можно только логотипу.`);
  process.exit(1);
}

console.log(`OK: ${links.length} якорных ссылок лендинга ведут в существующие разделы (${[...ids].filter((i) => links.some((l) => l.target === i)).join(', ')})`);
