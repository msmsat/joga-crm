import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '../../lib/utils';

const ease = [0.16, 1, 0.3, 1] as const;

/**
 * Текст, который меняется посимвольно, как табло: каждая позиция прокручивает
 * свой символ в сторону, куда листали (`dir`: 1 — вперёд, -1 — назад).
 * Совпавшие символы стоят на месте — меняется только то, что изменилось.
 */
export default function RollingText({ text, dir, reduce, className }: {
  text: string;
  dir: number;
  reduce: boolean;
  className?: string;
}) {
  if (reduce) return <span className={className}>{text}</span>;
  return (
    <span className={cn('inline-flex', className)} aria-label={text}>
      {[...text].map((char, index) => (
        <span key={index} aria-hidden="true" className="relative inline-flex overflow-hidden">
          <AnimatePresence mode="popLayout" initial={false} custom={dir}>
            <motion.span
              key={char}
              custom={dir}
              variants={{
                enter: (d: number) => ({ y: d >= 0 ? '90%' : '-90%', opacity: 0 }),
                center: { y: '0%', opacity: 1 },
                leave: (d: number) => ({ y: d >= 0 ? '-90%' : '90%', opacity: 0 }),
              }}
              initial="enter"
              animate="center"
              exit="leave"
              transition={{ duration: 0.42, delay: index * 0.022, ease }}
              className="inline-block whitespace-pre"
            >
              {char}
            </motion.span>
          </AnimatePresence>
        </span>
      ))}
    </span>
  );
}
