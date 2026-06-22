export interface ProgressBarProps {
  value: number;
  color?: string;
  height?: number;
}

export function ProgressBar({ value, color = 'var(--accent)', height = 5 }: ProgressBarProps) {
  return (
    <div style={{ background: 'rgba(26,26,26,0.06)', borderRadius: '99px', height, overflow: 'hidden' }}>
      <div style={{
        width: `${Math.min(Math.max(value, 0), 100)}%`,
        height: '100%',
        background: color,
        borderRadius: '99px',
        transition: 'width 0.8s cubic-bezier(0.34,1.2,0.64,1)',
      }}/>
    </div>
  );
}
