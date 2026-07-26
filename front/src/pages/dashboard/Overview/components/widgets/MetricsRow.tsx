import type { MetricConfig } from '../../types';
import MetricCard from '../ui/MetricCard';

interface Props {
  metrics: MetricConfig[];
  activeMetric: MetricConfig['id'];
  setActiveMetric: (id: MetricConfig['id']) => void;
  loading?: boolean;
}

export default function MetricsRow({ metrics, activeMetric, setActiveMetric, loading }: Props) {
  return (
    <div className="grid-4 mb-20">
      {metrics.map((metric) => (
        <MetricCard
          key={metric.id}
          metric={metric}
          isActive={activeMetric === metric.id}
          onSelect={() => setActiveMetric(metric.id)}
          loading={loading}
        />
      ))}
    </div>
  );
}
