import { icons } from './ProfileIcons';

interface Props {
  message: string | null;
}

export default function Toast({ message }: Props) {
  return (
    <div style={{
      position: 'fixed', bottom: '32px', left: '50%',
      transform: message ? 'translateX(-50%) translateY(0)' : 'translateX(-50%) translateY(20px)',
      opacity: message ? 1 : 0,
      pointerEvents: message ? 'auto' : 'none',
      background: '#111111', color: '#ffffff',
      padding: '12px 20px', borderRadius: '12px',
      fontSize: '12px', fontWeight: 700,
      boxShadow: '0 16px 40px rgba(0, 0, 0, 0.4)',
      transition: 'all 0.4s cubic-bezier(0.34, 1.5, 0.64, 1)',
      zIndex: 9999, display: 'flex', alignItems: 'center', gap: '8px',
    }}>
      <div style={{ color: 'var(--peach)' }}>{icons.check}</div>
      {message}
    </div>
  );
}
