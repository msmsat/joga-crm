import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, EmptyState } from '../../../../../../components/ui/index';
import { CardHeading } from '../../shared/CardHeading';
import type { LossSliceRow } from '../../../types';

export type LossDim = 'hour' | 'service' | 'trainer';
export type LossMetric = 'cancels' | 'noshows';

export const LOSS_SLICES_ID = 'reports-loss-slices';

const DIMS: LossDim[] = ['hour', 'service', 'trainer'];

export interface LossSlicesProps {
  byHour: LossSliceRow[];
  byService: LossSliceRow[];
  byTrainer: LossSliceRow[];
  activeTrainerId: number | null;
  activeServiceId: number | null;
  onHourClick: (hour: number) => void;
  onTrainerClick: (trainerId: number) => void;
  onServiceClick: (serviceId: number) => void;
  /** Внешний сигнал от KPI «Отмены» (задача 5 EPIC R15) — переключает разрез на «По времени». */
  focusDim?: LossDim;
  /** Внешний сигнал от KPI «Отмены»/«No-show» — какая из двух цифр строки выделена цветом. */
  focusMetric?: LossMetric;
}

export function LossSlices({
  byHour, byService, byTrainer, activeTrainerId, activeServiceId, onHourClick, onTrainerClick, onServiceClick,
  focusDim, focusMetric = 'cancels',
}: LossSlicesProps) {
  const { t } = useTranslation('reports');
  const [dim, setDim] = useState<LossDim>('hour');
  const [appliedFocusDim, setAppliedFocusDim] = useState(focusDim);

  // useState остаётся источником истины (клики по табам разреза не должны
  // спорить с пропом) — правим состояние во время рендера, не в useEffect
  // (React не советует синхронный setState в эффекте).
  if (focusDim !== undefined && focusDim !== appliedFocusDim) {
    setAppliedFocusDim(focusDim);
    setDim(focusDim);
  }

  const activeRows: LossSliceRow[] = { hour: byHour, service: byService, trainer: byTrainer }[dim];

  return (
    <Card padding={24} id={LOSS_SLICES_ID} style={{ marginBottom: '20px' }}>
      <CardHeading
        title={t('schedule.losses.title')}
        description={t('descriptions.schedule.losses')}
        formulaKey="losses"
        actions={
          <div style={{ display: 'flex', gap: '4px', background: 'rgba(var(--ink),0.04)', borderRadius: '10px', padding: '3px', flexShrink: 0 }}>
            {DIMS.map(d => (
              <button
                key={d}
                onClick={() => setDim(d)}
                style={{
                  padding: '5px 10px', borderRadius: '8px', border: 'none', cursor: 'pointer',
                  fontSize: '11px', fontWeight: 700, fontFamily: 'var(--font)',
                  background: dim === d ? 'var(--bg-card)' : 'transparent',
                  color: dim === d ? 'var(--text)' : 'var(--text3)',
                  boxShadow: dim === d ? '0 1px 6px rgba(26,26,26,0.1)' : 'none',
                }}
              >
                {t(`schedule.losses.dim.${d}`)}
              </button>
            ))}
          </div>
        }
      />
      {activeRows.length === 0 ? (
        <EmptyState size="sm" icon="calendar" title={t('empty.noLosses')} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {activeRows.map(row => {
            const clickable = dim === 'hour' || row.ref_id != null;
            const isActive = row.ref_id != null && row.ref_id === (dim === 'trainer' ? activeTrainerId : activeServiceId);
            const handleClick = () => {
              if (dim === 'hour') onHourClick(Number(row.key.split(':')[1]));
              else if (dim === 'trainer' && row.ref_id != null) onTrainerClick(row.ref_id);
              else if (dim === 'service' && row.ref_id != null) onServiceClick(row.ref_id);
            };
            const idleBg = isActive ? 'rgba(249,160,139,0.08)' : 'transparent';
            return (
              <div
                key={row.key}
                onClick={clickable ? handleClick : undefined}
                style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px',
                  padding: '4px 6px', margin: '0 -6px', borderRadius: '8px',
                  cursor: clickable ? 'pointer' : 'default', background: idleBg,
                }}
                onMouseEnter={e => { if (clickable) e.currentTarget.style.background = 'rgba(var(--ink),0.03)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = idleBg; }}
              >
                <span style={{
                  fontSize: '13px', fontWeight: 600, color: 'var(--text2)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0,
                }}>
                  {row.label}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexShrink: 0 }}>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: focusMetric === 'cancels' ? '#D88C9A' : 'var(--text3)' }}>
                    {t('schedule.losses.cancels', { count: row.cancels })}
                  </span>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: focusMetric === 'noshows' ? '#D88C9A' : 'var(--text3)' }}>
                    {t('schedule.losses.noshows', { count: row.noshows })}
                  </span>
                  <span style={{
                    fontSize: '13px', fontWeight: 800, color: 'var(--text)',
                    fontVariantNumeric: 'tabular-nums', minWidth: '68px', textAlign: 'right',
                  }}>
                    {t('schedule.losses.lostSpots', { count: row.lost_spots })}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
