import type { CoffeeSpot } from '../../api/lessons';

type Props = {
  spots: CoffeeSpot[];
  /** Заголовок над списком: в шите тёплый, в полоске служебный. */
  title: string;
  /** `sheet` — приглашение после записи, `strip` — карточка занятия. */
  tone?: 'sheet' | 'strip';
};

/**
 * Места, которые советует студия.
 *
 * Один компонент на обе поверхности намеренно. Здесь живёт проверка схемы
 * ссылки, а она обязана быть ровно в одном месте: копию рано или поздно
 * поправят только в одном файле, и `javascript:` из старой записи уедет в
 * webview клиента.
 *
 * Порога тут нет: список приходит с сервера по каждому занятию с бронью, даже
 * когда не согласился ещё никто. Приглашение должно звать в названное место.
 */
export default function CoffeeSpots({ spots, title, tone = 'strip' }: Props) {
  if (spots.length === 0) return null;

  const isSheet = tone === 'sheet';

  return (
    <div className={isSheet ? 'w-full' : ''}>
      <div
        className={`text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground ${
          isSheet ? 'text-center' : ''
        }`}
      >
        {title}
      </div>

      <div className={`mt-1.5 flex flex-col gap-1 ${isSheet ? 'items-center' : ''}`}>
        {spots.map((spot, i) => {
          const label = (
            <>
              <span className="font-extrabold text-card-foreground">{spot.name}</span>
              {spot.address && <span className="text-muted-foreground"> · {spot.address}</span>}
            </>
          );

          // Схему проверяет и сервер (CoffeeSpotInput.validate_url), но места,
          // сохранённые до этой проверки, уже лежат в БД — а href с
          // `javascript:` исполняется в webview клиента.
          const safeUrl = /^https?:\/\//i.test(spot.url ?? '') ? spot.url : null;
          const size = isSheet ? 'text-[12.5px]' : 'text-[12px]';

          return safeUrl ? (
            <a
              key={`${spot.name}-${i}`}
              href={safeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={`${size} underline decoration-brand/40 underline-offset-2`}
            >
              {label}
            </a>
          ) : (
            <span key={`${spot.name}-${i}`} className={size}>
              {label}
            </span>
          );
        })}
      </div>
    </div>
  );
}
