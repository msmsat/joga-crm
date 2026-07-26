import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useOverviewData } from './hooks/useOverviewData';
import MetricsRow from './components/widgets/MetricsRow';
import AnalyticsChart from './components/widgets/AnalyticsChart';
import TasksWidget from './components/widgets/TasksWidget';
import RecentEventsBoard from './components/widgets/RecentEventsBoard';
import SummaryWidgets from './components/widgets/SummaryWidgets';
import { errorMessage } from '../../../api/errorMessage';
import { Button, EmptyState, useToast } from '../../../components/ui/index';

export default function Overview() {
  const { t } = useTranslation('dashboard');
  const d = useOverviewData();
  const toast = useToast();
  const canSeeStudioData = !d.forbidden; // owner-only срезы (финансы, аналитика студии)
  const studioDataError = canSeeStudioData && d.isFirstLoadError;

  // Фоновая ошибка (данные в кэше уже есть — экран остаётся, refetch просто не
  // удался): не ломаем экран, только тост. Первую загрузку ловит EmptyState ниже.
  const prevLoadErrorRef = useRef<unknown>(null);
  useEffect(() => {
    if (d.loadError && d.loadError !== prevLoadErrorRef.current && !d.isFirstLoadError) {
      toast.error(errorMessage(d.loadError, t));
    }
    prevLoadErrorRef.current = d.loadError;
  }, [d.loadError, d.isFirstLoadError, toast, t]);

  return (
    <>
      {canSeeStudioData && !studioDataError && (
        <MetricsRow
          metrics={d.metrics}
          activeMetric={d.activeMetric}
          setActiveMetric={d.setActiveMetric}
          loading={d.summaryLoading}
        />
      )}

      <div className="grid-2 mb-20">
        {!canSeeStudioData ? (
          <div className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', color: 'var(--text3)', fontSize: 14 }}>
            {t('state.ownerOnly')}
          </div>
        ) : studioDataError ? (
          <div className="card">
            <EmptyState
              size="sm"
              icon="chart"
              title={t('state.loadError')}
              text={errorMessage(d.loadError, t)}
              action={<Button size="sm" onClick={d.refetchAll}>{t('state.retry')}</Button>}
            />
          </div>
        ) : (
          <AnalyticsChart
            activeConfig={d.activeConfig}
            period={d.period}
            setPeriod={d.setPeriod}
            series={d.series}
            currencySymbol={d.currencySymbol}
          />
        )}
        {/* Виджет задач доступен всем ролям — своя RBAC-фильтрация внутри (D2/D4) */}
        <TasksWidget />
      </div>

      {canSeeStudioData && !studioDataError && <RecentEventsBoard events={d.events} />}

      {canSeeStudioData && !studioDataError && (
        <SummaryWidgets
          services={d.services}
          trainers={d.trainers}
          summary={d.summary}
          currencySymbol={d.currencySymbol}
          loading={d.widgetsLoading}
        />
      )}
    </>
  );
}
