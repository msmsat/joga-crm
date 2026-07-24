import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AreaChart, Area, BarChart, Bar, LabelList, XAxis, YAxis, Tooltip } from 'recharts';
import { ModalShell, ModalHeader, ModalBody, EmptyState, GhostButton, InfoHint } from '../../../../../../components/ui/index';
import { analyticsApi } from '../../../../../../api/analytics/analytics.api';
import { queryKeys } from '../../../../../../api/queryKeys';
import { fmtMoney, fmtInt, fmtPct } from '../../../../../../lib/format';
import { ProgressBar } from '../../ProgressBar';
import { ChartFrame } from '../../shared/ChartFrame';
import { AXIS_X, TOOLTIP_STYLE, BAR_CURSOR, LINE_CURSOR, BLUE } from '../../shared/chartTheme';
import { ZeroLabel } from '../../shared/ZeroLabel';
import { zeroAwareCells } from '../../shared/zeroAwareCells';
import type { ReportFiltersParams, TrainerRow } from '../../../types';

export interface TrainerDrawerProps {
  trainer: TrainerRow;
  params: ReportFiltersParams;
  paramsKey: string;
  onClose: () => void;
}

const StarIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="#f0c040" stroke="#f0c040" strokeWidth="1.5">
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
  </svg>
);

function fmtWeek(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${d}.${m}`;
}

export function TrainerDrawer({ trainer, params, paramsKey, onClose }: TrainerDrawerProps) {
  const { t } = useTranslation('reports');
  const navigate = useNavigate();

  const { data, isFetching } = useQuery({
    queryKey: queryKeys.report('team-trainer', `${trainer.trainer_id}-${paramsKey}`),
    queryFn: () => analyticsApi.getTrainerDetail(trainer.trainer_id, params),
    placeholderData: prev => prev,
  });

  const weekdayLabels: string[] = t('team.weekdays', { returnObjects: true }) as string[];
  const loadData = (data?.load_by_weekday ?? []).map(p => ({ ...p, label: weekdayLabels[p.weekday] ?? p.weekday }));
  const revenueData = (data?.revenue_series ?? []).map(p => ({ period: p.period, label: fmtWeek(p.period), value: p.value }));

  return (
    <ModalShell onClose={onClose} size="lg" left={
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <div style={{ fontSize: '18px', fontWeight: 900, color: 'var(--text)', letterSpacing: '-0.3px' }}>
          {trainer.name}
        </div>
        {trainer.rating != null && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '6px' }}>
            <StarIcon /><span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text2)' }}>{trainer.rating.toFixed(1)}</span>
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '28px' }}>
          {[
            { label: t('team.table.lessons'), val: fmtInt(trainer.lessons) },
            { label: t('team.table.revenue'), val: fmtMoney(trainer.revenue) },
            { label: t('team.table.returnRate'), val: fmtPct(trainer.return_rate_pct) },
            { label: t('team.table.fillPct'), val: `${Math.round(trainer.fill_pct)}%` },
          ].map(({ label, val }) => (
            <div key={label}>
              <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                {label}
              </div>
              <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text)', marginTop: '2px' }}>{val}</div>
            </div>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        <GhostButton onClick={() => navigate(`/dashboard/staff?staff=${trainer.trainer_id}`)}>
          {t('team.drawer.openProfile')}
        </GhostButton>
      </div>
    }>
      <ModalHeader title={trainer.name} />
      <ModalBody>
        {isFetching && !data ? (
          <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text3)' }}>{t('table.loading')}</div>
        ) : (
          <>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
                <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text)' }}>{t('team.drawer.revenueByWeek')}</span>
                <InfoHint title={t('formulas.revenuePerHour.title')} text={t('formulas.revenuePerHour.text')} />
              </div>
              <ChartFrame height={160}>
                <AreaChart data={revenueData}>
                  <XAxis dataKey="label" {...AXIS_X} />
                  <YAxis hide />
                  <Tooltip formatter={(v) => fmtMoney(Number(v))} contentStyle={TOOLTIP_STYLE} cursor={LINE_CURSOR} />
                  <defs>
                    <linearGradient id="trainerRevGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#FCAE91" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="#FCAE91" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <Area type="monotone" dataKey="value" stroke="#FCAE91" strokeWidth={2.5} fill="url(#trainerRevGrad)" />
                </AreaChart>
              </ChartFrame>
            </div>

            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
                <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text)' }}>{t('team.drawer.loadByWeekday')}</span>
                <InfoHint title={t('formulas.occupancy.title')} text={t('formulas.occupancy.text')} />
              </div>
              <ChartFrame height={140}>
                <BarChart data={loadData}>
                  <XAxis dataKey="label" {...AXIS_X} />
                  <YAxis hide />
                  <Tooltip formatter={(v) => `${v}%`} contentStyle={TOOLTIP_STYLE} cursor={BAR_CURSOR} />
                  <Bar dataKey="fill_pct" fill={BLUE} radius={[6, 6, 0, 0]} maxBarSize={28} minPointSize={3} activeBar={false}>
                    <LabelList dataKey="fill_pct" position="top" content={ZeroLabel} />
                    {zeroAwareCells(loadData, 'fill_pct', BLUE)}
                  </Bar>
                </BarChart>
              </ChartFrame>
            </div>

            <div>
              <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text)', marginBottom: '10px' }}>
                {t('team.drawer.topLessons')}
              </div>
              {(data?.top_lessons ?? []).length === 0 ? (
                <EmptyState size="sm" icon="calendar" title={t('empty.noTrainerLessons')} />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {data!.top_lessons.map((lesson) => (
                    <div key={lesson.name}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                        <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text2)' }}>{lesson.name}</span>
                        <span style={{ fontSize: '12px', color: 'var(--text3)' }}>
                          {t('team.drawer.held')}: {lesson.held} · {t('team.drawer.attendance')}: {lesson.attendance}
                        </span>
                      </div>
                      <ProgressBar value={lesson.fill_pct} height={6} />
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ padding: '14px 16px', borderRadius: '12px', background: 'rgba(26,26,26,0.025)' }}>
              <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.3px', marginBottom: '6px' }}>
                {t('team.drawer.returnBlock')}
              </div>
              <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text)' }}>
                {t('team.drawer.returnOf', {
                  returned: data?.returned_clients ?? 0,
                  total: data?.total_clients ?? 0,
                  pct: data?.return_rate_pct ?? 0,
                })}
              </div>
            </div>
          </>
        )}
      </ModalBody>
    </ModalShell>
  );
}
