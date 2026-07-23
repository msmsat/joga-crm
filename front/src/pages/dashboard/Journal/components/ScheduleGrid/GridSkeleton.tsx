// Скелетон первой загрузки Журнала: колонки-плейсхолдеры вместо голой сетки,
// пока кэш Query пуст (тренеры/залы/занятия ещё не пришли). Повторные заходы
// и листание дней (keepPreviousData в useSchedule) скелетон не показывают.
export function GridSkeleton({ columns = 4 }: { columns?: number }) {
  return (
    <div className="j-grid j-skel-grid" style={{ gridTemplateColumns: `56px repeat(${columns}, minmax(170px, 1fr))` }}>
      <div className="j-top-left-corner" />
      {Array.from({ length: columns }).map((_, ci) => (
        <div key={ci} className="j-col-header" style={{ display: 'flex', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%' }}>
            <div className="j-skel j-skel-avatar" />
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div className="j-skel j-skel-line" style={{ width: '70%' }} />
              <div className="j-skel j-skel-line" style={{ width: '45%' }} />
            </div>
          </div>
        </div>
      ))}
      <div className="j-time-cell" />
      {Array.from({ length: columns }).map((_, ci) => (
        <div key={ci} className="j-skel-col">
          <div className="j-skel j-skel-card" style={{ top: 12, height: 64 }} />
          <div className="j-skel j-skel-card" style={{ top: 96, height: 96 }} />
          <div className="j-skel j-skel-card" style={{ top: 216, height: 48 }} />
        </div>
      ))}
    </div>
  );
}
