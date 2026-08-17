/**
 * Каждый ключ, который просит интерфейс, должен быть во ВСЕХ четырёх языках.
 *
 *   cd miniapp && node locales.check.ts
 *
 * Ловит ровно то, на чём тут уже спотыкались: ключ добавили в ru и забыли в
 * cz/uk/en (клиент видит «subscriptionSheet.buy» вместо кнопки), либо строку
 * переименовали в коде и не в словарях. Обратную сторону — мёртвые ключи,
 * которых никто не зовёт, — не проверяем: их достаточно вычищать глазами, а
 * ложное падение на общей строке стоило бы дороже.
 *
 * Лежит вне src намеренно (см. session.check.ts): tsconfig собирает только src.
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const LOCALES = ['ru', 'en', 'uk', 'cz'] as const;

const dicts = Object.fromEntries(
  LOCALES.map((lang) => [
    lang,
    JSON.parse(readFileSync(join('src', 'locales', `${lang}.json`), 'utf8')) as object,
  ]),
);

const sources: string[] = [];
const walk = (dir: string) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path);
    else if (/\.tsx?$/.test(entry.name)) sources.push(path);
  }
};
walk('src');

// t('ключ') и t('ключ', { … }). Шаблонные литералы (`lesson.name.${…}`) сюда не
// попадают намеренно: их вторая половина приходит из данных студии, и словарь
// для них — не список ключей, а fallback через defaultValue.
const CALL = /\bt\(\s*'([a-zA-Z0-9_.]+)'\s*(\)|,[^)\n]*\))/g;

const used = new Map<string, string>();  // ключ → где впервые встретился
for (const path of sources) {
  const text = readFileSync(path, 'utf8');
  for (const [call, key] of text.matchAll(CALL)) {
    // defaultValue — сознательный запасной текст: такой ключ в словаре
    // необязателен (t('home.studios', { defaultValue: 'Студії' })).
    if (call.includes('defaultValue')) continue;
    if (!used.has(key)) used.set(key, path);
  }
}

const lookup = (dict: object, key: string): unknown =>
  key.split('.').reduce<unknown>(
    (node, part) =>
      node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined,
    dict,
  );

assert.ok(used.size > 50, `нашли всего ${used.size} ключей — сломался разбор исходников`);

const missing: string[] = [];
for (const [key, path] of used) {
  for (const lang of LOCALES) {
    if (typeof lookup(dicts[lang], key) !== 'string') missing.push(`${lang}: ${key} (${path})`);
  }
}

assert.deepEqual(missing, [], `нет перевода:\n${missing.join('\n')}`);

console.log(`ALL PASS — ${used.size} ключей есть во всех ${LOCALES.length} языках`);
