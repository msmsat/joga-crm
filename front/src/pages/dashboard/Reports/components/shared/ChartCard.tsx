import { Card } from '../../../../../components/ui/index';
import { CardHeading } from './CardHeading';

export interface ChartCardProps {
  title: string;
  description?: string;
  formulaKey: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  scopeNote?: string;
}

export function ChartCard({ title, description, formulaKey, actions, children, scopeNote }: ChartCardProps) {
  return (
    <Card padding={28}>
      <CardHeading title={title} description={description} formulaKey={formulaKey} actions={actions} scopeNote={scopeNote} />
      {children}
    </Card>
  );
}
