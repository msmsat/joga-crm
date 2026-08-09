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
    /* На десктопе метка не просто больше — вокруг неё вдвое больше воздуха:
       ровно он и отделяет разделы там, где линий нет. */
    <div className="flex items-baseline justify-between px-5 pb-4 pt-9 dt:pb-6 dt:pt-16">
      <span className="text-[10px] font-extrabold uppercase tracking-[0.22em] text-muted-foreground dt:text-[11px] dt:tracking-[0.26em]">
        {children}
      </span>
      {trailing && (
        <span className="text-[10px] font-bold tabular-nums tracking-[0.14em] text-muted-foreground/70 dt:text-[11px]">
          {trailing}
        </span>
      )}
    </div>
  );
}
