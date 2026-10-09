import type { CSSProperties } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Paperclip, PencilLine, StickyNote } from 'lucide-react';
import type { StaffScheduleBlock } from '../../../../../api/schedule';
import './StudioTimeFace.css';

/** Ступени блока по высоте: от неё зависит, сколько строк влезает.
 *  Две строки (название и факты) — от 30px, то есть от получаса. */
type StudioTimeSize = 'tiny' | 'short' | 'mid' | 'tall';
const studioTimeSize = (height: number): StudioTimeSize =>
  height < 30 ? 'tiny' : height < 46 ? 'short' : height < 100 ? 'mid' : 'tall';

/** Метрики высокого блока — те же числа, что в StudioTimeFace.css: по ним
 *  считается, сколько строк заметки поместится без обрезанной строки.
 *  Медальон — самый крупный (широкая колонка): в узкой запас в пару пикселей. */
const TALL = { pad: 22, chip: 36, name: 14, label: 15, fact: 18, factGap: 4, gap: 7, note: 14 };
const MAX_NOTE_LINES = 8;
const MAX_FACES = 3;

/** Строк названия: высокий блок даёт ему две-три, средний — две от часа. */
const labelLines = (size: StudioTimeSize, height: number) =>
  size === 'tall' ? (height >= 136 ? 3 : 2) : size === 'mid' && height >= 64 ? 2 : 1;

/** Сколько целых строк заметки остаётся под шапкой и фактами высокого блока:
 *  `wide` — факты в одну строку (широкая колонка), `tight` — с командой или
 *  фото они в узкой колонке переносятся во вторую, и её место держим заранее. */
function noteLines(height: number, lines: number, named: boolean, extras: boolean) {
  const head = Math.max(TALL.chip, (named ? TALL.name : 0) + lines * TALL.label);
  const fit = (facts: number) => Math.max(0, Math.min(MAX_NOTE_LINES,
    Math.floor((height - TALL.pad - head - TALL.gap - facts - TALL.gap) / TALL.note)));
  return { wide: fit(TALL.fact), tight: fit(extras ? TALL.fact * 2 + TALL.factGap : TALL.fact) };
}

/** Язык названия для переносов по слогам: «Обед» в чешском интерфейсе
 *  чешский словарь не перенесёт, и узкая колонка рвала бы слово где попало. */
const CYRILLIC_UI = ['ru', 'uk', 'bg', 'sr', 'mk', 'be'];
const labelLang = (label: string, ui: string) => {
  const base = ui.split('-')[0];
  if (/\p{Script=Cyrillic}/u.test(label)) return CYRILLIC_UI.includes(base) ? base : 'ru';
  return CYRILLIC_UI.includes(base) ? 'en' : base;
};

/**
 * Лицо блока «время студии» в сетке. Тот же язык, что у выходного: медальон
 * со значком вида (уборка, обед, планёрка) и его крупный водяной знак в углу,
 * — но значок есть на любой ширине колонки, а не только в широкой.
 *
 * Всё, что известно о блоке, — одной строкой фактов: время, длительность,
 * команда, заметка, фото. Строка переносится в невидимую вторую: что не
 * влезло в ширину, уходит целиком, а не обрезается до «13:0…». Высокий блок
 * дописывает саму заметку — ровно столько строк, сколько помещается целыми.
 * Карандаш «можно править» — значком на углу медальона: ширину у названия он
 * не отнимает.
 */
export function StudioTimeFace({ block, height, Icon, label, range, duration, name, openable, lang }: {
  block: StaffScheduleBlock;
  height: number;
  Icon: LucideIcon;
  label: string;
  /** «13:00–13:45» */
  range: string;
  /** «45 мин» на языке интерфейса. */
  duration: string;
  /** Имя мастера — когда колонку делят несколько дорожек (useGridColumns). */
  name?: string;
  openable: boolean;
  /** Язык интерфейса — для переносов в названии. */
  lang: string;
}) {
  const size = studioTimeSize(height);
  // Десять минут — 8px: ни строки не поместится. Блок остаётся полосой цвета,
  // всё о нём — в подсказке.
  if (height < 12) return null;
  // Кого касается, если не только хозяина колонки: лица — цветом из команды,
  // тех, кого сетка не прислала по имени, досчитывает «+n».
  const people = block.staff_ids?.length ?? 0;
  const faces = people > 1 ? (block.team ?? []).slice(0, MAX_FACES) : [];
  const others = people > 1 ? people - faces.length : 0;
  const note = block.notes?.trim() ?? '';
  const photos = block.photos?.length ?? 0;
  const shownName = size === 'tall' ? name : undefined;
  const lines = labelLines(size, height);
  const noted = size === 'tall' && !!note
    ? noteLines(height, lines, !!shownName, people > 1 || photos > 0) : { wide: 0, tight: 0 };

  return <>
    <span className="stb-art" data-size={size} aria-hidden><Icon strokeWidth={1.1} /></span>
    <div className="stb-body" data-size={size} data-note-tight={noted.tight > 0 ? undefined : 'none'}
         style={{ '--stb-lines': lines, '--stb-note-wide': noted.wide, '--stb-note-tight': noted.tight } as CSSProperties}>
      <span className="stb-icon" aria-hidden>
        <Icon strokeWidth={1.9} />
        {openable && <span className="stb-edit"><PencilLine strokeWidth={2.2} /></span>}
      </span>
      <div className="stb-titles">
        {shownName && <span className="stb-name">{shownName}</span>}
        {/* Значок в строке названия — там, где медальону нет места: в блоке
            короче получаса и в очень узкой колонке. Переносится вместе с
            текстом и не отнимает у названия отдельную колонку. */}
        <strong className="stb-label" lang={labelLang(label, lang)}>
          <Icon className="stb-inline-icon" strokeWidth={2.2} aria-hidden />{label}
        </strong>
        {/* Длительность в строке названия — для узкой колонки: там у времени
            в строке фактов на неё нет места, а рядом с «Обед» — есть. */}
        <span className="stb-dur stb-dur-title" aria-hidden>{duration}</span>
      </div>
      <span className="stb-facts" aria-hidden>
        <span className="stb-range">{range}</span>
        <span className="stb-dur">{duration}</span>
        {people > 1 && (
          <span className="stb-team">
            {faces.map(person => (
              <span key={person.id} className="stb-face" style={{ background: person.color ?? undefined }}>
                {person.name.trim().charAt(0).toLocaleUpperCase()}
              </span>
            ))}
            {others > 0 && <span className="stb-face stb-face-more">+{others}</span>}
          </span>
        )}
        {note && <span className={`stb-mark stb-mark-note${noted.wide ? ' is-written' : ''}`}><StickyNote strokeWidth={2} /></span>}
        {photos > 0 && <span className="stb-mark"><Paperclip strokeWidth={2} />{photos}</span>}
      </span>
      {noted.wide > 0 && <p className="stb-note">{note}</p>}
    </div>
  </>;
}
