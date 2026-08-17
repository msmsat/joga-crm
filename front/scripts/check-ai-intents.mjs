/**
 * Сверяет интенты ассистента с подписками страниц, а инструменты — с подписями
 * их статусов в обеих локалях.
 *
 * Интент, о котором знает модель, но не знает фронт, — это молчаливая кнопка:
 * ассистент говорит «открываю», и ничего не происходит. Обратное тоже мусор:
 * подписка на интент, которого нет на сервере, — мёртвый код на странице.
 *
 * Статус инструмента — это то, что человек читает 5-15 секунд, пока идёт ответ.
 * Одинаковое «Работаю…» на шесть десятков инструментов делает ожидание
 * бессмысленным, а фолбэк срабатывает молча — поймать пропущенный ключ можно
 * только проверкой (эпик AI-6, задача 17).
 *
 * Оба списка — на сервере (back/services/ai_tools.py): он там один, модель без
 * него не работает вовсе. Скрипт ходит в питоновский файл регулярками по
 * литералу Intent и по декораторам @tool — парсер ради этого не заводим.
 *
 * Запуск:  node scripts/check-ai-intents.mjs   (npm run check:ai)
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const SRC = path.join(import.meta.dirname, '..', 'src');
const TOOLS_PY = path.join(import.meta.dirname, '..', '..', 'back', 'services', 'ai_tools.py');

const py = readFileSync(TOOLS_PY, 'utf8');

/* ─── Что объявил сервер ────────────────────────────────────────────────── */

const intentBlock = py.match(/Intent = Literal\[([\s\S]*?)\]/);
if (!intentBlock) {
  console.error('back/services/ai_tools.py: не нашли литерал Intent — регулярка отстала от кода');
  process.exit(1);
}
const intents = [...intentBlock[1].matchAll(/"([\w.]+)"/g)].map((m) => m[1]);

// Инструменты: имя функции, перед которой стоит декоратор @tool. Регулярка
// смотрит именно на связку «@tool … async def», иначе в список попали бы все
// хелперы модуля.
//
// Окно 900, а не 400: длинный effect у fill_schedule выпихивал инструмент за
// границу, и проверка сообщала «такого инструмента в реестре нет» — про тот,
// что лежит в реестре двадцатой строкой. Ограничение здесь только для того,
// чтобы @tool не склеился со следующим async def, и 900 эту роль держит.
const tools = [...py.matchAll(/@tool\([\s\S]{0,900}?\)\s*\nasync def (\w+)\(/g)].map((m) => m[1]);
if (tools.length < 10) {
  console.error('back/services/ai_tools.py: нашли меньше десятка инструментов — регулярка отстала от кода');
  process.exit(1);
}

/* ─── Что знает фронт ───────────────────────────────────────────────────── */

function walk(dir, ext) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return walk(full, ext);
    return ext.some((x) => e.name.endsWith(x)) ? [full] : [];
  });
}

const front = walk(SRC, ['.tsx', '.ts']).map((f) => ({ file: f, code: readFileSync(f, 'utf8') }));
const subscribed = new Map();            // интент → файл
for (const { file, code } of front) {
  for (const [, name] of code.matchAll(/useAiIntent\(\s*'([\w.]+)'/g)) {
    subscribed.set(name, path.relative(SRC, file));
  }
}

/* ─── Сверка ────────────────────────────────────────────────────────────── */

const fail = [];

for (const intent of intents) {
  if (!subscribed.has(intent)) {
    fail.push(`интент ${intent} объявлен сервером, но ни одна страница на него не подписана — ассистент скажет «открываю», и ничего не произойдёт`);
  }
}
for (const [intent, file] of subscribed) {
  if (!intents.includes(intent)) {
    fail.push(`${file}: подписка на интент ${intent}, которого нет в литерале Intent — мёртвый код`);
  }
}

/* ─── Статусы инструментов в обеих локалях ──────────────────────────────── */

const LANGS = ['ru', 'en'];
const status = {};
for (const lang of LANGS) {
  const ai = JSON.parse(readFileSync(path.join(SRC, 'locales', lang, 'ai.json'), 'utf8'));
  status[lang] = ai.toolStatus ?? {};
  if (!status[lang].default) fail.push(`${lang}/ai.json: нет toolStatus.default — фолбэку не на что опереться`);
}
for (const tool of tools) {
  for (const lang of LANGS) {
    if (!status[lang][tool]) {
      fail.push(`${lang}/ai.json: нет toolStatus.${tool} — под строкой ввода будет безликое «Работаю…»`);
    }
  }
}
// Обратная сверка: статус инструмента, которого больше нет, — мусор в локали
// (так в ней и жили how_to и navigate после их удаления).
for (const lang of LANGS) {
  for (const key of Object.keys(status[lang])) {
    if (key !== 'default' && !tools.includes(key)) {
      fail.push(`${lang}/ai.json: toolStatus.${key} — такого инструмента в реестре нет`);
    }
  }
}

if (fail.length) {
  console.error(`Ассистент разошёлся с сервером (${fail.length}):\n` +
    fail.map((f) => `  - ${f}`).join('\n'));
  process.exit(1);
}

console.log(`OK: ${intents.length} интентов подписаны, у ${tools.length} инструментов есть статусы в ru и en`);
