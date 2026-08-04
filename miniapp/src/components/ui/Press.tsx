import { motion, type HTMLMotionProps } from 'framer-motion';
import { useTelegram } from '../../hooks/useTelegram';

type PressProps = HTMLMotionProps<'div'> & {
  /** Отключить вибрацию — например, для карточки, которая только раскрывается. */
  haptic?: boolean;
};

/**
 * Обёртка для всего, что нажимается.
 *
 * Пружина вместо cubic-bezier — так отклик читается как физический, а не как
 * анимация (HIG: spring-physics). Вибрация уходит на pointerdown, а не на
 * click: отклик обязан появиться в первые 100ms после касания.
 */
export function Press({ haptic = true, children, ...rest }: PressProps) {
  const { vibrateLight } = useTelegram();

  return (
    <motion.div
      whileTap={{ scale: 0.97 }}
      transition={{ type: 'spring', stiffness: 420, damping: 30 }}
      onTapStart={haptic ? () => vibrateLight() : undefined}
      {...rest}
    >
      {children}
    </motion.div>
  );
}
