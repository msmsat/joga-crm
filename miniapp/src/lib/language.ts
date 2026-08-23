/**
 * Какой язык показать человеку — решение отдельно от его применения, чтобы его
 * можно было проверить без браузера (`node src/lib/language.check.ts`).
 *
 * Источников три, и порядок между ними — весь смысл этого файла:
 *
 *   1. выбор человека — сильнее всего и навсегда;
 *   2. язык его устройства, если мы такой знаем, — потому что кабинет читает
 *      клиент, а не студия;
 *   3. язык студии из «Онлайн-записи» — ровно для тех, чьё устройство говорит
 *      на языке, которого у нас нет. Это и есть «по умолчанию»: не «вместо
 *      человека», а «когда о человеке ничего не известно».
 *
 * Раньше порядок был другой и сломанный. Приоритет выбора определялся по ключу
 * `i18nextLng`, но его пишет сам LanguageDetector — на init, ещё до всякого
 * выбора (i18next: `setLng` → `cacheUserLanguage`). Ключ существовал всегда,
 * поэтому язык студии не применялся никогда, а человек с устройством на
 * четвёртом языке падал в `fallbackLng` и видел украинский без единого способа
 * это исправить. Отсюда и отдельный ключ выбора: он должен значить «выбрал», а
 * не «приложение запустилось».
 */

/** Ключ явного выбора. Отдельный от `i18nextLng` — см. док выше. */
export const CHOICE_KEY = 'velora.lang';

/** 'cs-CZ' → 'cs'. Устройство отдаёт тег с регионом, набор у нас по языкам. */
const base = (tag: string) => tag.toLowerCase().split('-')[0];

export interface LanguageSources {
  /** Языки, которые у мини-приложения есть (ключи resources в i18n.ts). */
  supported: readonly string[];
  /** Явный выбор человека (`velora.lang`) или null. */
  choice: string | null;
  /** `navigator.languages` — в порядке предпочтения человека. */
  device: readonly string[];
  /** Язык виджета студии; 'cz' — легаси-код чешского из старых настроек. */
  studio: string | null | undefined;
}

/** Код языка, на который надо переключиться, либо null — оставить как есть. */
export function resolveLanguage({ supported, choice, device, studio }: LanguageSources): string | null {
  if (choice && supported.includes(choice)) return choice;

  // Язык устройства i18next уже поставил детектором сам — менять нечего.
  if (device.some((tag) => supported.includes(base(tag)))) return null;

  const code = studio === 'cz' ? 'cs' : studio;
  return code && supported.includes(code) ? code : null;
}
