/**
 * Проверка ключа клиента — того, что делает знакомство одноразовым.
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

const { getSession, saveSession, clearSession, newDeviceId } = await import('./src/lib/session.ts');

assert.equal(getSession(), null, 'без ключа сессии нет — App показывает знакомство');

saveSession({ tg_id: 42, name: 'Валерія', phone: '+380671234567' });
assert.equal(getSession()?.tg_id, 42, 'ключ переживает перезапуск приложения');
assert.equal(getSession()?.name, 'Валерія', 'имя сохраняется вместе с ключом');

// Главное свойство: запись ровно одна, без студийного суффикса — поэтому выбор
// другой студии не может привести к повторному знакомству.
assert.equal(store.size, 1, 'ключ один на все студии');

store.set('velora.session', '{битый JSON');
assert.equal(getSession(), null, 'битый ключ читается как «нет сессии», а не падает');

// Выданный устройству id обязан лежать вне диапазона настоящих Telegram id,
// иначе клиент с сайта может попасть в чужой профиль.
const ids = new Set<number>();
for (let i = 0; i < 10000; i += 1) {
  const id = newDeviceId();
  assert.ok(id <= -1e11 && id > -9e11, 'id устройства вне диапазона Telegram');
  assert.ok(Number.isSafeInteger(id), 'id не теряет точность в JSON');
  ids.add(id);
}
// Предсказуемый id = чужой профиль: бэкенд пускает по одному tg_id в URL.
assert.equal(ids.size, 10000, 'id не повторяются');

saveSession({ tg_id: 7, name: 'X', phone: null });
clearSession();
assert.equal(getSession(), null, 'очистка ключа возвращает к знакомству');

console.log('session: ok');
