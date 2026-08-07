interface Props {
  on: boolean;
  onChange: () => void;
  disabled?: boolean;
  // Пропускать указатель насквозь: выключенная кнопка не шлёт события мыши и
  // «съедает» hover у родителя, из-за чего не появился бы ни тултип обёртки, ни
  // клик по строке канала (ChannelsSidebar). Только для НАВСЕГДА заблокированного
  // тумблера — на время сохранения этого делать нельзя, иначе случайный второй
  // клик уходил бы в строку и открывал модалку.
  pointerThrough?: boolean;
  'aria-label'?: string;
}

export default function ToggleSwitch({
  on, onChange, disabled, pointerThrough, 'aria-label': ariaLabel,
}: Props) {
  return (
    <button
      type="button"
      onClick={e => {
        e.stopPropagation();
        onChange();
      }}
      disabled={disabled}
      style={{
        position: 'relative',
        width: '40px',
        height: '22px',
        borderRadius: '11px',
        border: 'none',
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.6 : 1,
        pointerEvents: pointerThrough ? 'none' : undefined,
        background: on ? 'var(--peach)' : '#E5E3DF',
        transition: 'background 0.25s cubic-bezier(0.4,0,0.2,1)',
        flexShrink: 0,
        padding: 0,
      }}
      aria-checked={on}
      aria-label={ariaLabel}
      role="switch"
    >
      <span style={{
        position: 'absolute',
        top: '3px',
        left: on ? '21px' : '3px',
        width: '16px',
        height: '16px',
        borderRadius: '50%',
        background: 'var(--bg-card)',
        transition: 'left 0.25s cubic-bezier(0.4,0,0.2,1)',
        boxShadow: '0 1px 4px rgba(0,0,0,0.18)',
      }} />
    </button>
  );
}
