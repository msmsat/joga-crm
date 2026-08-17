/**
 * Метка раздела. Крошечный кегль с широким трекингом против 27–40px
 * заголовков — контраст масштабов держит иерархию вместо разделительных линий,
 * которых в макете нет ни одной.
 */
export function SectionLabel({
  children,
  trailing,
  hint,
}: {
  children: React.ReactNode;
  /** Счётчик или действие справа — выравнивается по базовой линии метки. */
  trailing?: React.ReactNode;
  /**
   * Одна строка под меткой: что это за раздел. Нужна там, где название само
   * себя не объясняет («Депозит», «Персональные скидки»), — тогда объяснение
   * стоит перед карточками, а не прячется за тапом.
   */
  hint?: React.ReactNode;
}) {
  return (
    /* На десктопе метка не просто больше — вокруг неё вдвое больше воздуха:
       ровно он и отделяет разделы там, где линий нет. */
    <div className={`px-5 pt-9 dt:pt-16 ${hint ? 'pb-3 dt:pb-4' : 'pb-4 dt:pb-6'}`}>
      <div className="flex items-baseline justify-between">
        <span className="text-[10px] font-extrabold uppercase tracking-[0.22em] text-muted-foreground dt:text-[11px] dt:tracking-[0.26em]">
          {children}
        </span>
        {trailing && (
          <span className="text-[10px] font-bold tabular-nums tracking-[0.14em] text-muted-foreground/70 dt:text-[11px]">
            {trailing}
          </span>
        )}
      </div>
      {hint && (
        <p className="mt-2 max-w-[46ch] text-[12px] font-medium leading-[1.45] text-muted-foreground/85 dt:text-[12.5px]">
          {hint}
        </p>
      )}
    </div>
  );
}
