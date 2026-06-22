interface Props {
  svcs: [string, number, string][];
  trainers: [string, string, number][];
}

export default function SummaryWidgets({ svcs, trainers }: Props) {
  return (
    <div className="grid-3">
      <div className="card card-sm">
        <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '12px' }}>Топ услуги</div>
        <div>
          {svcs.map(([n, p, c], i) => (
            <div key={i} style={{ marginBottom: '10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '3px' }}>
                <span>{n}</span><span style={{ fontWeight: 700 }}>{p}%</span>
              </div>
              <div style={{ height: '4px', background: 'rgba(0,0,0,0.05)', borderRadius: '4px' }}>
                <div style={{ width: `${p}%`, height: '100%', background: c, borderRadius: '4px', transition: 'width 1s' }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="card card-sm">
        <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '12px' }}>Нагрузка тренеров</div>
        <div>
          {trainers.map(([n, c, p], i) => (
            <div key={i} style={{ marginBottom: '10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '3px' }}>
                <span>{n}</span><span style={{ fontWeight: 700 }}>{p}%</span>
              </div>
              <div style={{ height: '4px', background: 'rgba(0,0,0,0.05)', borderRadius: '4px' }}>
                <div style={{ width: `${p}%`, height: '100%', background: c, borderRadius: '4px' }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="card card-sm">
        <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '12px' }}>Кассы (сегодня)</div>
        <div style={{ marginBottom: '8px' }}>
          <div style={{ fontSize: '11px', color: 'var(--text3)', marginBottom: '2px' }}>Основная касса</div>
          <div style={{ fontSize: '22px', fontWeight: 800 }}>₽48 200</div>
        </div>
        <div style={{ height: '1px', background: 'var(--border)', margin: '8px 0' }} />
        <div style={{ marginBottom: '6px' }}>
          <div style={{ fontSize: '11px', color: 'var(--text3)', marginBottom: '2px' }}>Безналичный расчёт</div>
          <div style={{ fontSize: '16px', fontWeight: 700 }}>₽82 400</div>
        </div>
        <div style={{ marginBottom: '6px' }}>
          <div style={{ fontSize: '11px', color: 'var(--text3)', marginBottom: '2px' }}>Онлайн платежи</div>
          <div style={{ fontSize: '16px', fontWeight: 700 }}>₽34 100</div>
        </div>
        <div style={{ height: '1px', background: 'var(--border)', margin: '8px 0' }} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: '12px', color: 'var(--text3)' }}>Итого за день</div>
          <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--accent2)' }}>₽164 700</div>
        </div>
      </div>
    </div>
  );
}
