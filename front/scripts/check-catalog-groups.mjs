// Run with node scripts/check-catalog-groups.mjs (Node 24).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { groupBranches } from '../src/pages/dashboard/Catalog/groupBranches.ts';
import {
  NO_CATEGORY, categoryOptions, groupServicesByCategory, serviceCategories,
} from '../src/pages/dashboard/Catalog/serviceCategories.ts';

const branch = (id, country = null, city = null) => ({
  id, name: `Studio ${id}`, address: null, country, city, hall_count: 0,
});

test('the first branch from onboarding is visible without country or city', () => {
  const first = branch(1);
  assert.deepEqual(groupBranches([first]), [{ label: '', items: [first] }]);
});

test('city grouping keeps branches without a city', () => {
  const ny = branch(1, 'USA', 'New York');
  const unspecified = branch(2);
  const la = branch(3, 'USA', 'Los Angeles');
  assert.deepEqual(groupBranches([ny, unspecified, la]), [
    { label: 'New York', items: [ny] },
    { label: '', items: [unspecified] },
    { label: 'Los Angeles', items: [la] },
  ]);
});

test('country grouping keeps branches without a country', () => {
  const usa = branch(1, 'USA', 'New York');
  const germany = branch(2, 'Germany', 'Berlin');
  const unspecified = branch(3);
  assert.deepEqual(groupBranches([usa, germany, unspecified]), [
    { label: 'USA', items: [usa] },
    { label: 'Germany', items: [germany] },
    { label: '', items: [unspecified] },
  ]);
});

test('an empty catalog stays empty', () => {
  assert.deepEqual(groupBranches([]), []);
});

/* ─── Категории услуг: свободные строки студии, а не список отраслей ─────── */

const svc = (id, category) => ({ id, name: `Service ${id}`, category });
// Подписи ru-локали: сортировка идёт по тому, что человек видит, а не по ключу.
const ruLabel = c => ({ other: 'Без категории', yoga: 'Йога', pilates: 'Пилатес' }[c] ?? c);

test('categories come from the services themselves, sorted by label', () => {
  const services = [svc(1, 'Стрижка'), svc(2, 'yoga'), svc(3, 'Стрижка'), svc(4, 'pilates')];
  assert.deepEqual(serviceCategories(services, ruLabel), ['yoga', 'pilates', 'Стрижка']);
});

test('the sentinel of an uncategorized service is not a category', () => {
  assert.deepEqual(serviceCategories([svc(1, NO_CATEGORY), svc(2, '')], ruLabel), []);
});

test('the select always offers "no category" first', () => {
  assert.deepEqual(categoryOptions(['Стрижка'], 'Стрижка', ruLabel), [NO_CATEGORY, 'Стрижка']);
  assert.deepEqual(categoryOptions([], NO_CATEGORY, ruLabel), [NO_CATEGORY]);
});

test('the category of the edited service stays in the list even if no one else uses it', () => {
  // Услуга из ассистента или импорта: её категории нет ни у одной другой, и
  // раньше поле открывалось пустым — сохранение молча возвращало её же.
  assert.deepEqual(
    categoryOptions(['Стрижка'], 'Педикюр', ruLabel),
    [NO_CATEGORY, 'Педикюр', 'Стрижка'],
  );
});

test('uncategorized services are the last group, not a missing one', () => {
  const haircut = svc(1, 'Стрижка');
  const yoga = svc(2, 'yoga');
  const nothing = svc(3, NO_CATEGORY);
  assert.deepEqual(groupServicesByCategory([nothing, haircut, yoga], ruLabel), [
    { label: 'yoga', items: [yoga] },
    { label: 'Стрижка', items: [haircut] },
    { label: NO_CATEGORY, items: [nothing] },
  ]);
});

test('an empty service list has no groups at all', () => {
  assert.deepEqual(groupServicesByCategory([], ruLabel), []);
});
