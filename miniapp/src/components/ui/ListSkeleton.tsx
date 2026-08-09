/**
 * Скелет списка на время загрузки.
 *
 * Вместо крутилки: карточки-заглушки занимают ровно ту же высоту, что реальные,
 * поэтому при появлении данных вёрстка не прыгает (CLS). Пульсация — на opacity,
 * без анимации размеров.
 */
export function ListSkeleton({
  rows = 3,
  flush = false,
  wide = false,
}: {
  rows?: number;
  /** Внутри листа отступы уже заданы снаружи — свои добавлять нельзя. */
  flush?: boolean;
  /**
   * Список, который на десктопе идёт в две колонки. Заглушка обязана повторять
   * ту же сетку, иначе смысл скелета теряется: вёрстка всё равно прыгнет, когда
   * одна колонка превратится в две.
   */
  wide?: boolean;
}) {
  return (
    <div
      className={`flex flex-col gap-3 ${flush ? '' : 'px-5'} ${
        wide ? 'dt:grid dt:grid-cols-2 dt:gap-4' : ''
      }`}
    >
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="h-[118px] animate-pulse rounded-[22px] bg-card shadow-soft"
          style={{ animationDelay: `${i * 120}ms` }}
        />
      ))}
    </div>
  );
}
