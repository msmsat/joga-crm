/**
 * Проверка того, что раскладка на телефоне НЕ зависит от нижней панели браузера.
 *
 *   cd miniapp && node scroll.check.ts
 *
 * Зачем отдельная проверка. Safari и вебвью Instagram прячут и показывают свою
 * нижнюю панель, окно при этом меняет высоту, и всё, что привязано к окну
 * (`position: fixed`, `dvh`, `svh`), ездит вслед за ней на каждом жесте. Ломается
 * это молча: ни сборка, ни линтер не видят разницы между `absolute` и `fixed`,
 * а увидеть последствия можно только на живом телефоне. В App.tsx когда-то стоял
 * комментарий, объяснявший ровно обратное решение, — вернуть его случайно легко.
 *
 * Три опоры, и проверяются все три:
 *   1) документ непрокручиваем — Safari нечего сворачивать;
 *   2) высота рамы заморожена (lib/appHeight.ts), а не взята в dvh/svh —
 *      единицы окна во встроенных браузерах ездят вместе с панелью;
 *   3) меню и лист висят на раме, а не на окне.
 *
 * Лежит вне src намеренно (как session.check.ts): tsconfig собирает только src,
 * поэтому файл не попадает ни в сборку, ни в бандл.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

// ─── 1. Документ не прокручивается, прокручивается рама ────────────────────────

const css = read('./src/index.css');
const start = css.indexOf('@media (max-width: 759px)');
assert.ok(start > 0, 'в index.css нет телефонного блока (max-width: 759px)');

// Бесслойное правило: `@layer utilities` Tailwind перебил бы `.app-shell`
// любой утилитой высоты или overflow.
assert.ok(
  css.lastIndexOf('@layer') < start,
  'телефонный блок обязан идти ПОСЛЕ всех @layer — иначе утилиты Tailwind его перебьют',
);

const phone = css.slice(start, css.indexOf('.is-locked', start));
assert.match(
  phone,
  /html,\s*body\s*\{[^}]*overflow:\s*hidden/,
  'документу на телефоне нечего прокручивать — иначе Safari снова начнёт сворачивать свою панель',
);
assert.match(
  phone,
  /\.app-scroll\s*\{[^}]*overflow-y:\s*auto/,
  'прокручивается .app-scroll — область внутри рамы',
);

// ─── 2. Рама стоит на замороженной высоте, а не на единицах окна ───────────────

for (const rule of ['.app-shell', '.app-sheet']) {
  const block = phone.slice(phone.indexOf(rule));
  assert.match(
    block.slice(0, block.indexOf('}')),
    /height:\s*var\(--app-h,\s*100dvh\)/,
    `${rule} обязан брать замороженную --app-h; dvh/svh во встроенных браузерах ездят за панелью`,
  );
}

assert.doesNotMatch(
  phone,
  /\.app-scroll\s*\{[^}]*height:\s*100[ds]vh/,
  'рост области прокрутки — процент от рамы: второй раз спрашивать браузер про низ экрана незачем',
);

assert.match(
  css,
  /\.is-locked,\s*\.is-locked \.app-scroll\s*\{[^}]*overflow:\s*hidden/,
  'открытый лист запирает и документ (десктоп), и область прокрутки (телефон)',
);

// ─── 3. Меню и лист висят на раме, а не на окне ────────────────────────────────

const app = read('./src/App.tsx');
assert.match(app, /className="app-shell relative"/, 'рама — корневой узел App');
assert.match(app, /ref=\{scroller\} className="app-scroll relative"/, 'прокрутка — внутри рамы');
assert.ok(
  app.indexOf('<BottomNav') > app.indexOf('className="app-shell relative"'),
  'меню обязано лежать в раме',
);
assert.match(
  app,
  /scroller\.current\?\.scrollTo\(\{ top: 0 \}\)/,
  'смена раздела обязана поднимать наверх область прокрутки, а не только документ',
);

const nav = read('./src/components/BottomNav.tsx');
assert.match(
  nav,
  /className="pointer-events-none absolute inset-x-0 bottom-0/,
  'меню на absolute: fixed приклеил бы его к окну браузера и оно снова поехало бы за панелью',
);

const sheet = read('./src/components/ui/Sheet.tsx');
assert.match(sheet, /className="app-sheet fixed inset-0/, 'подложка листа берёт высоту рамы');
assert.doesNotMatch(
  sheet,
  /'h-\[92dvh\]|max-h-\[88dvh\]/,
  'рост листа на телефоне — процент от подложки, а не dvh',
);
assert.doesNotMatch(
  sheet,
  /^\s*document\.body\.style\.overflow\s*=/m,
  'лист запирает прокрутку классом is-locked: на телефоне запирать надо область прокрутки, а не body',
);
assert.match(sheet, /classList\.add\('is-locked'\)/, 'лист вешает is-locked при открытии');
assert.match(sheet, /classList\.remove\('is-locked'\)/, 'и снимает его при закрытии');

// ─── 4. Сама заморозка высоты ──────────────────────────────────────────────────

let width = 390;
let height = 800;
let cssVar = '';
let onResize = () => {};

Object.assign(globalThis, {
  window: {
    get innerWidth() {
      return width;
    },
    get innerHeight() {
      return height;
    },
    addEventListener: (event: string, handler: () => void) => {
      if (event === 'resize') onResize = handler;
    },
  },
  document: {
    documentElement: {
      style: { setProperty: (_name: string, value: string) => (cssVar = value) },
    },
  },
});

await import('./src/lib/appHeight.ts');

assert.equal(cssVar, '800px', 'первый замер уходит в --app-h сразу, до первого кадра');

// Панель браузера уехала — окно выросло. Раму НЕ трогаем: внизу просто
// открывается полоса фона, и ничего не двигается. Ради этого всё и затевалось.
height = 856;
onResize();
assert.equal(cssVar, '800px', 'рост окна (панель спряталась) раму не двигает');

// Панель вернулась.
height = 800;
onResize();
assert.equal(cssVar, '800px', 'возврат панели раму тоже не двигает');

// Вебвью открылся с уже спрятанной панелью: первый замер завышен, её появление
// обязано поправить раму один раз — иначе меню осталось бы под панелью.
height = 764;
onResize();
assert.equal(cssVar, '764px', 'появление панели поправляет завышенный первый замер');

// Клавиатура забирает пол-экрана. Принять это за панель нельзя: рама схлопнулась
// бы вдвое и такой осталась до конца сеанса.
height = 420;
onResize();
assert.equal(cssVar, '764px', 'клавиатура — не панель браузера, раму не трогает');

// Поворот экрана: меняется ШИРИНА, прежний замер к новой ориентации отношения
// не имеет — меряем заново, в том числе в бо́льшую сторону.
width = 844;
height = 390;
onResize();
assert.equal(cssVar, '390px', 'поворот экрана меряет окно заново');

width = 390;
height = 800;
onResize();
assert.equal(cssVar, '800px', 'поворот обратно тоже меряет заново, а не держит альбомный рост');

console.log('OK: раскладка не зависит от нижней панели браузера');
