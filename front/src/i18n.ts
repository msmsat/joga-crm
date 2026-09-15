import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import type { Resource, ResourceLanguage } from 'i18next';
import { DEFAULT_LANG, initialLang } from './utils/lang';

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
    // Первый кадр — на языке прошлого визита: выбор человека или его аккаунта,
    // иначе язык страны, иначе английский (utils/lang.ts). Сверка с сервером
    // идёт следом и не задерживает отрисовку (lib/detectLanguage.ts).
    lng: initialLang(),
    fallbackLng: DEFAULT_LANG, // Если слова нет в языке студии, покажет английское
    // 'en-US'/'pt-BR' (могли прийти из старой записи в БД) должны находить
    // 'en' и 'pt', а не проваливаться в fallback целиком. supportedLngs не
    // задаём намеренно: i18next и так отдаёт только то, что есть в resources,
    // а список пришлось бы держать синхронным с папками вручную.
    load: 'languageOnly',
    defaultNS: 'common',
    interpolation: {
      escapeValue: false, // React сам защищает от XSS, отключаем встроенную защиту
      // Слово для места (зал / кресло / кабинет) приходит с сервера и
      // подставляется в подписи каталога, журнала, отчётов и настроек —
      // около сорока вызовов t(). Держим его здесь, а не тащим третьим
      // аргументом в каждый: один забытый вызов показал бы «{{space}}»
      // человеку, и заметили бы это не мы.
      defaultVariables: {},
    },
  });

// ─── Слово для места ─────────────────────────────────────────────────────────

/** Пока термины студии не пришли, подставляем нейтральное слово НА ЯЗЫКЕ
 *  интерфейса (`common:space`) — иначе первый кадр каталога был бы англоязычным
 *  или пустым. Значения common:space сгенерированы из серверного словаря
 *  профиля `other`, так что это то же слово, а не второй перевод. */
function neutralSpace() {
  return {
    space: i18n.t('common:space.singular'),
    spacePlural: i18n.t('common:space.plural'),
    spaceAcc: i18n.t('common:space.accusative'),
  };
}

// Мы переиспользуем событие languageChanged как сигнал «перерисовать подписи»
// (react-i18next по умолчанию слушает именно его), поэтому обработчик ниже
// обязан отличать наш сигнал от настоящей смены языка — иначе он затирал бы
// только что поставленное слово нейтральным.
let signalling = false;

function applySpace(forms: Record<string, string>) {
  const target = i18n.options.interpolation!.defaultVariables as Record<string, string>;
  if (Object.entries(forms).every(([key, value]) => target[key] === value)) return;
  Object.assign(target, forms);
  // defaultVariables читаются интерполятором на КАЖДОМ вызове t(), но сами по
  // себе перерисовку не вызывают: подписки react-i18next висят на событиях
  // i18next. Без этого слово поменялось бы только на следующем ререндере
  // страницы по какой-нибудь другой причине.
  signalling = true;
  i18n.emit('languageChanged', i18n.language);
  signalling = false;
}

/** Слово студии из серверного словаря (services/terminology.py). */
export function setSpaceTerms(forms?: { singular: string; plural: string; accusative: string }) {
  if (!forms) return;
  applySpace({ space: forms.singular, spacePlural: forms.plural, spaceAcc: forms.accusative });
}

applySpace(neutralSpace());
i18n.on('languageChanged', () => {
  // Язык сменился по-настоящему: серверное слово придёт заново уже
  // переведённым, а до тех пор показываем нейтральное на НОВОМ языке, а не
  // прежнее на старом.
  if (!signalling) applySpace(neutralSpace());
});

// interpolation.format в init() перезаписывается встроенным Formatter-сервисом
// (i18next v22+) — регистрировать кастомный формат нужно через formatter.add
// ПОСЛЕ init, иначе {{weekday, weekday}} тихо выводит сырое число.
// Слова бизнес-словаря хранятся строчными: они чаще стоят внутри фразы
// («Учитывать кресла в расписании»), а форму с большой буквы из строчной
// получить можно — обратно нет. Там, где слово открывает подпись, пишем
// {{spacePlural, capitalize}}. Немецкий и так капитализирует существительные,
// для него это пустая операция.
i18n.services.formatter?.add('capitalize', value => {
  const text = String(value ?? '');
  return text.charAt(0).toLocaleUpperCase(i18n.language) + text.slice(1);
});
i18n.services.formatter?.add('weekday', value => i18n.t(`common:days.${DOW_KEYS[Number(value)] ?? 'mon'}`));
i18n.services.formatter?.add('isodowWeekday', value => i18n.t(`common:days.${ISODOW_KEYS[Number(value) % 7] ?? 'mon'}`));

// <html lang> должен ехать за языком интерфейса: по нему браузер выбирает
// перенос слов и озвучку в скринридере, а поисковик — язык страницы.
i18n.on('languageChanged', lng => {
  document.documentElement.lang = lng;
});
document.documentElement.lang = i18n.language;

export default i18n;
