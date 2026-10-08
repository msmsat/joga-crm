import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { useMe } from '../../../../../hooks/useMe';
import { cap } from './dates';
import s from './PhoneOverview.module.css';

const EASE = [0.22, 1, 0.36, 1] as const;

type DayPart = 'morning' | 'day' | 'evening' | 'night';

function dayPart(hour: number): DayPart {
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 18) return 'day';
  if (hour >= 18 && hour < 23) return 'evening';
  return 'night';
}

/**
 * Приветствие по времени суток и имени — первое, что видит человек, открыв
 * кабинет с телефона. Слова проявляются по одному: это и есть «вход» страницы,
 * остальное ему вторит.
 */
export default function Greeting() {
  const { t, i18n } = useTranslation('dashboard');
  const { data: me, isPending } = useMe();
  const now = new Date();
  const part = dayPart(now.getHours());
  const name = me?.name?.trim().split(/\s+/)[0];
  const text = name ? t(`phone.greeting.${part}`, { name }) : t(`phone.greeting.${part}Plain`);
  const date = cap(now.toLocaleDateString(i18n.language, { weekday: 'long', day: 'numeric', month: 'long' }));

  return (
    <header className={s.greeting}>
      <motion.p
        className={s.date}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: EASE }}
      >
        {date}
      </motion.p>
      {/* Пока профиль едет, место под строку держится невидимым текстом: имя,
          появившееся следом, сдвинуло бы всю страницу. */}
      <h1 className={s.hello} aria-label={isPending ? undefined : text}>
        {isPending ? (
          <span className={s.helloPending}>{text}</span>
        ) : (
          text.split(' ').map((word, i) => (
            <motion.span
              key={`${word}-${i}`}
              aria-hidden="true"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.06 + i * 0.07, ease: EASE }}
            >
              {word}{' '}
            </motion.span>
          ))
        )}
      </h1>
    </header>
  );
}
