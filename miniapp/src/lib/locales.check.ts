/**
 * Самопроверка переводов: `node src/lib/locales.check.ts` (без зависимостей).
 *
 * Ловит ровно то, что ломается молча: ключ добавили в один язык и забыли в
 * остальных. i18next в этом случае не падает — он подставляет фолбэк (uk), и
 * немец видит украинскую строку посреди своего экрана. Сверяем плоские наборы
 * ключей всех языков между собой, а список языков — с i18n.ts.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const localesDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'locales');

const flatKeys = (value: unknown, prefix = ''): string[] =>
  value && typeof value === 'object'
    ? Object.entries(value as Record<string, unknown>).flatMap(([k, v]) =>
        flatKeys(v, prefix ? `${prefix}.${k}` : k),
      )
    : [prefix];

const files = readdirSync(localesDir).filter((f) => f.endsWith('.json')).sort();
const keys = new Map(
  files.map((f) => [
    f.replace('.json', ''),
    new Set(flatKeys(JSON.parse(readFileSync(join(localesDir, f), 'utf8')))),
  ]),
);

// Язык, объявленный в i18n.ts, обязан иметь файл — и наоборот. Файл без
// строки в resources никто не загрузит, строка без файла уронит сборку.
const declared = [...readFileSync(join(localesDir, '..', 'i18n.ts'), 'utf8').matchAll(/^\s{2}(\w+): \{ translation:/gm)]
  .map((m) => m[1])
  .sort();
const found = [...keys.keys()];
if (declared.join(',') !== found.join(',')) {
  throw new Error(`i18n.ts объявляет [${declared}], а в locales/ лежат [${found}]`);
}

const [base, ...rest] = found;
for (const lng of rest) {
  const missing = [...keys.get(base)!].filter((k) => !keys.get(lng)!.has(k));
  const extra = [...keys.get(lng)!].filter((k) => !keys.get(base)!.has(k));
  if (missing.length || extra.length) {
    throw new Error(
      `${lng}.json vs ${base}.json — нет: [${missing}], лишние: [${extra}]`,
    );
  }
}

console.log(`locales: ok (${found.length} языков × ${keys.get(base)!.size} ключей)`);
