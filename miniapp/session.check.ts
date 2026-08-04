/**
 * Проверка сессии клиента — токена, который делает вход одноразовым.
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

const { getSession, saveSession, clearSession } = await import('./src/lib/session.ts');

assert.equal(getSession(), null, 'без токена сессии нет — App показывает экран входа');

saveSession({ token: 'jwt.token.value', name: 'Валерія' });
assert.equal(getSession()?.token, 'jwt.token.value', 'токен переживает перезапуск приложения');
assert.equal(getSession()?.name, 'Валерія', 'имя сохраняется вместе с токеном');

// Главное свойство: запись ровно одна, без студийного суффикса — поэтому выбор
// другой студии не может привести к повторному входу.
assert.equal(store.size, 1, 'ключ один на все студии');

store.set('velora.session', '{битый JSON');
assert.equal(getSession(), null, 'битый ключ читается как «нет сессии», а не падает');

saveSession({ token: 'other.token', name: 'X' });
clearSession();
assert.equal(getSession(), null, 'очистка сессии возвращает к экрану входа');

console.log('session: ok');
