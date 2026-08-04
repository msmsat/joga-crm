/**
 * Метка раздела. Крошечный кегль с широким трекингом против 27–40px
 * заголовков — контраст масштабов держит иерархию вместо разделительных линий,
 * которых в макете нет ни одной.
 */
export function SectionLabel({
  children,
  trailing,
}: {
  children: React.ReactNode;
  /** Счётчик или действие справа — выравнивается по базовой линии метки. */
  trailing?: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between px-5 pb-4 pt-9">
      <span className="text-[10px] font-extrabold uppercase tracking-[0.22em] text-muted-foreground">
        {children}
      </span>
      {trailing && (
        <span className="text-[10px] font-bold tabular-nums tracking-[0.14em] text-muted-foreground/70">
          {trailing}
        </span>
      )}
    </div>
  );
}
