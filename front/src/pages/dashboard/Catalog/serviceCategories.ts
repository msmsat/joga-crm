/**
 * Категории услуг — свободные направления САМОЙ студии, а не список отраслей.
 * Чем занимается бизнес, спрашивают один раз при регистрации (тип бизнеса →
 * терминология), поэтому второй раз выбирать «категорию деятельности» из
 * зашитого перечня (Йога / Пилатес / Стретчинг) было незачем: барбершопу он
 * не подходил вовсе. Набор строится по фактическим услугам, новая категория
 * заводится прямо в поле формы услуги.
 *
 * Отдельным модулем, а не внутри компонента, — ради тестов
 * front/scripts/check-catalog-groups.mjs: порядок групп и место «Без
 * категории» иначе проверяются только глазами.
 */

/** Услуга без категории приходит с сервера с category = null, а в UI живёт с
 *  этим значением (см. toUiService): она отдельная группа списка, а не
 *  прочерк. Перевод — catalog:services.categories.other. */
export const NO_CATEGORY = 'other';

export interface Categorized {
  category: string;
}

/** Как показать категорию человеку: свободные строки идут как есть, старые
 *  ключи ('yoga') переводит вызывающая сторона. Порядок групп и списка —
 *  по подписи, а не по значению: иначе «Йога» встала бы после «Пилатеса». */
type Label = (category: string) => string;

const asIs: Label = c => c;

/** Категории, которые студия действительно использует, по алфавиту подписи. */
export function serviceCategories(services: Categorized[], label: Label = asIs): string[] {
  const cats = [...new Set(services.map(s => s.category).filter(c => c && c !== NO_CATEGORY))];
  return cats.sort((a, b) => label(a).localeCompare(label(b)));
}

/** Значения для селекта категории: «Без категории» первым — иначе категорию
 *  уже не снять, — затем категории студии. Текущая категория услуги всегда в
 *  списке, даже если больше ни у одной услуги её нет: иначе поле открывалось
 *  бы пустым, а сохранение молча возвращало ту же категорию. */
export function categoryOptions(categories: string[], current: string, label: Label = asIs): string[] {
  const known = current && current !== NO_CATEGORY && !categories.includes(current)
    ? [...categories, current].sort((a, b) => label(a).localeCompare(label(b)))
    : categories;
  return [NO_CATEGORY, ...known];
}

/** Группы левой панели: по категориям, «Без категории» — последней. */
export function groupServicesByCategory<T extends Categorized>(services: T[], label: Label = asIs) {
  const groups = serviceCategories(services, label)
    .map(cat => ({ label: cat, items: services.filter(s => s.category === cat) }));
  const rest = services.filter(s => !s.category || s.category === NO_CATEGORY);
  return rest.length ? [...groups, { label: NO_CATEGORY, items: rest }] : groups;
}
