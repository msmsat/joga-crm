/**
 * Сверяет карту интерфейса ассистента (back/services/ai_uimap.md) с реальным
 * фронтендом. Без этой проверки карта устаревает молча: §5 п. 5 CLAUDE.md
 * требует править её вместе с UI, но соблюдение правила ничем не ловилось —
 * так в карте и прожила кнопка «+ Сотрудник», которой в продукте нет вовсе, а
 * ассистент уверенно отправлял к ней владельца.
 *
 * Что проверяется:
 *   1. Маршруты   — у каждого /dashboard/* из App.tsx есть секция в карте,
 *                   а у страниц под OwnerRoute — пометка «(владелец)».
 *   2. Модалки    — каждая живая модалка описана в карте: секция перечисляет
 *                   свои модалки строкой-комментарием «<!-- модалки: … -->».
 *   3. Вкладки    — каждая вкладка из локалей встречается в тексте своей секции.
 *   4. Подписи    — каждая подпись в «ёлочках» внутри карты реально существует
 *                   в исходниках или в ru-локалях. Главная проверка: именно
 *                   она роняется на выдуманной кнопке.
 *   5. Ключи      — каждый ключ локали в скобках (staff:toolbar.teamTitle) есть
 *                   в ru- и en-локалях.
 *   6. Телефон    — у страницы с медиазапросом max-width: 767px в секции есть
 *                   строка «На телефоне».
 *
 * Побочный продукт того же прохода — артефакт back/services/ai_uilabels.json
 * (ключ → {ru, en}) для перевода подписей ассистентом: локали читаются здесь и
 * так, а отдельный генератор разъехался бы с этой проверкой.
 *
 * ponytail: сверка по именам файлов и подписям, а не по AST; переходить на
 * парсер, только если пойдут ложные срабатывания.
 *
 * Запуск:  node scripts/check-uimap.mjs   (npm run check:uimap)
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const SRC = path.join(import.meta.dirname, '..', 'src');
const BACK = path.join(import.meta.dirname, '..', '..', 'back', 'services');
const MAP_FILE = path.join(BACK, 'ai_uimap.md');
const LABELS_FILE = path.join(BACK, 'ai_uilabels.json');
const PAGES = path.join(SRC, 'pages', 'dashboard');

// Неймспейс локали → маршрут. Единственный руками заданный список в скрипте:
// имя файла локали и папка страницы не совпадают ни по одному правилу.
const NS_ROUTE = {
  dashboard: '/dashboard', journal: '/dashboard/journal', clients: '/dashboard/clients',
  staff: '/dashboard/staff', catalog: '/dashboard/catalog', booking: '/dashboard/booking',
  finances: '/dashboard/finances', loyalty: '/dashboard/loyalty', reports: '/dashboard/reports',
  notifications: '/dashboard/notifications', ai: '/dashboard/ai', settings: '/dashboard/settings',
  billing: '/dashboard/billing', profile: '/dashboard/profile',
};
// Папка страницы → маршрут (для модалок и медиазапросов).
const DIR_ROUTE = {
  Overview: '/dashboard', Journal: '/dashboard/journal', Clients: '/dashboard/clients',
  Staff: '/dashboard/staff', Catalog: '/dashboard/catalog', Booking: '/dashboard/booking',
  Finances: '/dashboard/finances', Loyalty: '/dashboard/loyalty', Reports: '/dashboard/reports',
  Notifications: '/dashboard/notifications', AI: '/dashboard/ai', Settings: '/dashboard/settings',
  Billing: '/dashboard/billing', Profile: '/dashboard/profile',
};

// Файлы, которые лежат среди модалок, но модалками не являются либо не
// существуют для пользователя. Описывать их в карте нельзя: карта описывает то,
// что видно на экране.
const NOT_A_MODAL = {
  'AI/ChannelPane': 'часть AgentSetupModal, отдельного окна нет',
  'AI/ConnectAreas': 'часть AgentSetupModal',
  'AI/PromptPane': 'часть AgentSetupModal',
  'Catalog/previewKit': 'вспомогательные превью внутри окон каталога',
  'Notifications/ChannelModalLayout': 'каркас окон каналов, сам не открывается',
  'Notifications/channelBrand': 'иконки и цвета каналов',
  'Settings/CodeInput': 'поле ввода кода внутри окон подтверждения',
  'Settings/ResendLink': 'ссылка «отправить ещё раз» внутри окон',
  'Finances/ConfirmModal': 'локальная обёртка подтверждения, своего содержания нет',
  // Мёртвый код: файлы есть, но их никто не импортирует (проверено 15.08.2026).
  'Booking/InstaModal': 'мёртвый файл — не импортируется ниоткуда',
  'Booking/WebModal': 'мёртвый файл — не импортируется ниоткуда',
  'Booking/WaModal': 'мёртвый файл — не импортируется ниоткуда',
  'Catalog/AddServiceModal': 'мёртвый файл — услуги заводятся через EditService',
};

const fail = [];

/* ─── Исходники фронта: корпус для поиска подписей ──────────────────────── */

