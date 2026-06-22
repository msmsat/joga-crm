import { Icon } from './NotificationIcons';

export default function MiniCheck({ on, onChange, color }: { on: boolean; onChange: () => void; color?: string }) {
  const c = color || 'var(--peach)';
  return (
    <button
      onClick={onChange}
      style={{
        width: '24px',
        height: '24px',
        borderRadius: '8px',
        border: `1.5px solid ${on ? c : 'rgba(26,26,26,0.15)'}`,
        background: on ? c : '#FDFCFB',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        transition: 'all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1)',
        transform: on ? 'scale(1.05)' : 'scale(1)',
        boxShadow: on ? `0 4px 12px ${c}40` : 'inset 0 2px 4px rgba(0,0,0,0.02)',
        flexShrink: 0,
        padding: 0,
      }}
    >
      {on && (
        <span style={{ color: '#fff', lineHeight: 1 }}>
          <Icon.Check />
        </span>
      )}
    </button>
  );
}
