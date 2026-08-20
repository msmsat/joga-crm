import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import type { Resource, ResourceLanguage } from 'i18next';

// Словари подхватываются по структуре папок: locales/<язык>/<неймспейс>.json.
// Раньше здесь лежало по строке import на каждый файл — при 22 языках и 18
// неймспейсах это 396 строк, которые обязан дописать каждый, кто добавляет
// язык. Теперь новый язык = новая папка, править этот файл не нужно.
// eager: true — словари попадают в бандл (как при обычном import), а не
// подгружаются по сети: язык переключается мгновенно, без состояния загрузки.
const files = import.meta.glob<ResourceLanguage[string]>('./locales/*/*.json', { eager: true, import: 'default' });

const resources: Resource = {};
for (const [file, dict] of Object.entries(files)) {
  const match = file.match(/^\.\/locales\/([^/]+)\/(.+)\.json$/);
  if (!match) continue;
  const [, lang, ns] = match;
  (resources[lang] ??= {})[ns] = dict;
}

// Postgres EXTRACT(dow): 0=воскресенье..6=суббота — используется в insights
// бэка (R1, lesson_overfull.weekday). common.days ключи начинаются с mon.
const DOW_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

// Postgres EXTRACT(isodow): 1=понедельник..7=воскресенье — R5 (utilization.py,
// heatmap/chronic_low/slot_overfull) использует isodow, не dow, поэтому нужен
// отдельный форматтер вместо переиндексации 'weekday'.
const ISODOW_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

i18n
  .use(initReactI18next) // Передаем i18n внутрь React
  .init({
    resources,
    lng: 'en', // Язык по умолчанию
    fallbackLng: 'en', // Если слова нет в языке студии, покажет английское
    // 'en-US'/'pt-BR' (могли прийти из старой записи в БД) должны находить
    // 'en' и 'pt', а не проваливаться в fallback целиком. supportedLngs не
    // задаём намеренно: i18next и так отдаёт только то, что есть в resources,
    // а список пришлось бы держать синхронным с папками вручную.
    load: 'languageOnly',
    defaultNS: 'common',
    interpolation: {
      escapeValue: false, // React сам защищает от XSS, отключаем встроенную защиту
    },
  });

// interpolation.format в init() перезаписывается встроенным Formatter-сервисом
// (i18next v22+) — регистрировать кастомный формат нужно через formatter.add
// ПОСЛЕ init, иначе {{weekday, weekday}} тихо выводит сырое число.
i18n.services.formatter?.add('weekday', value => i18n.t(`common:days.${DOW_KEYS[Number(value)] ?? 'mon'}`));
i18n.services.formatter?.add('isodowWeekday', value => i18n.t(`common:days.${ISODOW_KEYS[Number(value) % 7] ?? 'mon'}`));

export default i18n;
