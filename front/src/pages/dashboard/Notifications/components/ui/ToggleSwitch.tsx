export default function ToggleSwitch({ on, onChange }: { on: boolean; onChange: () => void }) {
  return (
    <button
      onClick={onChange}
      style={{
        position: 'relative',
        width: '40px',
        height: '22px',
        borderRadius: '11px',
        border: 'none',
        cursor: 'pointer',
        background: on ? 'var(--peach)' : '#E5E3DF',
        transition: 'background 0.25s cubic-bezier(0.4,0,0.2,1)',
        flexShrink: 0,
        padding: 0,
      }}
      aria-checked={on}
      role="switch"
    >
      <span style={{
        position: 'absolute',
        top: '3px',
        left: on ? '21px' : '3px',
        width: '16px',
        height: '16px',
        borderRadius: '50%',
        background: '#fff',
        transition: 'left 0.25s cubic-bezier(0.4,0,0.2,1)',
        boxShadow: '0 1px 4px rgba(0,0,0,0.18)',
      }} />
    </button>
  );
}
