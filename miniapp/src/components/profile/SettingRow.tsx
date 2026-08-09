import { motion } from 'framer-motion';
import { Press } from '../ui/Press';
import { cn } from '../../lib/utils';

type Props = {
  /** Содержимое <svg viewBox="0 0 24 24"> — линейное, без заливки */
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  /** Показать тумблер вместо шеврона */
  toggle?: boolean;
  checked?: boolean;
  /** Своё содержимое справа — например, галочка «скопійовано» */
  trailing?: React.ReactNode;
  /** Персиковая обводка для продающей строки */
  accent?: boolean;
};

/**
 * Строка настроек.
 *
 * Разделительных линий между строками нет — их роль играют промежутки и
 * собственные тени карточек, как и на остальных экранах.
 */
export default function SettingRow({
  icon,
  label,
  onClick,
  toggle,
  checked,
  trailing,
  accent,
}: Props) {
  return (
    <Press
      onClick={onClick}
      role="button"
      tabIndex={0}
      className={cn(
        'flex min-h-[60px] cursor-pointer items-center gap-3.5 rounded-[18px] bg-card px-4 shadow-soft transition-shadow duration-300 dt:min-h-[68px] dt:gap-4 dt:rounded-[20px] dt:px-5 dt:hover:shadow-lift',
        accent && 'ring-1 ring-inset ring-brand/30',
      )}
    >
      <span
        className={cn(
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
          accent ? 'bg-brand' : 'bg-brand/10',
        )}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke={accent ? 'var(--v-brand-foreground)' : 'var(--v-brand)'}
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-[18px] w-[18px]"
        >
          {icon}
        </svg>
      </span>

      <span className="min-w-0 flex-1 truncate text-[14px] font-bold tracking-[-0.01em] text-card-foreground dt:text-[15px]">
        {label}
      </span>

      {toggle ? (
        <span
          className={cn(
            'flex h-[28px] w-[48px] shrink-0 items-center rounded-full p-[3px] transition-colors duration-200',
            checked ? 'bg-brand' : 'bg-muted',
          )}
        >
          <motion.span
            layout
            transition={{ type: 'spring', stiffness: 500, damping: 34 }}
            className={cn(
              'h-[22px] w-[22px] rounded-full bg-card shadow-soft',
              checked && 'ml-auto',
            )}
          />
        </span>
      ) : (
        trailing ?? (
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--v-muted-foreground)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4 w-4 shrink-0"
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
        )
      )}
    </Press>
  );
}
