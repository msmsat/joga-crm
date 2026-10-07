// Иконки «времени студии»: у готового названия — своя (уборка — баллончик,
// планёрка — люди), у своего — общая «время в календаре». Одна таблица на
// кнопку в окнах создания, чипы названий, поле названия и блок в сетке:
// человек узнаёт «Уборку» в журнале по тому же значку, что выбирал в окне.
import { CalendarClock, ClipboardCheck, SprayCan, Users, Wind, Wrench, type LucideIcon } from 'lucide-react';
import { LABEL_PRESETS, cleanLabel, type LabelPreset } from './studioTimeModel';

export const STUDIO_TIME_ICON: LucideIcon = CalendarClock;

export const PRESET_ICONS: Record<LabelPreset, LucideIcon> = {
  cleaning: SprayCan,
  prep: ClipboardCheck,
  meeting: Users,
  airing: Wind,
  maintenance: Wrench,
};

/** Какое готовое название у блока — по его подписи; null — своё. `preset`
 *  переводит ключ на язык интерфейса: «Уборку», поставленную по-русски,
 *  чешский интерфейс узнает только как своё название — и покажет общий значок.
 *  Ключ, а не сам значок: компонент из вызова функции в рендере линтер
 *  (react-hooks/static-components) справедливо считает созданным заново. */
export function studioTimePreset(label: string, preset: (key: LabelPreset) => string): LabelPreset | null {
  const name = cleanLabel(label).toLocaleLowerCase();
  return (name && LABEL_PRESETS.find(item => preset(item).toLocaleLowerCase() === name)) || null;
}
