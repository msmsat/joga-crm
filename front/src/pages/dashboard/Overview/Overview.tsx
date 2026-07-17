import { useOverviewData } from './hooks/useOverviewData';
import MetricsRow from './components/widgets/MetricsRow';
import AnalyticsChart from './components/widgets/AnalyticsChart';
import TodayTasksWidget from './components/widgets/TodayTasksWidget';
import RecentEventsBoard from './components/widgets/RecentEventsBoard';
import SummaryWidgets from './components/widgets/SummaryWidgets';

export default function Overview() {
  const d = useOverviewData();

  if (d.loading) {
    return (
      <div style={{ padding: 48, textAlign: 'center', color: 'var(--text3)', fontSize: 14 }}>
        Загрузка данных…
      </div>
    );
  }

  if (d.forbidden) {
    return (
      <div style={{ padding: 48, textAlign: 'center', color: 'var(--text3)', fontSize: 14 }}>
        Обзор студии доступен только владельцу.
      </div>
    );
  }

  return (
    <>
      <MetricsRow
        metrics={d.metrics}
        activeMetric={d.activeMetric}
        setActiveMetric={d.setActiveMetric}
      />

      <div className="grid-2 mb-20">
        <AnalyticsChart
          activeConfig={d.activeConfig}
          period={d.period}
          setPeriod={d.setPeriod}
          series={d.series}
        />
        <TodayTasksWidget tasks={d.tasks} setTasks={d.setTasks} />
      </div>

      <RecentEventsBoard events={d.events} />

      <SummaryWidgets services={d.services} trainers={d.trainers} summary={d.summary} />
    </>
  );
}
