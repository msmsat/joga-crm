import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
const root = process.env.BOOKING_FRONT ?? fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(resolve(root, 'package.json'));
const ts = require('typescript');
function load(path) {
  const code = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS,
  } }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', code)(name => load(resolve(dirname(path), `${name}.ts`)), module, module.exports);
  return module.exports;
}
const { buildAvailability, selectAvailability } = load(resolve(root,
  'src/pages/dashboard/Journal/components/modals/booking-wizard/availabilityModel.ts'));
const services = [1, 2].map(id => ({ id, booking_mode: 'resource', masters: [{ user_id: 7 }, { user_id: 8 }] }));
const rows = [
  { service_id: 1, branch_id: 1, free: [600, 601, 602, 605, 615], free_by_teacher: { 7: [600, 601, 602, 605], 8: [615] } },
  { service_id: 2, branch_id: 2, free: [615], free_by_teacher: { 7: [615] } },
];
const matrix = () => buildAvailability({ services, trainers: [{ id: 7 }, { id: 8 }], rows,
  lessons: [], lessonsReady: true, resourceReady: true, notBefore: null });
test('time filters services and masters; service conflict retains alternative times', () => {
  const result = selectAvailability(matrix(), { time: '10:00', serviceId: 2, teacherId: null, step: 1 });
  assert.equal(result.serviceStates.get(1).kind, 'free');
  assert.equal(result.serviceStates.get(2).kind, 'busy');
  assert.equal(result.masterStates.get(7).kind, 'busy');
  assert.deepEqual(result.times, ['10:15']);
  assert.equal(result.conflict, true);
});
test('master filters services and times even before choosing a service', () => {
  const result = selectAvailability(matrix(), { time: '10:00', serviceId: null, teacherId: 8, step: 5 });
  assert.equal(result.serviceStates.get(1).kind, 'busy');
  assert.equal(result.serviceStates.get(2).kind, 'busy');
  assert.deepEqual(result.times, ['10:15']);
});
test('steps 1, 2, 5, 15 use actual minute availability', () => {
  for (const [step, expected] of [[1, ['10:00', '10:01', '10:02', '10:05']], [2, ['10:00', '10:02']], [5, ['10:00', '10:05']], [15, ['10:00']]]) {
    const result = selectAvailability(matrix(), { time: '', serviceId: 1, teacherId: 7, step });
    assert.deepEqual(result.times, expected);
  }
});
test('changing time resolves conflict and chooses the correct branch', () => {
  const result = selectAvailability(matrix(), { time: '10:15', serviceId: 2, teacherId: 7, step: 5 });
  assert.equal(result.conflict, false);
  assert.equal(result.branchFor(2, 7, '10:15'), 2);
});
test('pending availability does not claim free or conflicting', () => {
  const pending = buildAvailability({ services, trainers: [], rows: [], lessons: [], lessonsReady: true,
    resourceReady: false, notBefore: null });
  const result = selectAvailability(pending, { time: '10:00', serviceId: 1, teacherId: 7, step: 5 });
  assert.equal(result.serviceStates.get(1).kind, 'unknown');
  assert.equal(result.conflict, false);
  assert.equal(result.loading, true);
});
test('group times respect duration and buffers at one-minute precision', () => {
  const service = { id: 3, booking_mode: 'event', masters: [{ user_id: 7, duration_min: 30 }],
    duration_min: 60, buffer_before_min: 2, buffer_after_min: 5 };
  const group = buildAvailability({ services: [service], trainers: [{ id: 7 }], rows: [], resourceReady: true,
    lessonsReady: true, notBefore: 600, lessons: [{ service_id: 3, teacher_id: 7, start_time: '2026-10-01T10:00:00',
      duration_min: 30, status: 'confirmed', booked_count: 1, total_spots: 1 }] });
  const result = selectAvailability(group, { serviceId: 3, teacherId: 7, time: '10:36', step: 1 });
  assert.equal(result.conflict, true);
  assert.equal(result.times[0], '10:37');
});
