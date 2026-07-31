export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  icon?: React.ReactNode;
}

export interface SegmentedProps<T extends string> {
  label?: string;
  value: T;
  options: SegmentedOption<T>[];
  onChange: (v: T) => void;
}

// Переключатель из 2–3 взаимоисключающих значений: белая «таблетка» едет под
// активным сегментом. Замена дропдауна там, где вариантов мало и их видно все
// сразу (тип услуги: групповая/индивидуальная).
export function Segmented<T extends string>({ label, value, options, onChange }: SegmentedProps<T>) {
  const idx = Math.max(0, options.findIndex(o => o.value === value));
  const w = 100 / options.length;
  return (
    <div>
      {label && <label className="vk-label">{label}</label>}
      <div className="vk-seg" role="tablist">
        <span className="vk-seg-thumb" style={{ width: `calc(${w}% - 6px)`, left: `calc(${idx * w}% + 3px)` }} />
        {options.map(o => (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={o.value === value}
            onClick={() => onChange(o.value)}
            className={`vk-seg-btn${o.value === value ? ' is-on' : ''}`}
          >
            {o.icon}
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
