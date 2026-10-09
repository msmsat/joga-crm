import { memo, useState, type CSSProperties } from 'react';
import { fractionOf, moneyFormat } from '../../lib/money';
import { cn } from '../../lib/utils';
import { priceLayout } from './priceLayout';

const REEL = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

/**
 * Цена барабанами, как на механическом табло: каждый разряд — колонка цифр
 * 0–9, которая прокручивается к новой цифре, проходя промежуточные.
 *
 * Прежняя посимвольная смена (RollingText, удалён) выглядела дёшево по двум
 * причинам, и обе убраны здесь:
 *  1. Знак валюты прыгал. Символы стояли по номеру в строке, и ширина каждой
 *     ячейки менялась скачком в конце анимации: «990» → «1 290» сдвигало хвост
 *     рывком. Здесь разряд держит место по значению (`priceLayout`), цифры
 *     табличные — одной ширины, а новый разряд и разделитель тысяч
 *     раскрываются по ширине плавно: знак валюты едет, а не прыгает.
 *  2. Цифра обрезалась. Ячейка с `overflow: hidden` была уже самой цифры —
 *     её сжимал отрицательный трекинг. Здесь ячейка — полная ширина цифры, а
 *     трекинг — внешнее поле разряда; режется только вертикаль, и та мягко,
 *     маской.
 *
 * Колонка едет `transform`-ом — его ведёт видеокарта, и барабаны крутятся
 * ровно, даже пока под ними листают карты. DOM на смене суммы не
 * перестраивается: меняются только номер цифры (`--d`) и флаги раскрытия.
 */
export default memo(function PriceRoll({ value, set, currency, locale, reduce, className }: {
  value: number;
  /** Все суммы, которые здесь бывают (пакеты витрины): мест — под самую длинную. */
  set: number[];
  currency: string;
  locale: string;
  reduce: boolean;
  className?: string;
}) {
  const fraction = fractionOf([value, ...set]);
  let format: Intl.NumberFormat | null;
  try {
    format = moneyFormat(currency, locale, fraction);
  } catch {
    format = null;
  }
  const layout = format ? priceLayout(format, value, set) : null;

  // Свёрнутый разряд уходит со своей последней цифрой, а не докручивается до
  // нуля у человека на глазах.
  const [kept, setKept] = useState<number[]>(layout?.digits ?? []);
  const shown = layout ? Array.from({ length: layout.span }, (_, place) => layout.digits[place] ?? kept[place] ?? 0) : [];
  if (shown.length !== kept.length || shown.some((digit, place) => digit !== kept[place])) setKept(shown);

  // Неизвестная валюта — сумма и код как есть.
  if (!format || !layout) return <span className={className}>{`${value} ${currency}`}</span>;

  const places = Array.from({ length: layout.span }, (_, index) => layout.span - 1 - index);
  const live = layout.digits.length;
  let wave = 0;

  return (
    <span className={cn('price-roll', className)} data-still={reduce || undefined}>
      <span className="sr-only">{format.format(value)}</span>
      <span aria-hidden="true" className="price-roll-line">
        {layout.prefix && <span className="price-roll-lit">{layout.prefix}</span>}
        {places.map((place) => {
          const on = place < live;
          const order = on ? wave++ : 0;
          return [
            <Digit key={`d${place}`} digit={shown[place]} on={on} order={order} />,
            place > 0 && layout.groups.includes(place) && (
              <span key={`g${place}`} className="price-roll-sep" data-off={!layout.shownGroups.includes(place) || undefined}>
                <span className="price-roll-sep-in">{layout.group}</span>
              </span>
            ),
          ];
        })}
        {layout.decimal && <span className="price-roll-lit">{layout.decimal}</span>}
        {layout.fraction.map((digit, index) => (
          <Digit key={`f${index}`} digit={digit} on order={wave++} />
        ))}
        {layout.suffix && <span className="price-roll-lit">{layout.suffix}</span>}
      </span>
    </span>
  );
});

function Digit({ digit, on, order }: { digit: number; on: boolean; order: number }) {
  return (
    <span className="price-roll-slot" data-off={!on || undefined} style={{ '--d': digit, '--i': order } as CSSProperties}>
      <span className="price-roll-cell">
        <span className="price-roll-ghost">0</span>
        <span className="price-roll-reel">
          {REEL.map((n) => <span key={n}>{n}</span>)}
        </span>
      </span>
    </span>
  );
}
