import { motion } from 'framer-motion';

/**
 * Пустое состояние. Иконка в персиковом круге, заголовок, подпись — та же
 * конструкция, что у EmptyState в CRM, чтобы продукт читался как один.
 */
export function EmptyState({
  title,
  hint,
  icon,
  size = 'lg',
}: {
  title: string;
  hint?: string;
  /** Содержимое <svg viewBox="0 0 24 24"> — линейное, без заливки */
  icon?: React.ReactNode;
  /** sm — внутри листа, где вертикаль на вес золота */
  size?: 'sm' | 'lg';
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className={`flex flex-col items-center text-center ${
        size === 'sm' ? 'px-6 py-8' : 'px-10 py-14 dt:py-20'
      }`}
    >
      <span className="flex h-16 w-16 items-center justify-center rounded-full bg-brand/10 dt:h-20 dt:w-20">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--v-brand)"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-7 w-7 dt:h-9 dt:w-9"
        >
          {icon ?? (
            <>
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </>
          )}
        </svg>
      </span>

      <div className="mt-5 text-[16px] font-extrabold tracking-[-0.015em] text-foreground dt:mt-6 dt:text-[19px]">
        {title}
      </div>
      {hint && (
        <div className="mt-1.5 text-[12.5px] font-medium leading-relaxed text-muted-foreground dt:mt-2 dt:text-[13.5px]">
          {hint}
        </div>
      )}
    </motion.div>
  );
}
