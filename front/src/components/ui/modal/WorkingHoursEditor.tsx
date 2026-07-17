export interface WorkingHour {
  day_of_week: number;   // 0..6
  is_open: boolean;
  open_time: string;     // "08:00"
  close_time: string;    // "22:00"
}

export interface WorkingHoursEditorProps {
  value: WorkingHour[];              // ровно 7, по возрастанию day_of_week
  onChange: (v: WorkingHour[]) => void;
  dayLabels: string[];               // 7 подписей (i18n от вызывающего), индекс = day_of_week
}

// Редактор рабочих часов: строка на день — тумблер «открыто/выходной» + время
// с/до. Время — нативный input[type=time] (native > кастомный пикер).
export function WorkingHoursEditor({ value, onChange, dayLabels }: WorkingHoursEditorProps) {
  const patch = (day: number, changes: Partial<WorkingHour>) =>
    onChange(value.map(wh => (wh.day_of_week === day ? { ...wh, ...changes } : wh)));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      {value.map(wh => (
        <div key={wh.day_of_week} style={{
          display: 'grid', gridTemplateColumns: '1fr auto auto', alignItems: 'center', gap: '10px',
          padding: '8px 12px', borderRadius: '10px', background: 'rgba(26,26,26,0.02)',
        }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '9px', cursor: 'pointer' }}>
            <span
              role="switch"
              aria-checked={wh.is_open}
              onClick={() => patch(wh.day_of_week, { is_open: !wh.is_open })}
              style={{
                width: '34px', height: '20px', borderRadius: '10px', flexShrink: 0, position: 'relative',
                background: wh.is_open ? '#FCAE91' : 'rgba(26,26,26,0.15)', transition: 'background 0.18s', cursor: 'pointer',
              }}
            >
              <span style={{
                position: 'absolute', top: '2px', left: wh.is_open ? '16px' : '2px',
                width: '16px', height: '16px', borderRadius: '50%', background: '#fff', transition: 'left 0.18s',
                boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
              }} />
            </span>
            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text, #1A1A1A)' }}>
              {dayLabels[wh.day_of_week]}
            </span>
          </label>

          {wh.is_open ? (
            <>
              <TimeInput value={wh.open_time} onChange={v => patch(wh.day_of_week, { open_time: v })} />
              <TimeInput value={wh.close_time} onChange={v => patch(wh.day_of_week, { close_time: v })} />
            </>
          ) : (
            <span style={{ gridColumn: '2 / 4', textAlign: 'right', fontSize: '12px', fontWeight: 600, color: '#BBB' }}>—</span>
          )}
        </div>
      ))}
    </div>
  );
}

function TimeInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input
      type="time"
      value={value}
      onChange={e => onChange(e.target.value)}
      style={{
        padding: '7px 9px', background: 'var(--bg-card, #fff)',
        border: '1.5px solid rgba(26,26,26,0.09)', borderRadius: '8px',
        fontSize: '13px', fontWeight: 600, color: 'var(--text, #1A1A1A)',
        fontFamily: 'Manrope, sans-serif', outline: 'none', cursor: 'pointer',
      }}
    />
  );
}
