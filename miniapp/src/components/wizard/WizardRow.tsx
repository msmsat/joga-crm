import { useId, useState, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/utils';
import { useClamp } from '../../hooks/useClamp';
import { RatingMark } from '../about/Rating';
import '../about/about.css';

type Props = {
  /** Аватар: фото, инициалы или знак — квадрат 48px слева. */
  lead: ReactNode;
  title: string;
  hint?: string;
  /** Средняя оценка клиентов — рядом с подсказкой: «Хатха · ♥ 4,9». */
  rating?: number | null;
  /** Справа: цена, длительность. */
  aside?: string;
  active?: boolean;
  index: number;
  onClick: () => void;
  /** Мышь навелась — примерка выбора в колонке шагов (десктоп). Пальцу не зовётся. */
  onHover?: () => void;
  /** Описание услуги или «О себе» мастера — под строкой. Нет — строка без него. */
  more?: string | null;
};

/** Строк описания, видимых сразу. Длиннее — «Подробнее» в хвосте последней. */
const LINES = 3;

/**
 * Строка выбора в разделах записи: услуга или мастер. Выбранная — с кольцом
 * акцента и галочкой; появляются строки волной, как карточки мастеров.
 *
 * Описание пишется сразу, под строкой и во всю её ширину — от левого края
 * значка, а не от названия: колонка пустоты под значком делала строку
 * кособокой, будто значок уехал наверх. Влезает в три строки — показано
 * целиком; длиннее — третья гаснет к концу, и в её погасшем хвосте стоит
 * «Подробнее»: тот же абзац дописывается на месте, кнопка уходит строкой ниже.
 *
 * Выбор и раскрытие — СОСЕДНИЕ кнопки: строку целиком (с описанием) накрывает
 * прозрачная кнопка выбора, содержимое пропускает касания к ней, и только
 * «Подробнее» стоит над ней своей кнопкой. Кнопка в кнопке ловила бы оба
 * нажатия разом.
 */
export default function WizardRow({ lead, title, hint, rating, aside, active, index, onClick, onHover, more }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const { ref: textRef, cut, full } = useClamp<HTMLParagraphElement>(more, LINES);
  const textId = useId();
  const expanded = open && cut;

  const entrance = {
    initial: { opacity: 0, y: 8 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.3, delay: Math.min(index, 8) * 0.03, ease: [0.16, 1, 0.3, 1] as const },
  };
  const hover = onHover ? (event: React.PointerEvent) => { if (event.pointerType === 'mouse') onHover(); } : undefined;
  const surface = cn(
    'rounded-[20px] bg-background transition-[background-color,box-shadow] duration-200',
    active ? 'bg-card shadow-soft ring-2 ring-brand' : 'dt:hover:bg-card dt:hover:shadow-lift',
  );

  const body = (
    <>
      <span className="relative shrink-0">
        {lead}
        {active && (
          <span className="absolute -bottom-0.5 -right-0.5 flex h-[18px] w-[18px] items-center justify-center rounded-full bg-brand text-brand-foreground ring-2 ring-card">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" className="h-2.5 w-2.5">
              <polyline points="5 12.5 10 17 19 7.5" />
            </svg>
          </span>
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 block break-words text-[15px] font-extrabold leading-snug tracking-[-0.015em] text-card-foreground">
          {title}
        </span>
        {(hint || rating != null) && (
          <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[12.5px] font-semibold text-muted-foreground">
            {hint && <span className="truncate">{hint}</span>}
            {hint && rating != null && <span aria-hidden="true">·</span>}
            {rating != null && <RatingMark avg={rating} className="font-extrabold text-card-foreground" />}
          </span>
        )}
      </span>
      {aside && (
        <span className="shrink-0 text-right text-[13.5px] font-extrabold tabular-nums tracking-[-0.01em] text-card-foreground">
          {aside}
        </span>
      )}
    </>
  );

  if (!more) {
    return (
      <motion.button
        type="button"
        onClick={onClick}
        onPointerEnter={hover}
        aria-pressed={active}
        {...entrance}
        whileTap={{ scale: 0.985 }}
        className={cn('flex w-full items-center gap-3.5 px-3.5 py-3 text-left', surface)}
      >
        {body}
      </motion.button>
    );
  }

  return (
    /* Нажатие — CSS по :active кнопки выбора: жест framer на обёртке ловил бы
       и «Подробнее», а второй анимируемый узел на строку ни к чему. */
    <motion.div
      {...entrance}
      className={cn('relative has-[.wr-hit:active]:scale-[0.985] [transition:background-color_0.2s,box-shadow_0.2s,scale_0.18s]', surface)}
    >
      <button
        type="button"
        onClick={onClick}
        onPointerEnter={hover}
        aria-pressed={active}
        aria-label={title}
        aria-describedby={textId}
        className="wr-hit absolute inset-0 rounded-[20px] outline-none focus-visible:ring-2 focus-visible:ring-brand/60"
      />
      <div className="pointer-events-none relative">
        <div className="flex items-center gap-3.5 px-3.5 pt-3">{body}</div>
        <div
          className={cn(
            'relative px-3.5 pt-2.5 transition-[padding] duration-[460ms] ease-[cubic-bezier(0.2,0.8,0.2,1)]',
            // Раскрыто — кнопке своя строка под текстом.
            expanded ? 'pb-[calc(0.875rem+30px)]' : 'pb-3.5',
          )}
        >
          <p
            id={textId}
            ref={textRef}
            data-cut={cut || undefined}
            data-open={expanded || undefined}
            style={expanded ? { maxHeight: full } : undefined}
            className="ab-text ab-text-wide ab-text-tail text-[13.5px] font-medium tracking-[-0.003em] text-muted-foreground"
          >
            {more}
          </p>
          {cut && (
            <button
              type="button"
              onClick={() => setOpen((value) => !value)}
              aria-expanded={expanded}
              aria-controls={textId}
              className="pointer-events-auto absolute bottom-[8.5px] right-2 inline-flex h-8 items-center gap-1 rounded-full px-1.5 text-[12.5px] font-extrabold tracking-[-0.01em] text-card-foreground transition-colors duration-200 active:bg-muted dt:hover:bg-muted"
            >
              {expanded ? t('about.less') : t('about.more')}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="ab-toggle-icon h-3.5 w-3.5 text-muted-foreground">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}

/** Пусто или ошибка внутри раздела — короткой строкой с действием. */
export function WizardEmpty({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-[20px] bg-background px-6 py-8 text-center">
      <span className="text-[13.5px] font-semibold leading-snug text-muted-foreground">{title}</span>
      {action && onAction && (
        <motion.button
          type="button"
          onClick={onAction}
          whileTap={{ scale: 0.96 }}
          className="min-h-10 rounded-full bg-brand/14 px-5 text-[13px] font-extrabold text-foreground"
        >
          {action}
        </motion.button>
      )}
    </div>
  );
}

export function RowSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div aria-busy="true" className="flex flex-col gap-2.5">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="h-[72px] animate-pulse rounded-[20px] bg-background" style={{ animationDelay: `${i * 70}ms` }} />
      ))}
    </div>
  );
}
