import { useMemo, useRef, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { haptic } from '../../../hooks/useTelegram';

/** То же сердце, что у раздела «Мои занятия» в нижней капсуле (navItems):
 *  оценка и вкладка — один предмет, а не две разные иконки. */
export const HEART = 'M12 20.97c-.33 0-.55-.11-.77-.33C8.59 18.44 3.2 14.37 3.2 9.31 3.2 6.56 5.29 4.25 8.04 4.25c1.65 0 3.08.88 3.96 2.2.88-1.32 2.31-2.2 3.96-2.2 2.75 0 4.84 2.31 4.84 5.06 0 5.06-5.39 9.13-8.03 11.33-.22.22-.44.33-.77.33z';
const LEVELS = [1, 2, 3, 4, 5];
const SPARKS = Array.from({ length: 8 }, (_, i) => i);
/** Шаг волны: вверх — сердце за сердцем от прежней оценки, вниз — быстрее, от верха. */
const STEP_UP = 55;
const STEP_DOWN = 38;

type Props = {
  rating: number;
  /** Нет — только показ: оценивать эту бронь сервер не разрешил. */
  onRate?: (rating: number) => void;
  size?: 'md' | 'lg';
};

const calm = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * Волна заливки — Web Animations, а не CSS-переходы. Переход на каждое
 * сердце рассылал transitionrun/start/end, и React 19 прогонял их все через
 * свой корневой обработчик прямо во время волны; анимация WAAPI событий не
 * шлёт. Итог (залито или нет) ставит CSS по `data-rating` группы — одна смена
 * атрибута на ряд, — а анимация лишь показывает путь к нему: `backwards`
 * держит начальный кадр, пока до сердца не дошла очередь.
 */
function wave(fills: (SVGGElement | null)[], from: number, to: number) {
  fills.forEach((fill, i) => {
    const level = i + 1;
    if (!fill) return;
    if (to > from && level > from && level <= to) {
      fill.animate(
        [{ transform: 'scale(0)' }, { transform: 'scale(1.2)', offset: 0.58 }, { transform: 'scale(0.95)', offset: 0.8 }, { transform: 'scale(1)' }],
        { duration: 480, delay: (level - from - 1) * STEP_UP, easing: 'cubic-bezier(0.3, 0.7, 0.3, 1)', fill: 'backwards' },
      );
    } else if (to < from && level > to && level <= from) {
      fill.animate(
        [{ transform: 'scale(1)' }, { transform: 'scale(0)' }],
        { duration: 200, delay: (from - level) * STEP_DOWN, easing: 'cubic-bezier(0.5, 0, 0.75, 0)', fill: 'backwards' },
      );
    }
  });
}

/**
 * Вспышка у нажатого сердца: оно сжимается и выстреливает с перелётом ровно
 * тогда, когда до него доходит волна (`at`), кольцо расходится, восемь искр
 * вылетают от его края. Повторный тап — лёгкое покачивание, снижение — короткий
 * отклик без вспышки.
 */
function burst(heart: HTMLElement | null, kind: 'up' | 'down' | 'same', at: number) {
  if (!heart) return;
  heart.querySelector('svg')?.animate(
    kind === 'up'
      ? [{ transform: 'scale(1)' }, { transform: 'scale(0.7)', offset: 0.16 }, { transform: 'scale(1.24)', offset: 0.52 }, { transform: 'scale(0.95)', offset: 0.78 }, { transform: 'scale(1)' }]
      : [{ transform: 'scale(1)' }, { transform: 'scale(0.84)', offset: 0.3 }, { transform: 'scale(1.08)', offset: 0.7 }, { transform: 'scale(1)' }],
    { duration: kind === 'up' ? 560 : 360, easing: 'cubic-bezier(0.3, 0.7, 0.3, 1)', delay: kind === 'up' ? Math.max(0, at - 40) : 0 },
  );
  if (kind !== 'up') return;
  heart.querySelector('.hr-ring')?.animate(
    [{ transform: 'scale(0.6)', opacity: 0.75, borderWidth: '3px' }, { transform: 'scale(1.55)', opacity: 0, borderWidth: '0.5px' }],
    { duration: 520, easing: 'cubic-bezier(0.15, 0.75, 0.3, 1)', delay: at + 90 },
  );
  heart.querySelectorAll<HTMLElement>('.hr-spark').forEach((spark, i) => {
    const angle = ((i * 45 + 22.5) * Math.PI) / 180;
    const reach = i % 2 ? 19 : 24;
    const x = Math.cos(angle);
    const y = Math.sin(angle);
    spark.animate(
      [
        { transform: `translate(${x * 9}px, ${y * 9}px) scale(1.15)`, opacity: 1 },
        { transform: `translate(${x * reach}px, ${y * reach}px) scale(0)`, opacity: 0.25 },
      ],
      { duration: 480 + (i % 3) * 60, easing: 'cubic-bezier(0.12, 0.7, 0.3, 1)', delay: at + 110 },
    );
  });
}

/**
 * Оценка сердцами.
 *
 * Новая оценка наливается волной от прежней: сердца между ними заполняются по
 * одному, с упругим перелётом, а при снижении — сдуваются в обратную сторону.
 * Тап стоит одну перерисовку этого ряда и одну смену атрибута.
 *
 * Ряд — группа переключателей: стрелки меняют оценку, у каждого сердца
 * подпись словом («Хорошо»), а не цифрой.
 */
export default function HeartRating({ rating, onRate, size = 'md' }: Props) {
  const { t } = useTranslation();
  const hearts = useRef<(HTMLSpanElement | null)[]>([]);
  const fills = useRef<(SVGGElement | null)[]>([]);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  // Подписи — раз на язык: перевод в i18next заметно дорог, а ряд
  // перерисовывается на каждый тап.
  const labels = useMemo(() => LEVELS.map((level) => t(`mylessons.review.levels.${level}`)), [t]);
  const groupLabel = useMemo(() => t('mylessons.review.rate_label'), [t]);
  const ask = useMemo(() => t('mylessons.review.ask'), [t]);

  const choose = (next: number) => {
    if (!onRate) return;
    if (!calm()) {
      wave(fills.current, rating, next);
      const at = next > rating ? (next - rating - 1) * STEP_UP : 0;
      burst(hearts.current[next - 1], next > rating ? 'up' : next === rating ? 'same' : 'down', at);
    }
    if (next === 5 && rating !== 5) haptic.success();
    else haptic.light();
    onRate(next);
  };

  const onKey = (event: KeyboardEvent, level: number) => {
    const step = event.key === 'ArrowRight' || event.key === 'ArrowUp' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowDown' ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const next = Math.min(5, Math.max(1, level + step));
    choose(next);
    buttons.current[next - 1]?.focus();
  };

  const heart = (level: number) => (
    <span ref={(el) => { hearts.current[level - 1] = el; }} className="hr-heart">
      <span className="hr-ring" />
      {SPARKS.map((i) => <i key={i} className="hr-spark" />)}
      <svg viewBox="0 0 24 24" className="hr-svg" aria-hidden="true">
        <path className="hr-outline" d={HEART} />
        <g ref={(el) => { fills.current[level - 1] = el; }} className="hr-fill">
          <path d={HEART} />
          <ellipse className="hr-gloss" cx="7.7" cy="8.4" rx="2.3" ry="1.25" transform="rotate(-38 7.7 8.4)" />
        </g>
      </svg>
    </span>
  );

  return (
    <div className={`hr flex items-center ${size === 'lg' ? 'hr-lg' : ''}`}>
      {onRate ? (
        <div role="radiogroup" aria-label={groupLabel} data-rating={rating} className="hr-group flex">
          {LEVELS.map((level) => (
            <button
              key={level}
              ref={(el) => { buttons.current[level - 1] = el; }}
              type="button"
              role="radio"
              aria-checked={level === rating}
              aria-label={labels[level - 1]}
              tabIndex={level === (rating || 1) ? 0 : -1}
              onClick={() => choose(level)}
              onKeyDown={(event) => onKey(event, level)}
              className="hr-btn"
            >
              {heart(level)}
            </button>
          ))}
        </div>
      ) : (
        <div role="img" aria-label={rating ? labels[rating - 1] : undefined} data-rating={rating} className="hr-group flex">
          {LEVELS.map((level) => <span key={level} className="hr-btn">{heart(level)}</span>)}
        </div>
      )}
      <span
        key={rating}
        className={`hr-word ml-auto shrink-0 pl-2 text-[12.5px] font-extrabold tracking-[-0.01em] ${rating ? 'text-foreground' : 'text-muted-foreground'}`}
        aria-hidden="true"
      >
        {rating ? labels[rating - 1] : ask}
      </span>
    </div>
  );
}
