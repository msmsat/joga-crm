import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { cn } from '../../lib/utils';

type Props = {
  /** Аватар: фото, инициалы или знак — квадрат 48px слева. */
  lead: ReactNode;
  title: string;
  hint?: string;
  /** Справа: цена, длительность. */
  aside?: string;
  active?: boolean;
  index: number;
  onClick: () => void;
  /** Мышь навелась — примерка выбора в колонке шагов (десктоп). Пальцу не зовётся. */
  onHover?: () => void;
};

/**
 * Строка выбора в разделах записи: услуга или мастер. Выбранная — с кольцом
 * акцента и галочкой; появляются строки волной, как карточки мастеров.
 */
export default function WizardRow({ lead, title, hint, aside, active, index, onClick, onHover }: Props) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      onPointerEnter={onHover ? (event) => { if (event.pointerType === 'mouse') onHover(); } : undefined}
      aria-pressed={active}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: Math.min(index, 8) * 0.03, ease: [0.16, 1, 0.3, 1] }}
      whileTap={{ scale: 0.985 }}
      className={cn(
        'flex w-full items-center gap-3.5 rounded-[20px] bg-background px-3.5 py-3 text-left transition-[background-color,box-shadow] duration-200',
        active ? 'bg-card shadow-soft ring-2 ring-brand' : 'dt:hover:bg-card dt:hover:shadow-lift',
      )}
    >
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
        {hint && <span className="mt-0.5 block truncate text-[12.5px] font-semibold text-muted-foreground">{hint}</span>}
      </span>
      {aside && (
        <span className="shrink-0 text-right text-[13.5px] font-extrabold tabular-nums tracking-[-0.01em] text-card-foreground">
          {aside}
        </span>
      )}
    </motion.button>
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
