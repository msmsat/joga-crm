/**
 * Проверка сессии клиента — токена, который делает вход одноразовым, и списка
 * аккаунтов, между которыми переключается меню.
 *
 *   cd miniapp && node session.check.ts
 *
 * Лежит вне src намеренно: tsconfig собирает только src, поэтому файл не
 * попадает ни в сборку, ни в бандл, а Node 24 стирает типы сам — раннер не нужен.
 */
import assert from 'node:assert/strict';

const store = new Map<string, string>();
Object.assign(globalThis, {
  localStorage: {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value),
    removeItem: (key: string) => store.delete(key),
  },
});

const { getSession, getAccounts, saveSession, clearSession, accountId } =
  await import('./src/lib/session.ts');

/** Токен вида «заголовок.payload.подпись» — читается только payload. */
const jwt = (clientId: number, nonce = '0') =>
  `hdr.${btoa(JSON.stringify({ sub: String(clientId), typ: 'client', nonce }))}.sig`;

assert.equal(getSession(), null, 'без токена сессии нет — App показывает экран входа');
assert.deepEqual(getAccounts(), [], 'список аккаунтов пуст до первого входа');

saveSession({ token: jwt(1), name: 'Валерія' });
assert.equal(getSession()?.token, jwt(1), 'токен переживает перезапуск приложения');
assert.equal(getSession()?.name, 'Валерія', 'имя сохраняется вместе с токеном');

// Главное свойство активной сессии: запись ровно одна, без студийного суффикса —
// поэтому выбор другой студии не может привести к повторному входу.
assert.equal(getAccounts().length, 1, 'один вход — один аккаунт в списке');

// Повторный вход тем же клиентом (новый токен) не двоит строку в меню.
saveSession({ token: jwt(1, 'later'), name: 'Валерія' });
assert.equal(getAccounts().length, 1, 'аккаунт различается по client.id, а не по токену');

// Второй аккаунт устройства: активным становится он, первый остаётся в списке.
saveSession({ token: jwt(2), name: 'Марко' });
assert.equal(getSession()?.name, 'Марко', 'вход вторым аккаунтом делает его активным');
assert.deepEqual(getAccounts().map((a) => a.name), ['Марко', 'Валерія'], 'активный первым');

// Переключение обратно — это тот же saveSession уже сохранённой сессией.
saveSession(getAccounts()[1]);
assert.equal(getSession()?.name, 'Валерія', 'переключение возвращает прежний аккаунт');
assert.equal(getAccounts().length, 2, 'переключение не заводит третью строку');

assert.equal(accountId(jwt(7)), '7', 'id берётся из claim sub');
assert.equal(accountId('мусор'), 'мусор', 'нечитаемый токен не роняет список');

// Выход убирает активный аккаунт и из списка: мёртвый токен предлагать нечего
// (сюда же приходит сброс по 401 из api/client.ts).
clearSession();
assert.equal(getSession(), null, 'очистка сессии возвращает к экрану входа');
assert.deepEqual(getAccounts().map((a) => a.name), ['Марко'], 'вышедший аккаунт уходит из списка');

store.set('velora.session', '{битый JSON');
assert.equal(getSession(), null, 'битый ключ читается как «нет сессии», а не падает');

console.log('session: ok');
