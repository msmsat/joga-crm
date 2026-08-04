import { motion } from 'framer-motion';

/**
 * Шапка внутреннего экрана.
 *
 * Три яруса вместо двух: строка-надзаголовок с персиковой точкой и действием
 * справа, под ней крупный заголовок. Точка — тот же знак, что стоит у логотипа
 * на главной, он связывает экраны в один продукт.
 *
 * Заголовок набран 36px с трекингом −0.04em: на таком кегле дефолтные просветы
 * между буквами выглядят рыхло, плотная посадка и есть та самая «дорогая»
 * типографика.
 */
export function ScreenHeader({
  title,
  kicker,
  action,
}: {
  title: string;
  kicker?: string;
  /** Кнопка справа в строке надзаголовка */
  action?: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
      className="pt-safe px-5"
    >
      <div className="flex min-h-[34px] items-center justify-between gap-3 pt-8">
        {kicker ? (
          <div className="flex min-w-0 items-center gap-2">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
            <span className="truncate text-[10px] font-extrabold uppercase tracking-[0.24em] text-muted-foreground">
              {kicker}
            </span>
          </div>
        ) : (
          <span />
        )}
        {action}
      </div>

      <h1 className="mt-3.5 text-[36px] font-extrabold leading-[0.95] tracking-[-0.04em] text-foreground">
        {title}
      </h1>
    </motion.div>
  );
}