function walk(dir, ext = ['.tsx', '.ts']) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return walk(full, ext);
    return ext.some((x) => e.name.endsWith(x)) ? [full] : [];
  });
}

const sources = walk(SRC).map((f) => readFileSync(f, 'utf8')).join('\n');

function loadLocale(lang, ns) {
  return JSON.parse(readFileSync(path.join(SRC, 'locales', lang, `${ns}.json`), 'utf8'));
}

function flatten(obj, prefix = '', out = {}) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v, key, out);
    else if (typeof v === 'string') out[key] = v;
  }
  return out;
}

const NAMESPACES = readdirSync(path.join(SRC, 'locales', 'ru')).map((f) => f.replace('.json', ''));
const ru = {};   // ns:key → строка
const en = {};
for (const ns of NAMESPACES) {
  for (const [k, v] of Object.entries(flatten(loadLocale('ru', ns)))) ru[`${ns}:${k}`] = v;
  try {
    for (const [k, v] of Object.entries(flatten(loadLocale('en', ns)))) en[`${ns}:${k}`] = v;
  } catch { /* неймспейса нет в en — поймает проверка ключей */ }
}

const corpus = (sources + '\n' + Object.values(ru).join('\n')).toLowerCase();
// Значения с {{плейсхолдерами}} — шаблоны: «Команда · {{count}} чел.» обязана
// находиться по написанному в карте «Команда · N чел.».
// Подстановка обязана начинаться с буквы или цифры — иначе шаблон
// «{{count}} сотрудник» принимал бы и выдуманную кнопку «+ Сотрудник».
const SUBST = '[\\p{L}\\p{N}][\\p{L}\\p{N} .,:%/-]{0,23}';
const patterns = Object.values(ru)
  .filter((v) => v.includes('{{') && v.replace(/\{\{[^}]+\}\}/g, '').trim().length >= 3)
  .map((v) => new RegExp('^' + v.toLowerCase().split(/\{\{[^}]+\}\}/)
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join(SUBST) + '$', 'u'));

/* ─── Карта: секции ─────────────────────────────────────────────────────── */

const mapText = readFileSync(MAP_FILE, 'utf8');
const sections = {};                     // маршрут → текст секции
{
  let route = null;
  let buf = [];
  for (const line of mapText.split('\n')) {
    if (line.startsWith('## ')) {
      if (route) sections[route] = buf.join('\n');
      const found = line.match(/\/dashboard[\w/-]*/);
      route = found ? found[0] : null;
      buf = [line];
    } else if (route) buf.push(line);
  }
  if (route) sections[route] = buf.join('\n');
}

/* ─── 1. Маршруты ───────────────────────────────────────────────────────── */

