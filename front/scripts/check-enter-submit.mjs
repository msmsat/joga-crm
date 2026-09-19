// Проверка правила Enter (src/lib/submitOnEnter.ts): на нём держится отправка
// всех форм и модалок, а промах виден только руками — поэтому таблица случаев
// прогоняется здесь. Запуск: node scripts/check-enter-submit.mjs
// (Node сам разбирает .ts — зависимостей и сборки не нужно.)
import assert from 'node:assert/strict';
import { submitOnEnter } from '../src/lib/submitOnEnter.ts';

let ran = 0;
let prevented = 0;
const run = () => { ran += 1; };

const fire = (patch = {}, handler = submitOnEnter(run)) => {
  ran = 0;
  prevented = 0;
  handler({
    key: 'Enter',
    defaultPrevented: false,
    shiftKey: false, ctrlKey: false, metaKey: false, altKey: false,
    nativeEvent: {},
    target: { tagName: 'INPUT', isContentEditable: false },
    preventDefault() { prevented += 1; },
    ...patch,
  });
  return { ran, prevented };
};

const cases = [
  ['Enter в поле — жмёт кнопку',        {},                                                     { ran: 1, prevented: 1 }],
  ['другая клавиша — мимо',             { key: 'a' },                                           { ran: 0, prevented: 0 }],
  ['textarea — перевод строки',         { target: { tagName: 'TEXTAREA' } },                    { ran: 0, prevented: 0 }],
  ['кнопка в фокусе — свой клик',       { target: { tagName: 'BUTTON' } },                      { ran: 0, prevented: 0 }],
  ['ссылка в фокусе — свой переход',    { target: { tagName: 'A' } },                           { ran: 0, prevented: 0 }],
  ['contenteditable — перевод строки',  { target: { tagName: 'DIV', isContentEditable: true } }, { ran: 0, prevented: 0 }],
  ['Shift+Enter — мимо',                { shiftKey: true },                                     { ran: 0, prevented: 0 }],
  ['Ctrl+Enter — мимо',                 { ctrlKey: true },                                      { ran: 0, prevented: 0 }],
  ['уже обработан полем — мимо',        { defaultPrevented: true },                             { ran: 0, prevented: 0 }],
  ['набор через IME — мимо',            { nativeEvent: { isComposing: true } },                 { ran: 0, prevented: 0 }],
];

for (const [name, patch, expected] of cases) {
  assert.deepEqual(fire(patch), expected, `случай «${name}»`);
}

// Кнопка недоступна (форма не заполнена) — передаём null: Enter обязан остаться
// без последствий, а не «нажать» несуществующее действие.
assert.deepEqual(fire({}, submitOnEnter(null)), { ran: 0, prevented: 0 }, 'действие выключено');

console.log(`OK: правило Enter, ${cases.length + 1} случаев`);
