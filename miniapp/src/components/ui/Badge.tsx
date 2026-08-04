import { cn } from '../../lib/utils';

type Tone = 'neutral' | 'success' | 'warning' | 'brand';

/**
 * Плашка статуса.
 *
 * Текст на цветных плашках всегда ониксовый: фисташка и пыльная роза из ДС
 * светлые, белым по ним контраст проваливается (≈2:1 при норме 4.5:1).
 */
export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.08em]',
        tone === 'neutral' && 'bg-muted text-muted-foreground',
        tone === 'success' && 'bg-success text-brand-foreground',
        tone === 'warning' && 'bg-danger text-brand-foreground',
        tone === 'brand' && 'bg-brand text-brand-foreground',
      )}
    >
      {children}
    </span>
  );
}
