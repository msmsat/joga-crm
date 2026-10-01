import { motion, useReducedMotion, type Variants } from 'framer-motion';
import { cn } from '../../lib/utils';

type Props = {
  label: string;
  onClick: () => void;
  /**
   * `soft` — в профиле: карточка того же кроя, что строки настроек над ней.
   * `solid` — подтверждение в листе: крой SheetAction, роза вместо персика.
   */
  variant?: 'soft' | 'solid';
};

/** Пружина Press и SheetAction: отклик у всего нажимаемого один. */
const spring = { type: 'spring', stiffness: 420, damping: 30 } as const;

const shell: Variants = {
  rest: { y: 0, scale: 1 },
  hover: { y: -2, scale: 1 },
  tap: { y: 0, scale: 0.97 },
};

/** Розовая волна расходится от центра: карточка теплеет, а не перекрашивается. */
const wash: Variants = {
  rest: { clipPath: 'circle(0% at 50% 50%)' },
  hover: { clipPath: 'circle(75% at 50% 50%)' },
  tap: { clipPath: 'circle(75% at 50% 50%)' },
};

/** Кружок под иконкой наливается розой из центра. */
const chip: Variants = {
  rest: { scale: 0 },
  hover: { scale: 1 },
  tap: { scale: 1 },
};

/** Блик сплошной кнопки — полоса света проходит слева направо. */
const shine: Variants = {
  rest: { x: '-120%' },
  hover: { x: '320%', transition: { duration: 0.8, ease: [0.4, 0, 0.2, 1] } },
};

/**
 * «Выйти» — единственная кнопка приложения в пыльной розе (`--v-danger`).
 *
 * Розой в палитре помечено то, что обратно одним касанием не вернуть; персик
 * остаётся за действиями «вперёд». Цвет текста — `--v-destructive`, та же роза
 * глубже: сама `--v-danger` на белом даёт 2.5:1 и мелким кеглем не читается.
 *
 * Наведение: карточка приподнимается, от центра расходится розовая волна,
 * кружок иконки наливается, а стрелка один раз «выходит» за дверь и
 * возвращается слева — жест читается как «выйти», а не как общая анимация.
 * Наведение есть только у мыши (framer и Tailwind v4 пропускают касание),
 * поэтому на телефоне та же заливка вспыхивает на нажатии и не залипает.
 *
 * С «уменьшить движение» в системе остаются цвет и заливка, без переездов.
 */
export default function LogoutButton({ label, onClick, variant = 'soft' }: Props) {
  const reduce = useReducedMotion();
  const solid = variant === 'solid';

  const arrow: Variants = {
    rest: { x: 0, opacity: 1 },
    hover: reduce
      ? { x: 0, opacity: 1 }
      : {
          x: [0, 7, -7, 0],
          opacity: [1, 0, 0, 1],
          transition: { duration: 0.62, times: [0, 0.42, 0.43, 1], ease: ['easeIn', 'linear', 'easeOut'] },
        },
    tap: { x: 3, opacity: 1 },
  };

  const icon = (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={solid ? 2.2 : 1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn('relative overflow-visible', solid ? 'h-[19px] w-[19px]' : 'h-[18px] w-[18px]')}
    >
      <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
      <motion.g variants={arrow} transition={spring}>
        <polyline points="16 17 21 12 16 7" />
        <line x1="21" y1="12" x2="9" y2="12" />
      </motion.g>
    </svg>
  );

  return (
    <motion.button
      type="button"
      onClick={onClick}
      initial="rest"
      animate="rest"
      whileHover="hover"
      whileTap="tap"
      variants={shell}
      transition={spring}
      className={cn(
        'group relative isolate flex w-full items-center justify-center overflow-hidden',
        'font-extrabold tracking-[-0.01em] transition-shadow duration-300 focus-visible:outline-danger',
        solid
          ? 'gap-2.5 rounded-[18px] bg-danger py-4 text-[15px] text-brand-foreground shadow-danger hover:shadow-danger-lift'
          : 'min-h-[60px] gap-3 rounded-[18px] bg-card px-4 text-[14px] text-destructive shadow-soft hover:shadow-danger-lift dt:min-h-[68px] dt:rounded-[20px] dt:text-[15px]',
      )}
    >
      {solid ? (
        <motion.span
          aria-hidden="true"
          variants={shine}
          transition={{ duration: 0 }}
          className="pointer-events-none absolute inset-y-0 left-0 -z-10 w-1/3 -skew-x-12 bg-gradient-to-r from-transparent via-white/40 to-transparent"
        />
      ) : (
        <motion.span
          aria-hidden="true"
          variants={wash}
          transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
          className="pointer-events-none absolute inset-0 -z-10 bg-danger/10"
        />
      )}

      {solid ? (
        icon
      ) : (
        <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-danger/14 transition-colors duration-200 group-hover:text-brand-foreground group-active:text-brand-foreground">
          <motion.span
            aria-hidden="true"
            variants={chip}
            transition={spring}
            className="absolute inset-0 rounded-full bg-danger"
          />
          {icon}
        </span>
      )}

      <span className="relative">{label}</span>
    </motion.button>
  );
}
