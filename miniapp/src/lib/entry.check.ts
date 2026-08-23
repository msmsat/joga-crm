/** Самопроверка разбора точки входа: `node src/lib/entry.check.ts`.
 *
 * Защищает ровно ту регрессию, из-за которой выход из аккаунта на голом адресе
 * упирался в экран «нужна ссылка студии»: студия жила только в токене, и
 * уходила вместе с ним. Порядок источников тут важнее всего — ссылка обязана
 * быть сильнее памяти, иначе старая студия перебивала бы ссылку на новую.
 */
const store = new Map<string, string>();

// Заглушки браузера ставим ДО импорта: entry.ts читает window при вызове, но
// localStorage у него на верхнем уровне модуля не трогается — порядок всё равно
// держим явным, чтобы проверка не зависела от того, как модуль устроен внутри.
(globalThis as Record<string, unknown>).localStorage = {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => void store.set(key, value),
};

let url = { pathname: '/', search: '' };
(globalThis as Record<string, unknown>).window = {
  get location() {
    return url;
  },
};

const { readEntry, rememberStudio } = await import('./entry.ts');

const at = (pathname: string, search = '') => {
  url = { pathname, search };
};

let failed = 0;
const check = (name: string, actual: unknown, expected: unknown) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) {
    failed += 1;
    console.error(`FAIL  ${name}\n  ожидалось: ${JSON.stringify(expected)}\n  получено:  ${JSON.stringify(actual)}`);
  } else {
    console.log(`ok    ${name}`);
  }
};

// Ничего не знаем: ни ссылки, ни памяти — единственный честный тупик.
at('/');
check('голый адрес без памяти — студии нет', readEntry(undefined, false).studioId, null);

// Приложение открыло студию и запомнило её (App.loadCatalog).
rememberStudio(42);
check('голый адрес после визита — студия из памяти', readEntry(undefined, false).studioId, 42);

// Тот самый сценарий: человек вышел из всех аккаунтов, страница перезагрузилась.
check('выход из аккаунта не теряет студию', readEntry(undefined, false).studioId, 42);

// Ссылка сильнее памяти — иначе по ссылке на новую студию открывалась бы старая.
at('/s/7');
check('ссылка перебивает память', readEntry(undefined, false).studioId, 7);
check('start_param перебивает и ссылку, и память', readEntry('s99', true).studioId, 99);

// Реферальный код читается независимо от того, откуда взялась студия.
at('/s/7', '?ref=ABC123');
check('ref из query', readEntry(undefined, false).referralCode, 'ABC123');
check('ref из start_param', readEntry('s99_refXYZ', true).referralCode, 'XYZ');

// Мусор в памяти лечится ссылкой, а не белым экраном.
store.set('velora.studio', 'не число');
at('/');
check('битая память — как будто её нет', readEntry(undefined, false).studioId, null);

// Падаем throw'ом, а не process.exit: в tsconfig приложения только
// браузерные типы, и `process` для tsc не существует (см. booking.check.ts).
if (failed > 0) throw new Error(`${failed} FAILED`);
console.log('ALL PASS — студия переживает выход из аккаунта, ссылка сильнее памяти');
