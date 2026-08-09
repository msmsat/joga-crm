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
 *
 * Enter и пробел обрабатываются здесь, а не у вызывающих: это div с
 * role="button", а div сам по себе от клавиатуры не срабатывает — без этого
 * ни одна карточка приложения не нажималась с клавиатуры. Вместо ручного
 * вызова onClick идёт .click(): браузер сам родит настоящее событие, и
 * обработчик получит тот же MouseEvent, что и от мыши.
 */
export function Press({ haptic = true, children, ...rest }: PressProps) {
  const { vibrateLight } = useTelegram();

  return (
    <motion.div
      whileTap={{ scale: 0.97 }}
      transition={{ type: 'spring', stiffness: 420, damping: 30 }}
      onTapStart={haptic ? () => vibrateLight() : undefined}
      {...rest}
      onKeyDown={(event) => {
        if (rest.role !== 'button') return;
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault(); // пробел иначе прокручивает страницу
        event.currentTarget.click();
      }}
    >
      {children}
    </motion.div>
  );
}
