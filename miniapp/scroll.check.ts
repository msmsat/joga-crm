/**
 * Проверка рамы мини-приложения: панель браузера, клавиатура, масштабирование.
 *
 *   cd miniapp && node scroll.check.ts
 *
 * Документ на телефоне не прокручивается; прокрутка живёт внутри .app-scroll.
 * Рама следует за доступным окном в обе стороны, чтобы после сворачивания
 * панели Instagram под меню не оставалась пустая полоса. Клавиатура и
 * пинч-зум не должны схлопывать основную раскладку. Меню и лист остаются
 * привязанными к раме, а не к прокручиваемому содержимому.
 *
 * Проверка вне src не попадает в сборку и не требует браузерных зависимостей.
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

// ─── 2. Рама стоит на измеренной высоте, а не на единицах окна ────────────────

for (const rule of ['.app-shell', '.app-sheet']) {
  const block = phone.slice(phone.indexOf(rule));
  assert.match(
    block.slice(0, block.indexOf('}')),
    /height:\s*var\(--app-h,\s*100dvh\)/,
    `${rule} обязан брать общую измеренную --app-h, чтобы не расходиться с доступным окном`,
  );
}

assert.doesNotMatch(
  phone,
  /\.app-scroll\s*\{[^}]*height:\s*100[ds]vh/,
  'рост области прокрутки — процент от рамы: второй раз спрашивать браузер про низ экрана незачем',
);

// Запирание разведено по ширине: на телефоне — область прокрутки, на десктопе —
// документ. `.app-scroll` вне телефонного блока запирать нельзя: там она не
// область прокрутки, и `overflow: hidden` сделал бы её таковой — sticky
// бокового меню прилип бы к ней и уехал за край окна (см. index.css).
// `phone` обрезан на первом `.is-locked`, поэтому хвост блока смотрим отдельно.
const lockTail = css.slice(css.indexOf('.is-locked', start));
assert.match(
  lockTail,
  /^\.is-locked \.app-scroll\s*\{[^}]*overflow:\s*hidden/,
  'открытый лист на телефоне запирает область прокрутки',
);
// Всё после закрытия телефонного блока — правила для любой ширины.
const anyWidth = lockTail.slice(lockTail.indexOf('\n}'));
assert.match(
  anyWidth,
  /\n\.is-locked\s*\{[^}]*overflow:\s*hidden/,
  'открытый лист запирает документ',
);
assert.doesNotMatch(
  anyWidth,
  /\.is-locked\s+\.app-scroll\s*\{/,
  'вне телефонного блока .app-scroll не запирается — иначе липкое меню десктопа уезжает за край',
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

// Низ капсулы — от общей нижней зоны, а не от голого env(): в вебвью Telegram
// тот ноль, и капсула ложилась на полоску жестов iPhone.
assert.match(nav, /pb-\[var\(--nav-offset\)\]/, 'подъём капсулы — --nav-offset из index.css');
assert.match(
  css,
  /--safe-bottom:[^;]*env\(safe-area-inset-bottom[^;]*--tg-safe-area-inset-bottom[^;]*--tg-content-safe-area-inset-bottom/,
  '--safe-bottom обязан учитывать и env(), и зоны, которые сообщает Telegram',
);
assert.match(app, /pb-\[var\(--nav-clearance\)\]/, 'экран заканчивается отступом под капсулу, посчитанным от её подъёма');

const sheet = read('./src/components/ui/Sheet.tsx');
// Кавычка или шаблонная строка — без разницы: у широкого листа отступы свои.
assert.match(sheet, /className=(?:"|\{`)app-sheet fixed inset-0/, 'подложка листа берёт высоту рамы');
assert.doesNotMatch(sheet, /env\(safe-area-inset-bottom/, 'низ листа — через --safe-bottom: голый env() в Telegram ноль');
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

// ─── 4. Доступная высота окна и клавиатура ──────────────────────────────────────

let width = 390;
let height = 800;
let visibleHeight = 800;
let scale = 1;
let editableFocused = false;
let cssVar = '';
let onResize = () => {};
let onVisibleResize = () => {};

Object.assign(globalThis, {
  window: {
    get innerWidth() {
      return width;
    },
    get innerHeight() {
      return height;
    },
    visualViewport: {
      get height() { return visibleHeight; },
      get scale() { return scale; },
      addEventListener: (event: string, handler: () => void) => {
        if (event === 'resize') onVisibleResize = handler;
      },
    },
    addEventListener: (event: string, handler: () => void) => {
      if (event === 'resize') onResize = handler;
    },
  },
  document: {
    get activeElement() {
      return editableFocused ? { matches: () => true } : null;
    },
    documentElement: {
      style: { setProperty: (name: string, value: string) => {
        if (name === '--app-h') cssVar = value;
      } },
    },
  },
});

await import('./src/lib/appHeight.ts');

assert.equal(cssVar, '800px', 'первый замер уходит в --app-h до первого кадра');

height = visibleHeight = 856;
onResize();
assert.equal(cssVar, '856px', 'рост окна убирает пустую полосу под меню Instagram');

height = visibleHeight = 800;
onResize();
assert.equal(cssVar, '800px', 'возврат панели уменьшает раму до доступного окна');

// Некоторые iOS-вебвью меняют только VisualViewport, сохраняя innerHeight.
visibleHeight = 764;
onVisibleResize();
assert.equal(cssVar, '764px', 'рама учитывает видимую высоту, когда innerHeight не меняется');

visibleHeight = 800;
onVisibleResize();
assert.equal(cssVar, '800px', 'рост VisualViewport тоже возвращает меню к низу окна');

visibleHeight = 856;
onVisibleResize();
assert.equal(cssVar, '856px', 'рост видимой области не ограничен устаревшим innerHeight');

visibleHeight = 800;
onVisibleResize();

// Клавиатура сначала может поменять только VisualViewport, затем innerHeight.
editableFocused = true;
visibleHeight = 750;
onVisibleResize();
assert.equal(cssVar, '800px', 'первые кадры открытия клавиатуры не уменьшают раму');
visibleHeight = 420;
onVisibleResize();
assert.equal(cssVar, '800px', 'клавиатура в iOS не схлопывает основную раму');

height = 420;
onResize();
assert.equal(cssVar, '800px', 'клавиатура в Android не схлопывает основную раму');

// blur может прийти до анимации скрытия клавиатуры.
editableFocused = false;
height = 760;
onResize();
assert.equal(cssVar, '800px', 'ранний blur не принимает ещё открытую клавиатуру за окно');

editableFocused = true;
visibleHeight = 760;
onVisibleResize();
assert.equal(cssVar, '760px', 'закрытие клавиатуры возвращает высоту даже с фокусом в поле');
editableFocused = false;

height = visibleHeight = 500;
onResize();
assert.equal(cssVar, '500px', 'реальное уменьшение окна без ввода не путается с клавиатурой');

width = 844;
height = visibleHeight = 390;
onResize();
assert.equal(cssVar, '390px', 'поворот экрана измеряет доступную высоту заново');

scale = 2;
visibleHeight = 195;
onVisibleResize();
assert.equal(cssVar, '390px', 'пинч-зум не перестраивает рамку и не отключён');

scale = 1;
visibleHeight = 390;
onVisibleResize();
assert.equal(cssVar, '390px', 'возврат масштаба оставляет корректную высоту');

width = 390;
height = visibleHeight = 800;
onResize();
assert.equal(cssVar, '800px', 'поворот обратно восстанавливает портретную высоту');

Object.assign(window, { visualViewport: null });
height = 744;
onResize();
assert.equal(cssVar, '744px', 'старые браузеры без VisualViewport измеряют innerHeight');

editableFocused = true;
height = 420;
onResize();
assert.equal(cssVar, '744px', 'клавиатура не схлопывает раму и без VisualViewport');

editableFocused = false;
height = 744;
onResize();
assert.equal(cssVar, '744px', 'закрытие клавиатуры работает без VisualViewport');

console.log('OK: рама следует за доступным окном и остаётся стабильной при клавиатуре');
