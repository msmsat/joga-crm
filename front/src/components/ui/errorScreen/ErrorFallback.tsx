import { Fragment, useEffect, useRef, useState } from 'react';
import { AnimatePresence, MotionConfig, motion } from 'framer-motion';
import type { Variants } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Button } from '../Button';
import { TypingScene } from './TypingScene';
import s from './errorScreen.module.css';

// Сколько длится попытка: человечек успевает заново набрать код, а полоса в
// окне редактора — дойти до конца. Короче — повтор выглядит как мигание.
const RETRY_MS = 1800;

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

const stagger: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08, delayChildren: 0.1 } },
};
const rise: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: EASE } },
};
const sceneIn: Variants = {
  hidden: { opacity: 0, y: 12, scale: 0.97 },
  show: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.9, ease: EASE } },
};
const words: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.055 } },
};
const word: Variants = {
  hidden: { y: '110%' },
  show: { y: '0%', transition: { duration: 0.75, ease: EASE } },
};

const RetryIcon = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 12a8 8 0 1 1-2.34-5.66L20 8.7" />
    <path d="M20 4v4.7h-4.7" />
  </svg>
);

export interface ErrorFallbackProps {
  /**
   * Повторить. Может вернуть промис (перезапрос данных): экран держит «пробуем»,
   * пока он не завершится. Помог — владелец убирает экран; не помог — экран
   * остаётся и переключается на «со второго раза тоже не вышло».
   */
  onRetry: () => unknown;
  /** Что сломалось; по умолчанию — текст про упавшую страницу. */
  description?: string;
  /** Сколько повторов не помогло ещё до показа (ErrorBoundary монтирует экран заново). */
  attempt?: number;
}

export function ErrorFallback({ onRetry, description, attempt = 0 }: ErrorFallbackProps) {
  const { t } = useTranslation('common');
  const [retrying, setRetrying] = useState(false);
  const [failures, setFailures] = useState(0);
  const timer = useRef<number | undefined>(undefined);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; window.clearTimeout(timer.current); };
  }, []);

  // Экран вернулся после неудачного повтора — без повторного появления,
  // иначе повтор выглядит как перезагрузка, а не как «не вышло».
  const remounted = attempt > 0;
  const again = attempt + failures > 0;

  const retry = async () => {
    setRetrying(true);
    await new Promise(done => { timer.current = window.setTimeout(done, RETRY_MS); });
    await Promise.resolve(onRetry()).catch(() => undefined);
    if (!alive.current) return;
    setRetrying(false);
    setFailures(f => f + 1);
  };
  const reload = () => window.location.reload();

  const retryButton = (
    <Button key="retry" variant={again ? 'ghost' : 'primary'} onClick={() => void retry()} loading={retrying} icon={RetryIcon}>
      {t(retrying ? 'errorBoundary.retrying' : 'errorBoundary.retry')}
    </Button>
  );
  const reloadButton = (
    <Button key="reload" variant={again ? 'primary' : 'ghost'} onClick={reload}>
      {t('errorBoundary.reload')}
    </Button>
  );

  return (
    <MotionConfig reducedMotion="user">
      <section className={s.root} aria-labelledby="eb-title">
        <motion.div className={s.stage} variants={stagger} initial={remounted ? false : 'hidden'} animate="show">
          <motion.div className={s.sceneWrap} variants={sceneIn}>
            <TypingScene retrying={retrying} enter={!remounted} />
          </motion.div>

          <motion.div className={s.pill} variants={rise} role="status" aria-live="polite">
            {retrying ? <span className={s.spin} /> : <span className={s.dot} />}
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={retrying ? 'retrying' : 'status'}
                className={s.pillText}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.22, ease: EASE }}
              >
                {t(retrying ? 'errorBoundary.retrying' : 'errorBoundary.status')}
              </motion.span>
            </AnimatePresence>
          </motion.div>

          <motion.h1 id="eb-title" className={s.title} variants={words}>
            {/* Пробел снаружи слова: в конце inline-block он схлопнулся бы */}
            {t('errorBoundary.title').split(' ').map((w, i) => (
              <Fragment key={i}>
                {i > 0 && ' '}
                <span className={s.word}>
                  <motion.span className={s.wordInner} variants={word}>{w}</motion.span>
                </span>
              </Fragment>
            ))}
          </motion.h1>

          <motion.p className={s.desc} variants={rise}>
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={again ? 'again' : 'first'}
                className={s.pillText}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.25, ease: EASE }}
              >
                {again ? t('errorBoundary.failedAgain') : description ?? t('errorBoundary.description')}
              </motion.span>
            </AnimatePresence>
          </motion.p>

          <motion.div className={s.actions} variants={rise}>
            {again ? [reloadButton, retryButton] : [retryButton, reloadButton]}
          </motion.div>
        </motion.div>
      </section>
    </MotionConfig>
  );
}
