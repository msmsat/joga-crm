/**
 * Страж реакции на 401: неудачный вход обязан показывать ошибку, а не
 * перезагружать страницу входа.
 *
 * Зачем скрипт: глобальный перехват 401 в api/client.ts уводил на /login любой
 * ответ 401 — включая ответ самого /auth/login на неверный пароль. Страница
 * перезагружалась, сообщение об ошибке не успевало отрисоваться, и «неверный
 * пароль» выглядел как «кнопка ничего не делает». Проверяем и правило, и то,
 * что клиент им действительно пользуется.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { reactTo401 } from '../src/lib/authFailure.ts';

// ── Само правило ────────────────────────────────────────────────────────────
// Токена не посылали (`auth: false`) — 401 пришёл про данные в теле запроса,
// а не про нашу сессию: гасить её не за что.
assert.equal(reactTo401({ auth: false }), 'report');
// Вызывающий проверяет ЧУЖОЙ токен (переключатель аккаунтов) и разберёт 401 сам.
assert.equal(reactTo401({ allowUnauthorized: true }), 'report');
assert.equal(reactTo401({ auth: false, allowUnauthorized: true }), 'report');
// Запрос со своим токеном — единственный случай, когда сессия правда мертва.
assert.equal(reactTo401({}), 'end-session');
assert.equal(reactTo401({ auth: true }), 'end-session');
assert.equal(reactTo401(), 'end-session');

// ── Клиент пользуется правилом, а не своим условием ─────────────────────────
const client = await readFile(new URL('../src/api/client.ts', import.meta.url), 'utf8');
assert.match(client, /import\s*\{[^}]*\breactTo401\b[^}]*\}\s*from\s*'\.\.\/lib\/authFailure'/,
  'client.ts должен брать решение по 401 из lib/authFailure, а не решать на месте');

const block = /if \(res\.status === 401\) \{([\s\S]*?)\n  \}/.exec(client);
assert.ok(block, 'в client.ts не нашлась ветка обработки 401');
const branch = block[1];
assert.match(branch, /reactTo401\(options\)/, 'ветка 401 должна спрашивать reactTo401(options)');
// Ключевое — не формулировка условия, а недостижимость: и выброс токена, и
// редирект стоят ПОСЛЕ вопроса правилу, а между ними есть выход (throw), по
// которому уходит реакция 'report'. Как именно записано сравнение — не дело
// этого теста.
const asked = branch.indexOf('reactTo401(options)');
const effects = ['clearActiveToken()', "window.location.href = '/login'"].map(effect => {
  const at = branch.indexOf(effect);
  assert.ok(at !== -1, `в ветке 401 пропал ${effect}`);
  assert.ok(at > asked, `${effect} выполняется до того, как спросили reactTo401`);
  return at;
});
const exit = branch.indexOf('throw', asked);
assert.ok(exit !== -1 && exit < Math.min(...effects),
  "между reactTo401 и гашением сессии нет выхода: реакция 'report' всё равно дойдёт до редиректа");

// ── Публичные ручки помечены auth: false ────────────────────────────────────
// Именно эта пометка включает для них правило выше. Забыли её на новой
// публичной ручке — её 401 снова перезагрузит страницу вместо ошибки.
const s = await readFile(new URL('../src/api/auth/auth.api.ts', import.meta.url), 'utf8');
const PUBLIC = [
  '/auth/login', '/auth/login/2fa', '/auth/register', '/auth/verify-email',
  '/auth/google', '/auth/forgot-password', '/auth/reset-password',
  '/auth/invite', '/auth/invite/accept', '/auth/invite/decline',
];
for (const path of PUBLIC) {
  // Путь в коде закрыт кавычкой ('/auth/login') либо продолжен параметром
  // ('/auth/invite?token=...'): так /auth/login не считается за /auth/login/2fa.
  let found = 0;
  for (let at = s.indexOf(path); at !== -1; at = s.indexOf(path, at + 1)) {
    const after = s[at + path.length];
    if (after !== "'" && after !== '`' && after !== '?') continue;
    found += 1;
    const call = s.slice(at, s.indexOf('),', at) + 1);
    assert.ok(call.includes('auth: false'), `${path} должен вызываться с auth: false, иначе его 401 снова перезагрузит страницу: ${call}`);
  }
  assert.ok(found > 0, `в auth.api.ts не нашёлся вызов ${path}`);
}

console.log('401 reaction and public auth endpoints: all checks passed.');
