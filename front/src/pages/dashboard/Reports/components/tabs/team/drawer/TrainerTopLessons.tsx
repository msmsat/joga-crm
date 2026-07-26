import { useTranslation } from 'react-i18next';
import { motion, useReducedMotion } from 'framer-motion';
import { EmptyState, InfoHint } from '../../../../../../../components/ui/index';
import { ProgressBar } from '../../../ProgressBar';
import type { TrainerTopLesson } from '../../../../types';

export interface TrainerTopLessonsProps {
  lessons: TrainerTopLesson[];
}

const EASE: [number, number, number, number] = [0.34, 1.1, 0.64, 1];

export function TrainerTopLessons({ lessons }: TrainerTopLessonsProps) {
  const { t } = useTranslation('reports');
  const reduceMotion = !!useReducedMotion();

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
        <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text)' }}>{t('team.drawer.topLessons')}</span>
        <InfoHint title={t('formulas.lessonRevenue.title')} text={t('formulas.lessonRevenue.text')} />
      </div>

      {lessons.length === 0 ? (
        <EmptyState size="sm" icon="calendar" title={t('empty.noTrainerLessons')} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {lessons.map((lesson, i) => (
            <motion.div
              key={lesson.name}
              initial={reduceMotion ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: reduceMotion ? 0 : Math.min(i * 0.04, 0.3), duration: 0.24, ease: EASE }}
              style={{ padding: '10px 12px', borderRadius: '12px', background: 'rgba(26,26,26,0.025)' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text2)' }}>{lesson.name}</span>
                <span style={{ fontSize: '12px', color: 'var(--text3)' }}>
                  {t('team.drawer.held')}: {lesson.held} · {t('team.drawer.attendance')}: {lesson.attendance}
                </span>
              </div>
              <ProgressBar value={lesson.fill_pct} height={6} />
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
