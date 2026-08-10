import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';

type Props = {
  /** «Доброго ранку» */
  greeting: string;
  /** Имя клиента */
  name: string;
  /** Название студии — шапка кабинета принадлежит ей, а не Velora. */
  studioName?: string;
  /** Логотип виджета из настроек «Онлайн-запись». Нет — остаётся точка-марка. */
  logoUrl?: string | null;
};

/**
 * Шапка главной. Никакой заливки акцентом — ДС Velora прямо запрещает крупные
 * персиковые плашки, цвет на этом экране несут фотографии студий. Премиальность
 * здесь держится на одном приёме: разрыв масштабов между 10px меткой с широким
 * трекингом и 40px именем с плотным отрицательным.
 */
export default function HomeGreeting({ greeting, name, studioName, logoUrl }: Props) {
  const { i18n } = useTranslation();

  return (
    <div className="pt-safe px-5">
      {/* Марка студии и инициал клиента — на десктопе они уже стоят в боковом
          меню, второй раз в шапке это просто дубль. */}
      <div className="flex items-center justify-between pt-5 dt:hidden">
        <div className="flex min-w-0 items-center gap-2">
          {logoUrl ? (
            <img src={logoUrl} alt="" className="h-5 w-5 shrink-0 rounded-md object-cover" />
          ) : (
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
          )}
          <span className="truncate text-[11px] font-extrabold uppercase tracking-[0.28em] text-foreground">
            {studioName || 'Velora'}
          </span>
        </div>

        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-card text-[13px] font-extrabold text-foreground shadow-soft">
          {name.charAt(0).toUpperCase()}
        </span>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="pt-9 dt:pt-20"
      >
        <div className="text-[14px] font-medium text-muted-foreground dt:text-[15px]">
          {greeting},
        </div>
        <h1 className="mt-1 text-[40px] font-extrabold leading-[0.98] tracking-[-0.035em] text-foreground dt:mt-2 dt:text-[52px] dt:tracking-[-0.045em]">
          {name}
        </h1>

        {/* Сегодняшняя дата словами — только на десктопе: на телефоне её
            держит системная строка статуса, а здесь строка сама по себе
            подпирает имя и не даёт колонке кончиться на полуслове. */}
        <div className="mt-4 hidden text-[12px] font-extrabold uppercase tracking-[0.22em] text-muted-foreground dt:block">
          {new Date().toLocaleDateString(i18n.language, {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
          })}
        </div>
      </motion.div>
    </div>
  );
}
