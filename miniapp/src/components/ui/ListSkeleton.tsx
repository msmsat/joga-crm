/**
 * Скелет списка на время загрузки.
 *
 * Вместо крутилки: карточки-заглушки занимают ровно ту же высоту, что реальные,
 * поэтому при появлении данных вёрстка не прыгает (CLS). Пульсация — на opacity,
 * без анимации размеров.
 */
export function ListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-3 px-5">
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
