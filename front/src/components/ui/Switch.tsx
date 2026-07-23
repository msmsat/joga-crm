export interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

// Тумблер кита: капсула 40×22, персиковая заливка во включённом состоянии,
// белая точка скользит по transition. Замена самодельных <button role="switch">.
export function Switch({ checked, onChange, disabled }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      style={{
        position: 'relative', width: '40px', height: '22px', borderRadius: '11px',
        border: 'none', cursor: disabled ? 'not-allowed' : 'pointer',
        background: checked ? 'var(--peach, #F9A08B)' : '#E5E3DF',
        opacity: disabled ? 0.5 : 1,
        transition: 'background 0.25s', flexShrink: 0, padding: 0,
      }}
    >
      <span style={{
        position: 'absolute', top: '3px', left: checked ? '21px' : '3px',
        width: '16px', height: '16px', borderRadius: '50%', background: '#fff',
        transition: 'left 0.25s', boxShadow: '0 1px 4px rgba(0,0,0,0.18)',
      }}/>
    </button>
  );
}
