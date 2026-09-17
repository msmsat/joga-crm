/** Самопроверка сведения сессии со студией: `node src/lib/session.check.ts`.
 *
 * Защищает регрессию, из-за которой ссылка на студию B открывала студию A:
 * карточка клиента принадлежит студии, и активной может быть только карточка
 * той студии, которую приложение показывает.
 *
 * Отдельно проверяется, что перезагрузок не бывает по кругу: `reconcileSession`
 * обязан вернуть false на втором вызове подряд, иначе App.loadCatalog крутил бы
 * страницу вечно.
 */
const store = new Map<string, string>();

(globalThis as Record<string, unknown>).localStorage = {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => void store.set(key, value),
  removeItem: (key: string) => void store.delete(key),
};
// session.ts шлёт событие о смене сессии; в Node слушать некому, но window
// должен существовать хотя бы формально — модуль проверяет его сам.
(globalThis as Record<string, unknown>).window = undefined;

const { accountId, detachSession, getAccounts, getSession, reconcileSession, saveSession, studioOf } =
  await import('./session.ts');

/** Токен без подписи: проверять её тут некому, а payload читается как в бою. */
function token(clientId: number, studioId: number | null): string {
  const payload = { sub: String(clientId), typ: 'client', ...(studioId === null ? {} : { studio_id: studioId }) };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `head.${body}.sig`;
}

const inA = { token: token(1, 10), name: 'Катя' };
const inB = { token: token(2, 20), name: 'Катя' };

const reset = () => store.clear();

// ── Студия читается из токена ───────────────────────────────────────────────
console.assert(studioOf(inA.token) === 10, 'студия берётся из claim studio_id');
console.assert(studioOf('мусор') === null, 'битый токен — «неизвестно», а не догадка');
console.assert(studioOf(token(3, null)) === null, 'нет claim — «неизвестно»');
console.assert(accountId(inA.token) === '1', 'аккаунт различается по sub');

// ── Чужая студия: карточка откладывается, но НЕ забывается ──────────────────
reset();
saveSession(inA);
console.assert(reconcileSession(20) === true, 'карточка студии A в студии B — сессию надо сменить');
console.assert(getSession() === null, 'в чужой студии активной карточки нет');
console.assert(getAccounts().length === 1, 'аккаунт остался на устройстве, это не выход');
console.assert(reconcileSession(20) === false, 'второй заход ничего не меняет — перезагрузка одна');

// ── Возвращение в свою студию поднимает карточку само ───────────────────────
console.assert(reconcileSession(10) === true, 'вернулись в свою студию — карточка возвращается');
console.assert(getSession()?.token === inA.token, 'вернулась именно она');
console.assert(reconcileSession(10) === false, 'и больше ничего не происходит');

// ── Две студии на устройстве: включается карточка показанной ────────────────
reset();
saveSession(inA);
saveSession(inB); // активной стала B, обе в списке
console.assert(reconcileSession(10) === true, 'показана A — активной должна стать карточка A');
console.assert(getSession()?.token === inA.token, 'выбрана карточка нужной студии');
console.assert(getAccounts().length === 2, 'вторая карточка никуда не делась');
console.assert(reconcileSession(10) === false, 'состояние устоялось');

// ── Своя студия: не трогаем ничего ──────────────────────────────────────────
reset();
saveSession(inA);
console.assert(reconcileSession(10) === false, 'карточка уже правильная — менять нечего');

// ── Неизвестная студия токена: гадать нельзя ────────────────────────────────
reset();
saveSession({ token: token(9, null), name: 'Старый токен' });
console.assert(reconcileSession(10) === false, 'токен без студии не выбрасываем');
console.assert(getSession() !== null, 'и не разлогиниваем');

// ── Гость без карточек — не повод ни к чему ─────────────────────────────────
reset();
console.assert(reconcileSession(10) === false, 'гостю нечего сводить');
detachSession(); // не должен падать на пустом хранилище
console.assert(getSession() === null, 'пусто так пусто');

console.log('ALL PASS — активна только карточка показанной студии');
