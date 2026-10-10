import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

async function setup(file, extra = {}) {
  let cursor = 0;
  const state = [], messages = [], remembered = [], opened = [];
  const jsx = (type, props) => ({ type, props });
  const context = vm.createContext({ console, Error, window: { location: { assign: url => opened.push(url) } } });
  const deps = {
    react: { useRef: initial => { const i = cursor++; return state[i] ??= { current: initial }; },
      useState: initial => { const i = cursor++; if (!(i in state)) state[i] = initial;
        return [state[i], value => { state[i] = value; }]; } },
    'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'fragment' },
    'react-i18next': { useTranslation: () => ({ t: key => key }) },
    'framer-motion': { motion: { button: 'button' } },
    PaidBadge: { default: 'paid-badge' },
    notify: { notify: message => messages.push(message) },
    revision: { bumpLessons() {} },
    paymentSync: { rememberCheckout: target => remembered.push(target),
      awaitCheckout: target => remembered.push(target), syncCheckouts: async () => ({ payments: [] }) },
    useTelegram: { useTelegram: () => ({ tg: null, isInTelegram: false, vibrateMedium() {} }) },
    ...extra,
  };
  async function load(url) {
    const source = ts.transpileModule(await readFile(url, 'utf8'), {
      compilerOptions: { jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
    }).outputText;
    const module = new vm.SourceTextModule(source, { context, identifier: url.href });
    await module.link((name, parent) => {
      const base = name.split('/').at(-1);
      if (base === 'paymentState') return load(new URL(`${name}.ts`, parent.identifier));
      const exports = deps[name] ?? deps[base];
      if (!exports) throw new Error(`Missing dependency ${name}`);
      return new vm.SyntheticModule(Object.keys(exports), function () {
        for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
      }, { context });
    });
    return module;
  }
  const module = await load(new URL(file, import.meta.url));
  await module.evaluate();
  return { render(name, props) { cursor = 0; return module.namespace[name](props); }, messages, remembered, opened };
}
function nodes(tree, type) {
  if (!tree || typeof tree !== 'object') return [];
  if (Array.isArray(tree)) return tree.flatMap(item => nodes(item, type));
  return [...(tree.type === type ? [tree.props] : []), ...nodes(tree.props?.children, type)];
}
const lesson = { reservation_id: 41, status: 'active', debt: 25, debt_str: '25 Kč', price: 25, allowed_actions: ['pay'] };
const receipt = extra => ({ lesson, isPast: false, payable: true, paying: false, onPay() {}, awaiting: false, checking: false, ...extra });

test('cash debt awaiting Stripe shows a check action without offering another payment', async () => {
  const s = await setup('../src/components/mylessons/lesson/LessonPayment.tsx');
  const tree = s.render('default', receipt({ awaiting: true, onCheck() {} }));
  const buttons = nodes(tree, 'button');
  assert.equal(buttons.length, 1);
  assert.equal(buttons[0].children, 'lessonSheet.pay.already_paid');
});

test('a charged payment requiring review cannot be paid again', async () => {
  const s = await setup('../src/components/mylessons/lesson/LessonPayment.tsx');
  const tree = s.render('default', receipt({ lesson: { ...lesson, payment_review: true } }));
  assert.equal(nodes(tree, 'button').length, 0);
});

test('two immediate taps create one request and navigate to the owned Stripe URL', async () => {
  let requests = 0, finish;
  const s = await setup('../src/hooks/useLessonPay.ts', { lessons: { payBooking: async () => {
    requests++; return new Promise(resolve => { finish = resolve; });
  } } });
  const hook = s.render('useLessonPay');
  const first = hook.pay(41), second = hook.pay(41);
  assert.equal(requests, 1);
  finish({ outcome: 'open', url: 'https://checkout.stripe.com/c/pay/example', checkout_id: 21 });
  await Promise.all([first, second]);
  assert.deepEqual(s.opened, ['https://checkout.stripe.com/c/pay/example']);
  assert.equal(s.remembered[0].checkout_id, 21);
  assert.equal(s.render('useLessonPay').payingId, null);
});

test('a review response names the unresolved payment and never navigates', async () => {
  const s = await setup('../src/hooks/useLessonPay.ts', { lessons: { payBooking: async () => ({ outcome: 'review' }) } });
  await s.render('useLessonPay').pay(41);
  assert.deepEqual(s.opened, []);
  assert.deepEqual(s.messages, ['lessonSheet.pay.review_hint']);
  assert.equal(s.render('useLessonPay').payingId, null);
});
