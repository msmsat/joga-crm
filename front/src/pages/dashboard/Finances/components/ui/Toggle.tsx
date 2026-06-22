export function Toggle({ on, onChange }: { on: boolean; onChange: () => void }) {
  return (
    <div
      onClick={onChange}
      style={{
        width: '44px', height: '24px', borderRadius: '12px', flexShrink: 0,
        background: on ? 'var(--accent)' : 'rgba(26,26,26,0.12)',
        position: 'relative', cursor: 'pointer',
        transition: 'background 0.2s',
        boxShadow: on ? '0 2px 8px rgba(252,174,145,0.35)' : 'none',
      }}
    >
      <div style={{
        position: 'absolute', top: '3px',
        left: on ? '23px' : '3px',
        width: '18px', height: '18px', borderRadius: '50%',
        background: 'white',
        transition: 'left 0.2s cubic-bezier(0.34,1.56,0.64,1)',
        boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
      }} />
    </div>
  );
}
