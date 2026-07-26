import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion, useReducedMotion } from 'framer-motion';
import { ModalShell, ModalHeader, ModalBody } from '../../../../../../components/ui/index';
import { analyticsApi } from '../../../../../../api/analytics/analytics.api';
import { queryKeys } from '../../../../../../api/queryKeys';
import { RingIndicator } from '../../shared/RingIndicator';
import { TrainerHero } from './drawer/TrainerHero';
import { TrainerCharts } from './drawer/TrainerCharts';
import { TrainerTopLessons } from './drawer/TrainerTopLessons';
import { TrainerSchedule } from './drawer/TrainerSchedule';
import type { ReportFiltersParams, TrainerRow } from '../../../types';

export interface TrainerDrawerProps {
  trainer: TrainerRow;
  params: ReportFiltersParams;
  paramsKey: string;
  onClose: () => void;
}

const EASE: [number, number, number, number] = [0.34, 1.1, 0.64, 1];

function fmtWeek(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${d}.${m}`;
}

export function TrainerDrawer({ trainer, params, paramsKey, onClose }: TrainerDrawerProps) {
  const { t } = useTranslation('reports');
  const navigate = useNavigate();
  const reduceMotion = !!useReducedMotion();

  const { data, isFetching } = useQuery({
    queryKey: queryKeys.report('team-trainer', `${trainer.trainer_id}-${paramsKey}`),
    queryFn: () => analyticsApi.getTrainerDetail(trainer.trainer_id, params),
    placeholderData: prev => prev,
  });

  const weekdayLabels: string[] = t('team.weekdays', { returnObjects: true }) as string[];
  const loadWeekdayData = (data?.load_by_weekday ?? []).map(p => ({ ...p, label: weekdayLabels[p.weekday] ?? String(p.weekday) }));
  const loadHourData = (data?.load_by_hour ?? []).map(p => ({ ...p, label: `${String(p.hour).padStart(2, '0')}:00` }));
  const revenueData = (data?.revenue_series ?? []).map(p => ({ period: p.period, label: fmtWeek(p.period), value: p.value }));

  const fadeIn = (delay: number) => (reduceMotion
    ? {}
    : { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, transition: { delay, duration: 0.28, ease: EASE } });

  return (
    <ModalShell onClose={onClose} size="lg" left={
      <TrainerHero trainer={trainer} onOpenProfile={() => navigate(`/dashboard/staff?staff=${trainer.trainer_id}`)} />
    }>
      <ModalHeader title={trainer.name} />
      <ModalBody>
        {isFetching && !data ? (
          <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text3)' }}>{t('table.loading')}</div>
        ) : (
          <>
            <motion.div {...fadeIn(0.04)}>
              <TrainerCharts revenueData={revenueData} loadWeekdayData={loadWeekdayData} loadHourData={loadHourData} />
            </motion.div>

            <motion.div {...fadeIn(0.08)}>
              <TrainerTopLessons lessons={data?.top_lessons ?? []} />
            </motion.div>

            <motion.div
              {...fadeIn(0.12)}
              style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '14px 16px', borderRadius: '12px', background: 'rgba(26,26,26,0.025)' }}
            >
              <RingIndicator pct={data?.return_rate_pct ?? 0} reduceMotion={reduceMotion} />
              <div>
                <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.3px', marginBottom: '4px' }}>
                  {t('team.drawer.returnBlock')}
                </div>
                <div style={{ fontSize: '13.5px', fontWeight: 700, color: 'var(--text)' }}>
                  {t('team.drawer.returnOf', {
                    returned: data?.returned_clients ?? 0,
                    total: data?.total_clients ?? 0,
                    pct: data?.return_rate_pct ?? 0,
                  })}
                </div>
              </div>
            </motion.div>

            <motion.div {...fadeIn(0.16)}>
              <TrainerSchedule trainerId={trainer.trainer_id} params={params} />
            </motion.div>
          </>
        )}
      </ModalBody>
    </ModalShell>
  );
}
