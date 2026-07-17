import type { MetricConfig } from '../../types';
import MetricCard from '../ui/MetricCard';

interface Props {
  metrics: MetricConfig[];
  activeMetric: MetricConfig['id'];
  setActiveMetric: (id: MetricConfig['id']) => void;
}

export default function MetricsRow({ metrics, activeMetric, setActiveMetric }: Props) {
  return (
    <div className="grid-4 mb-20">
      {metrics.map((metric) => (
        <MetricCard
          key={metric.id}
          metric={metric}
          isActive={activeMetric === metric.id}
          onSelect={() => setActiveMetric(metric.id)}
        />
      ))}
    </div>
  );
}
