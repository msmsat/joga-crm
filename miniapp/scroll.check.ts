/**
 * Проверка того, что на телефоне прокручивается ОБОЛОЧКА, а не документ.
 *
 *   cd miniapp && node scroll.check.ts
 *
 * Зачем отдельная проверка. Safari и вебвью Instagram сворачивают свою нижнюю
 * панель по прокрутке главного документа — окно меняет высоту, и прикреплённая
 * к низу капсула меню дёргается вслед за ней на каждом жесте. Ломается это
 * молча: ни сборка, ни линтер не видят разницы между `overflow: hidden` на
 * документе и его отсутствием, а увидеть последствия можно только на живом
 * телефоне. До этой правки в App.tsx стоял комментарий, объяснявший ровно
 * обратное решение, — значит вернуть его случайно легко.
 *
 * Лежит вне src намеренно (как session.check.ts): tsconfig собирает только src,
 * поэтому файл не попадает ни в сборку, ни в бандл.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

const css = read('./src/index.css');
const start = css.indexOf('@media (max-width: 759px)');
assert.ok(start > 0, 'в index.css нет телефонного блока (max-width: 759px)');

// Бесслойное правило: `@layer utilities` Tailwind перебил бы `.app-scroll`
// любой утилитой высоты или overflow.
assert.ok(
  css.lastIndexOf('@layer') < start,
  'телефонный блок обязан идти ПОСЛЕ всех @layer — иначе утилиты Tailwind его перебьют',
);

const phone = css.slice(start, css.indexOf('.is-locked', start));
assert.match(
  phone,
  /html,\s*body\s*\{[^}]*overflow:\s*hidden/,
  'документу на телефоне нечего прокручивать — иначе браузер снова начнёт сворачивать свою панель',
);
assert.match(
  phone,
  /\.app-scroll\s*\{[^}]*overflow-y:\s*auto/,
  'прокручивается .app-scroll — оболочка приложения',
);
assert.match(phone, /\.app-scroll\s*\{[^}]*height:\s*100dvh/, 'оболочка ростом ровно в окно');

assert.match(
  css,
  /\.is-locked,\s*\.is-locked \.app-scroll\s*\{[^}]*overflow:\s*hidden/,
  'открытый лист запирает и документ (десктоп), и оболочку (телефон)',
);

const app = read('./src/App.tsx');
assert.match(app, /className="app-scroll relative"/, 'класс оболочки снят с корневого узла App');
assert.match(
  app,
  /shell\.current\?\.scrollTo\(\{ top: 0 \}\)/,
  'смена раздела обязана поднимать наверх оболочку, а не только документ',
);

const sheet = read('./src/components/ui/Sheet.tsx');
assert.doesNotMatch(
  sheet,
  /^\s*document\.body\.style\.overflow\s*=/m,
  'лист запирает прокрутку классом is-locked: на телефоне запирать надо оболочку, а не body',
);
assert.match(sheet, /classList\.add\('is-locked'\)/, 'лист вешает is-locked при открытии');
assert.match(sheet, /classList\.remove\('is-locked'\)/, 'и снимает его при закрытии');

console.log('OK: документ на телефоне не прокручивается, панель браузера стоит на месте');
