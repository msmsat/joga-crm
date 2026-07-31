import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { EmptyState } from '../../../../../../../components/ui/index';
import { scheduleApi } from '../../../../../../../api/schedule';
import { queryKeys } from '../../../../../../../api/queryKeys';
import { fmtBucket } from '../../../../../../../lib/format';
import { LESSON_STATUS_STYLE } from '../../../shared/chartTheme';
import type { ReportFiltersParams } from '../../../../types';

export interface TrainerScheduleProps {
  trainerId: number;
  params: ReportFiltersParams;
}

export function TrainerSchedule({ trainerId, params }: TrainerScheduleProps) {
  const { t } = useTranslation('reports');

  // Тот же ключ, что у KPI-дрилдауна «Записи» (TeamTab) и Обзора: если один из
  // них уже загрузил занятия периода, второй GET /schedule/lessons не летит.
  // hall_id — только если фильтр реально активен, чтобы не отличаться от общего
  // ключа journalLessons(from, to) в частом случае «фильтра нет».
  const lessonsKey = params.hall_id
    ? [...queryKeys.journalLessons(params.date_from, params.date_to), params.hall_id]
    : queryKeys.journalLessons(params.date_from, params.date_to);
  const { data: allLessons } = useQuery({
    queryKey: lessonsKey,
    queryFn: () => scheduleApi.getLessons({ date_from: params.date_from, date_to: params.date_to, hall_id: params.hall_id }),
  });
  const { data: halls } = useQuery({ queryKey: queryKeys.halls, queryFn: () => scheduleApi.getHalls() });
  const hallById = new Map((halls ?? []).map(h => [h.id, h]));

  const lessons = (allLessons ?? [])
    .filter(l => l.teacher_id === trainerId)
    .sort((a, b) => a.start_time.localeCompare(b.start_time));

  return (
    <div>
      <div style={{ marginBottom: '10px' }}>
        <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text)' }}>{t('team.drawer.schedule.title')}</span>
        <p style={{ fontSize: '11.5px', lineHeight: 1.4, color: 'var(--text3)', margin: '3px 0 0' }}>{t('descriptions.team.schedule')}</p>
      </div>

      {lessons.length === 0 ? (
        <EmptyState size="sm" icon="calendar" title={t('team.drawer.schedule.empty')} />
      ) : (
        <div
          className="ms-scroll"
          style={{ maxHeight: '320px', overflowY: 'auto', paddingRight: '4px', display: 'flex', flexDirection: 'column', gap: '6px' }}
        >
          {lessons.map(l => {
            const cancelled = l.status === 'cancelled';
            const hall = l.hall_id != null ? hallById.get(l.hall_id) : undefined;
            const style = LESSON_STATUS_STYLE[l.status] ?? { bg: 'rgba(var(--ink),0.05)', fg: 'var(--text2)' };
            return (
              <div
                key={l.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 8px', borderRadius: '8px',
                  opacity: cancelled ? 0.55 : 1,
                }}
              >
                <span style={{ fontSize: '13px', fontVariantNumeric: 'tabular-nums', color: 'var(--text3)', flexShrink: 0, width: '92px' }}>
                  {fmtBucket(l.start_time, 'day')} {fmtBucket(l.start_time, 'hour')}
                </span>
                <span style={{
                  fontSize: '13px', fontWeight: 600, color: 'var(--text)', flex: 1, minWidth: 0,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  textDecoration: cancelled ? 'line-through' : 'none',
                }}>
                  {l.name}
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '12px', color: 'var(--text3)', flexShrink: 0, width: '84px' }}>
                  {hall && <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: hall.color, flexShrink: 0 }} />}
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{hall?.name ?? '—'}</span>
                </span>
                <span style={{ fontSize: '12px', fontVariantNumeric: 'tabular-nums', color: 'var(--text3)', flexShrink: 0, width: '44px', textAlign: 'right' }}>
                  {l.booked_count}/{l.total_spots}
                </span>
                <span style={{
                  padding: '2px 7px', borderRadius: '6px', fontSize: '10.5px', fontWeight: 700,
                  background: style.bg, color: style.fg, whiteSpace: 'nowrap', flexShrink: 0,
                }}>
                  {t(`schedule.status.${l.status}`, l.status)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