const app = readFileSync(path.join(SRC, 'App.tsx'), 'utf8');
const routes = [];                       // { route, owner }
for (const [, sub, rest] of app.matchAll(/<Route path="([\w/-]+)" element=\{([^\n]*)/g)) {
  if (sub.includes('/')) continue;       // вложенные вроде billing/payments-history
  routes.push({ route: `/dashboard/${sub}`, owner: rest.includes('OwnerRoute') });
}
routes.unshift({ route: '/dashboard', owner: false });   // <Route index …>

for (const { route, owner } of routes) {
  const section = sections[route];
  if (!section) {
    fail.push(`карта: нет секции для маршрута ${route} — добавьте «## Название — ${route}»`);
    continue;
  }
  const heading = section.split('\n')[0];
  if (owner && !heading.includes('(владелец)')) {
    fail.push(`карта: ${route} закрыт OwnerRoute, но в заголовке секции нет пометки «(владелец)»`);
  }
  if (!owner && heading.includes('(владелец)')) {
    fail.push(`карта: ${route} открыт всем ролям, а секция помечена «(владелец)»`);
  }
}
for (const route of Object.keys(sections)) {
  if (!routes.some((r) => r.route === route)) {
    fail.push(`карта: секция ${route} описывает маршрут, которого нет в App.tsx`);
  }
}

/* ─── 2. Модалки ────────────────────────────────────────────────────────── */

const declared = {};                     // маршрут → Set имён из комментария карты
for (const [route, text] of Object.entries(sections)) {
  const found = text.match(/<!--\s*модалки:([^>]*)-->/);
  declared[route] = new Set(
    found ? found[1].split(',').map((s) => s.trim().replace(/-->$/, '')).filter(Boolean) : []);
}

let modalCount = 0;
for (const dir of readdirSync(PAGES)) {
  const route = DIR_ROUTE[dir];
  if (!route) continue;
  const files = walk(path.join(PAGES, dir), ['.tsx'])
    .filter((f) => f.includes(`${path.sep}modals${path.sep}`) || /Modal\w*\.tsx$/.test(f));
  for (const file of files) {
    const name = path.basename(file, '.tsx');
    if (NOT_A_MODAL[`${dir}/${name}`]) continue;
    modalCount++;
    if (!declared[route]?.has(name)) {
      fail.push(`карта: модалка ${name} (${dir}) не описана — добавьте её в секцию ${route} и в её строку «<!-- модалки: … -->»`);
    }
  }
}
for (const [route, names] of Object.entries(declared)) {
  for (const name of names) {
    const exists = Object.keys(DIR_ROUTE).some(
      (dir) => DIR_ROUTE[dir] === route && walk(path.join(PAGES, dir), ['.tsx'])
        .some((f) => path.basename(f, '.tsx') === name));
    if (!exists) fail.push(`карта: секция ${route} перечисляет модалку ${name}, а такого файла на странице нет`);
  }
}

/* ─── 3. Вкладки ────────────────────────────────────────────────────────── */

let tabCount = 0;
for (const [ns, route] of Object.entries(NS_ROUTE)) {
  const flat = flatten(loadLocale('ru', ns));
  for (const [key, value] of Object.entries(flat)) {
    // tabs.* — вкладки страниц, nav.* в settings — колонка разделов настроек.
    const isTab = /^tabs\.[\w]+$/.test(key) || (ns === 'settings' && /^nav\.[\w]+$/.test(key));
    if (!isTab || !value) continue;
    tabCount++;
    if (!sections[route]?.includes(value)) {
      fail.push(`карта: вкладка «${value}» (${ns}:${key}) не упомянута в секции ${route}`);
    }
  }
}

/* ─── 4. Подписи в ёлочках ──────────────────────────────────────────────── */

// Подпись в карте переносится по ширине строки: «Расписание на\nсегодня» — это
// одна подпись, а не отсутствующая. Схлопываем пробелы перед сверкой.
const labels = [...mapText.matchAll(/«([^»]{1,60})»/g)].map((m) => m[1].replace(/\s+/g, ' ').trim());
const uniqueLabels = [...new Set(labels)];
for (const label of uniqueLabels) {
  const needle = label.toLowerCase().trim();
  if (!needle) continue;
  if (corpus.includes(needle)) continue;
  if (patterns.some((re) => re.test(needle))) continue;
  fail.push(`карта обещает подпись «${label}» — такой подписи нет ни в исходниках, ни в ru-локалях`);
}

/* ─── 5. Ключи локалей ──────────────────────────────────────────────────── */

const usedKeys = [...new Set([...mapText.matchAll(/\(([a-z]+:[\w.]+)\)/g)].map((m) => m[1]))];
for (const key of usedKeys) {
  if (!(key in ru)) fail.push(`карта ссылается на ключ локали ${key} — в ru-локалях его нет`);
  else if (!(key in en)) fail.push(`ключ ${key} есть в ru, но не в en — ассистент назовёт англоязычной студии русскую подпись`);
}

/* ─── 6. Мобильный вариант ──────────────────────────────────────────────── */

for (const [dir, route] of Object.entries(DIR_ROUTE)) {
  const hasPhoneCss = walk(path.join(PAGES, dir), ['.css'])
    .some((f) => readFileSync(f, 'utf8').includes('max-width: 767px'));
  if (hasPhoneCss && !sections[route]?.includes('На телефоне')) {
    fail.push(`карта: у страницы ${dir} есть телефонный медиазапрос, а в секции ${route} нет строки «На телефоне»`);
  }
}

/* ─── Артефакт переводов подписей ───────────────────────────────────────── */

if (!fail.length) {
  const artifact = {};
  for (const key of usedKeys.sort()) artifact[key] = { ru: ru[key], en: en[key] };
  writeFileSync(LABELS_FILE, JSON.stringify(artifact, null, 2) + '\n', 'utf8');
}

/* ─── Отчёт ─────────────────────────────────────────────────────────────── */

if (fail.length) {
  console.error(`Карта интерфейса разошлась с продуктом (${fail.length}):\n` +
    fail.map((f) => `  - ${f}`).join('\n'));
  process.exit(1);
}

console.log(
  `OK: ${Object.keys(sections).length} разделов, ${modalCount} модалок, ${tabCount} вкладок, ` +
  `${uniqueLabels.length} подписей; переводы подписей — ${usedKeys.length} ключей в ai_uilabels.json`);
