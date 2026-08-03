import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { scheduleApi } from '../../../../../api/schedule';
import { queryKeys } from '../../../../../api/queryKeys';
import { Button, EmptyState } from '../../../../../components/ui/index';
import { toDateStr } from '../../../Journal/utils';
import styles from '../../Overview.module.css';
import type { StudioRole } from '../../../../../api/analytics';

// Занятия дня на месте графика: график студии — владельцу, админу и тренеру —
// то, ради чего они вообще заходят в CRM утром. Своего эндпоинта не нужно —
// GET /schedule/lessons уже сужен ролью на сервере (тренер видит только свои).

const hhmm = (iso: string) => iso.slice(11, 16);

interface Props {
  role: StudioRole;
}

export default function TodayLessons({ role }: Props) {
  const { t } = useTranslation('dashboard');
  const navigate = useNavigate();
  const day = toDateStr(new Date());

  const { data, isPending } = useQuery({
    queryKey: queryKeys.overviewToday(day),
    queryFn: () => scheduleApi.getLessons({ date_from: day, date_to: day }),
    refetchInterval: 60_000,   // записываются в течение дня — как сетка Журнала
  });

  const lessons = (data ?? []).filter(l => l.status !== 'cancelled');
  const spots = lessons.reduce((sum, l) => sum + l.total_spots, 0);
  const booked = lessons.reduce((sum, l) => sum + l.booked_count, 0);

  return (
    <div
      className="card"
      style={{
        padding: 0, display: 'flex', flexDirection: 'column',
        height: '400px', overflow: 'hidden',
        border: '1px solid var(--border2)', boxShadow: 'var(--dash-shadow-lg)',
      }}
    >
      <div style={{
        padding: '20px 24px 16px', borderBottom: '1px solid var(--border2)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexShrink: 0,
      }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--onyx)', letterSpacing: '-0.3px' }}>
            {t(role === 'trainer' ? 'today.titleTrainer' : 'today.titleAdmin')}
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2, fontWeight: 500 }}>
            {t('today.subtitle', { count: lessons.length, booked, spots })}
          </div>
        </div>
        <Button size="sm" variant="ghost" onClick={() => navigate('/dashboard/journal')}>
          {t('today.openJournal')}
        </Button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
        {isPending ? (
          [0, 1, 2, 3].map(i => (
            <div key={i} className={styles.skel} style={{ height: '44px', marginBottom: '6px' }} />
          ))
        ) : lessons.length === 0 ? (
          <EmptyState
            size="sm"
            icon="calendar"
            title={t('today.empty')}
            text={t(role === 'trainer' ? 'today.emptyHintTrainer' : 'today.emptyHintAdmin')}
          />
        ) : (
          lessons.map(lesson => {
            const full = lesson.booked_count >= lesson.total_spots;
            return (
              <div
                key={lesson.id}
                className={styles.taskRow}
                onClick={() => navigate('/dashboard/journal')}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '9px 10px', cursor: 'pointer',
                }}
              >
                {/* Цвет услуги — та же метка, что и в сетке Журнала: занятие
                    узнаётся по полоске, а не по перечитыванию названия. */}
                <span style={{
                  width: 3, alignSelf: 'stretch', borderRadius: 3, flexShrink: 0,
                  background: lesson.service_color ?? 'var(--peach)',
                }} />
                <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--onyx)', minWidth: 42 }}>
                  {hhmm(lesson.start_time)}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 13, fontWeight: 600, color: 'var(--onyx)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {lesson.name}
                  </div>
                  {/* Тренеру своё имя в каждой строке ни к чему — оно и так его. */}
                  {role !== 'trainer' && lesson.teacher_name && (
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1 }}>
                      {lesson.teacher_name}
                    </div>
                  )}
                </div>
                <span style={{
                  fontSize: 12, fontWeight: 700, flexShrink: 0,
                  color: full ? 'var(--accent2)' : 'var(--muted)',
                }}>
                  {lesson.booked_count}/{lesson.total_spots}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
