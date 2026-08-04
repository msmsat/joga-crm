/**
 * Проверка живого статуса студии — арифметики, которую глазами не поймаешь.
 *
 *   cd miniapp && node studio-status.check.ts
 *
 * Вне src намеренно: tsconfig собирает только src, поэтому файл не попадает ни
 * в сборку, ни в бандл, а Node 24 стирает типы сам — раннер не нужен.
 */
import assert from 'node:assert/strict';

const { studioState } = await import('./src/lib/studio-status.ts');

/** Час и минута сегодняшнего дня — дата роли не играет. */
const at = (h: number, m = 0) => new Date(2026, 7, 4, h, m);

// ─── Обычная смена 08:00 — 22:00 ─────────────────────────────────────────────
assert.equal(studioState('08:00', '22:00', at(12)), 'open');
assert.equal(studioState('08:00', '22:00', at(21, 1)), 'closing_soon', 'час до закрытия');
assert.equal(studioState('08:00', '22:00', at(21, 59)), 'closing_soon');
assert.equal(studioState('08:00', '22:00', at(22)), 'closed', 'ровно в закрытие уже закрыто');
assert.equal(studioState('08:00', '22:00', at(3)), 'closed', 'глубокая ночь');
assert.equal(studioState('08:00', '22:00', at(7, 1)), 'opening_soon', 'час до открытия');
assert.equal(studioState('08:00', '22:00', at(8)), 'open', 'ровно в открытие уже открыто');

// ─── Ночная смена 22:00 — 06:00: рабочий отрезок разорван полуночью ───────────
assert.equal(studioState('22:00', '06:00', at(23)), 'open');
assert.equal(studioState('22:00', '06:00', at(2)), 'open', 'после полуночи всё ещё смена');
assert.equal(studioState('22:00', '06:00', at(5, 30)), 'closing_soon');
assert.equal(studioState('22:00', '06:00', at(12)), 'closed');
assert.equal(studioState('22:00', '06:00', at(21, 30)), 'opening_soon');

// ─── Граница суток не должна давать отрицательных «осталось» ─────────────────
assert.equal(studioState('00:00', '23:59', at(23, 30)), 'closing_soon');
assert.equal(studioState('10:00', '20:00', at(0, 0)), 'closed', 'полночь при дневной смене');

console.log('studio-status: ok');
