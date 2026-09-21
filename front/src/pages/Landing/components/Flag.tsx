// ─── ФЛАГИ ЯЗЫКОВ ────────────────────────────────────────────────────────────
// Рисуем сами, а не берём эмодзи из LANGUAGES: Windows не содержит в шрифте
// региональных индикаторов, и «🇬🇧» там превращается в две буквы «GB» — рядом с
// кодом языка выходило «GB EN», а в списке — «CZ Čeština». Картинок с CDN тоже
// не берём: это запрос к чужому домену на маркетинговой странице ради 20
// прямоугольников.
//
// Геометрия — 16×12 (пропорция 4:3, как у большинства европейских флагов).
// Сложные гербы не повторяем: на 18 пикселях ширины их всё равно не видно, а
// узнаётся флаг по полосам и цветам. Где герб — единственное отличие (Сербия,
// Хорватия), оставлен только он, в самом грубом виде.
import { LANGUAGES } from '../../../utils/lang';

const W = 16;
const H = 12;

/** Горизонтальные полосы сверху вниз. */
const rows = (...colors: string[]) =>
  colors.map((fill, i) => (
    <rect key={i} y={(H / colors.length) * i} width={W} height={H / colors.length} fill={fill} />
  ));

/** Вертикальные полосы слева направо. */
const cols = (...colors: string[]) =>
  colors.map((fill, i) => (
    <rect key={i} x={(W / colors.length) * i} width={W / colors.length} height={H} fill={fill} />
  ));

/** Скандинавский крест: смещён влево, как на всех северных флагах. */
const nordic = (bg: string, cross: string, inner?: string) => (
  <>
    <rect width={W} height={H} fill={bg} />
    <rect x="4.2" width="2.8" height={H} fill={cross} />
    <rect y="4.6" width={W} height="2.8" fill={cross} />
    {inner && (
      <>
        <rect x="5.1" width="1" height={H} fill={inner} />
        <rect y="5.5" width={W} height="1" fill={inner} />
      </>
    )}
  </>
);

const FLAGS: Record<string, React.ReactNode> = {
  cs: (
    <>
      {rows('#FFFFFF', '#D7141A')}
      <path d="M0 0 8 6 0 12Z" fill="#11457E" />
    </>
  ),
  en: (
    <>
      <rect width={W} height={H} fill="#012169" />
      <path d="M0 0 16 12M16 0 0 12" stroke="#FFFFFF" strokeWidth="2.6" />
      <path d="M0 0 16 12M16 0 0 12" stroke="#C8102E" strokeWidth="1.4" />
      <path d="M8 0V12M0 6H16" stroke="#FFFFFF" strokeWidth="4" />
      <path d="M8 0V12M0 6H16" stroke="#C8102E" strokeWidth="2.2" />
    </>
  ),
  uk: rows('#0057B7', '#FFD700'),
  ru: rows('#FFFFFF', '#0039A6', '#D52B1E'),
  de: rows('#000000', '#DD0000', '#FFCE00'),
  pl: rows('#FFFFFF', '#DC143C'),
  hu: rows('#CE2939', '#FFFFFF', '#477050'),
  ro: cols('#002B7F', '#FCD116', '#CE1126'),
  hr: (
    <>
      {rows('#FF0000', '#FFFFFF', '#171796')}
      <g fill="#FF0000">
        <rect x="6.4" y="4.2" width="1.6" height="1.6" />
        <rect x="8" y="5.8" width="1.6" height="1.6" />
      </g>
    </>
  ),
  sr: (
    <>
      {rows('#C6363C', '#0C4076', '#FFFFFF')}
      <rect x="3" y="3.4" width="2.4" height="3" fill="#C6363C" stroke="#FFFFFF" strokeWidth="0.4" />
    </>
  ),
  bg: rows('#FFFFFF', '#00966E', '#D62612'),
  it: cols('#009246', '#FFFFFF', '#CE2B37'),
  fr: cols('#002395', '#FFFFFF', '#ED2939'),
  es: (
    <>
      <rect width={W} height={H} fill="#AA151B" />
      <rect y="3" width={W} height="6" fill="#F1BF00" />
    </>
  ),
  pt: (
    <>
      <rect width={W} height={H} fill="#DA291C" />
      <rect width="6.4" height={H} fill="#046A38" />
      <circle cx="6.4" cy="6" r="2" fill="#FFE900" stroke="#DA291C" strokeWidth="0.5" />
    </>
  ),
  tr: (
    <>
      <rect width={W} height={H} fill="#E30A17" />
      <circle cx="6.4" cy="6" r="2.6" fill="#FFFFFF" />
      <circle cx="7.4" cy="6" r="2.1" fill="#E30A17" />
      <circle cx="10.2" cy="6" r="1" fill="#FFFFFF" />
    </>
  ),
  el: (
    <>
      <rect width={W} height={H} fill="#0D5EAF" />
      {[1, 3, 5, 7].map(i => (
        <rect key={i} y={(H / 9) * i} width={W} height={H / 9} fill="#FFFFFF" />
      ))}
      <rect width="6.6" height="6.6" fill="#0D5EAF" />
      <path d="M3.3 0V6.6M0 3.3H6.6" stroke="#FFFFFF" strokeWidth="1.3" />
    </>
  ),
  sq: (
    <>
      <rect width={W} height={H} fill="#E41E20" />
      {/* Двуглавый орёл — силуэтом: на 18px это тёмное пятно нужной формы. */}
      <path d="M8 3.4 6.6 2.6 6.8 4 4.4 4.6 6.6 5.6 5.4 8.2 8 7.2l2.6 1-1.2-2.6 2.2-1-2.4-.6.2-1.4Z" fill="#000000" />
    </>
  ),
  da: nordic('#C8102E', '#FFFFFF'),
  sv: nordic('#006AA7', '#FECC00'),
  no: nordic('#BA0C2F', '#FFFFFF', '#00205B'),
  fi: nordic('#FFFFFF', '#003580'),
};

export interface FlagProps {
  /** Код языка из LANGUAGES (cs, en, uk…), не код страны. */
  code: string;
  className?: string;
}

/** Флаг страны языка. Незнакомый код отдаёт флаг первого языка списка — пустого
 *  места на кнопке не остаётся ни при каких данных. */
export function Flag({ code, className = 'h-[13px] w-[17px]' }: FlagProps) {
  const drawing = FLAGS[code] ?? FLAGS[LANGUAGES[0].value];
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className={`shrink-0 overflow-hidden rounded-[2px] ${className}`}
      aria-hidden
    >
      {drawing}
      {/* Обводка внутрь: белые флаги (чешский, финский) иначе растворяются в
          светлом фоне списка, а на тёмной шапке теряют край. */}
      <rect x="0.25" y="0.25" width={W - 0.5} height={H - 0.5} rx="1.5" fill="none" stroke="rgba(0,0,0,0.25)" strokeWidth="0.5" />
    </svg>
  );
}
