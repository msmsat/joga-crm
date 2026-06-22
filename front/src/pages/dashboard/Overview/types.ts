export interface Task {
  id: number;
  text: string;
  priority: 'high' | 'medium' | 'low';
  tag: string;
}

export interface MetricConfig {
  id: string;
  title: string;
  value: string;
  change: string;
  color: string;
  glow: string;
  route: string;
  formatTooltip: (v: number) => string;
}

export interface RecentEvent {
  id: number;
  type: string;
  actor: string;
  action: string;
  time: string;
  color: string;
}
