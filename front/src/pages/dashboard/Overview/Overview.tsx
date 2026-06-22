import { useDashboardChart } from './hooks/useDashboardChart';
import MetricsRow from './components/widgets/MetricsRow';
import AnalyticsChart from './components/widgets/AnalyticsChart';
import TodayTasksWidget from './components/widgets/TodayTasksWidget';
import RecentEventsBoard from './components/widgets/RecentEventsBoard';
import SummaryWidgets from './components/widgets/SummaryWidgets';
import { METRICS, RECENT_EVENTS, TASKS, svcs, trainers } from './constants';

export default function Overview() {
  const chart = useDashboardChart();

  return (
    <>
      <MetricsRow
        metrics={METRICS}
        activeMetric={chart.activeMetric}
        setActiveMetric={chart.setActiveMetric}
      />

      <div className="grid-2 mb-20">
        <AnalyticsChart
          activeConfig={chart.activeConfig}
          period={chart.period}
          setPeriod={chart.setPeriod}
          labels={chart.labels}
          vals={chart.vals}
          periodLabel={chart.periodLabel}
          periodSubLabel={chart.periodSubLabel}
        />
        <TodayTasksWidget tasks={TASKS} />
      </div>

      <RecentEventsBoard events={RECENT_EVENTS} />

      <SummaryWidgets svcs={svcs} trainers={trainers} />
    </>
  );
}
