/** Самопроверка выбора языка: `node src/lib/language.check.ts`.
 *
 * Здесь защищается порядок источников — ровно тот, из-за поломки которого язык
 * студии не применялся никогда, а человеку с непокрытым языком устройства
 * доставался fallback без единого способа это исправить.
 */
import { resolveLanguage } from './language.ts';

const supported = ['uk', 'en', 'cs', 'de', 'ru'];

type Case = [string, Parameters<typeof resolveLanguage>[0], string | null];

const cases: Case[] = [
  [
    'язык устройства мы знаем — детектор уже поставил его, не трогаем',
    { supported, choice: null, device: ['cs-CZ', 'en'], studio: 'uk' },
    null,
  ],
  [
    'языка устройства у нас нет — вот теперь работает язык студии',
    { supported, choice: null, device: ['fr-FR'], studio: 'cs' },
    'cs',
  ],
  [
    'легаси-код чешского из старых настроек студии',
    { supported, choice: null, device: ['fr-FR'], studio: 'cz' },
    'cs',
  ],
  [
    'студия язык не настроила — остаёмся на fallback i18next',
    { supported, choice: null, device: ['fr-FR'], studio: null },
    null,
  ],
  [
    'студия настроила язык, которого у нас нет',
    { supported, choice: null, device: ['fr-FR'], studio: 'pl' },
    null,
  ],
  [
    'выбор человека сильнее и устройства, и студии',
    { supported, choice: 'de', device: ['cs-CZ'], studio: 'uk' },
    'de',
  ],
  [
    'выбор человека переживает непокрытое устройство',
    { supported, choice: 'en', device: ['fr-FR'], studio: 'cs' },
    'en',
  ],
  [
    'мусор в ключе выбора — как будто выбора не было',
    { supported, choice: 'klingon', device: ['fr-FR'], studio: 'cs' },
    'cs',
  ],
  [
    'устройство без региона',
    { supported, choice: null, device: ['de'], studio: 'cs' },
    null,
  ],
  [
    'подходит не первый язык устройства, а второй — он тоже считается',
    { supported, choice: null, device: ['fr-FR', 'uk-UA'], studio: 'cs' },
    null,
  ],
  [
    'устройство не сказало ничего',
    { supported, choice: null, device: [], studio: 'de' },
    'de',
  ],
];

let failed = 0;
for (const [name, sources, expected] of cases) {
  const actual = resolveLanguage(sources);
  if (actual === expected) {
    console.log(`ok    ${name}`);
  } else {
    failed += 1;
    console.error(`FAIL  ${name}\n  ожидалось: ${expected}\n  получено:  ${actual}`);
  }
}

// Падаем throw'ом, а не process.exit: в tsconfig приложения только
// браузерные типы, и `process` для tsc не существует (см. booking.check.ts).
if (failed > 0) throw new Error(`${failed} FAILED`);
console.log(`ALL PASS — ${cases.length} случаев выбора языка`);
