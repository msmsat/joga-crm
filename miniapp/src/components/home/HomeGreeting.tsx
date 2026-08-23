import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';

type Props = {
  /** «Доброго ранку» */
  greeting: string;
  /** Имя клиента, у гостя — тёплое обращение студии (`home.guest_name`). */
  name: string;
  /** Название студии — шапка кабинета принадлежит ей, а не Velora. */
  studioName?: string;
  /** Логотип виджета из настроек «Онлайн-запись». Нет — остаётся точка-марка. */
  logoUrl?: string | null;
};

/**
 * Шапка главной. Ростом в четыре строки: марка студии с датой, приветствие,
 * имя и девиз дня.
 *
 * Раньше имя набиралось 40px и вместе с отступами съедало треть первого экрана,
 * хотя ничего не сообщало — «Марія» человек и так про себя знает. Главный объект
 * экрана ниже (студия у гостя, занятие у клиента), поэтому шапка обязана быть
 * компактной: контраст масштабов держится микрометкой против 27px, а не высотой.
 *
 * Никакой заливки акцентом — ДС Velora прямо запрещает крупные персиковые
 * плашки, цвет на этом экране несут фотографии студий.
 */
export default function HomeGreeting({ greeting, name, studioName, logoUrl }: Props) {
  const { t, i18n } = useTranslation();

  // Дата словами — тихий контекст под «Завтра · 10:00» в карточке занятия.
  // Без дня недели: с длинным названием студии строка на 320px не помещается.
  const today = new Date().toLocaleDateString(i18n.language, {
    day: 'numeric',
    month: 'long',
  });

  return (
    <div className="pt-safe px-5">
      <div className="flex items-center justify-between gap-3 pt-5 dt:pt-16">
        {/* Марка студии — только на телефоне: на десктопе она уже стоит в
            боковом меню, второй раз в шапке это просто дубль. */}
        <div className="flex min-w-0 items-center gap-2 dt:hidden">
          {logoUrl ? (
            <img src={logoUrl} alt="" className="h-5 w-5 shrink-0 rounded-md object-cover" />
          ) : (
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
          )}
          <span className="truncate text-[10.5px] font-extrabold uppercase tracking-[0.26em] text-foreground">
            {studioName || 'Velora'}
          </span>
        </div>

        <span className="ml-auto shrink-0 text-[10.5px] font-bold uppercase tracking-[0.18em] text-muted-foreground dt:text-[11px]">
          {today}
        </span>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
        className="pt-6 dt:pt-8"
      >
        <div className="text-[13px] font-medium text-muted-foreground dt:text-[14px]">
          {greeting},
        </div>
        {/* Две строки максимум вместо обрезки: у немцев обращение к гостю —
            целая фраза («Schön, dass Sie da sind»), и многоточие вместо неё
            выглядело бы поломкой, а не длинным именем. */}
        <h1 className="mt-0.5 line-clamp-2 text-[27px] font-extrabold leading-[1.05] tracking-[-0.03em] text-foreground dt:text-[34px]">
          {name}
        </h1>

        {/* Девиз дня — единственное место экрана, где акцент студии работает
            самим текстом. Персик по жемчугу тонковат для 12px и слишком
            криклив для 27px: 15.5px с плотной посадкой — та середина, где
            строка звучит бодро и всё ещё принадлежит шапке, а не спорит с
            карточкой ниже. Появляется чуть позже имени: не вместе с ним, а
            вслед — так читается как продолжение фразы, а не как второй
            заголовок. */}
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.16, ease: [0.16, 1, 0.3, 1] }}
          className="mt-2 w-fit bg-gradient-to-r from-brand via-brand-light to-brand bg-clip-text text-[15.5px] font-extrabold leading-snug tracking-[-0.02em] text-transparent dt:mt-2.5 dt:text-[17px]"
        >
          {t('home.today_is_your_day')}
        </motion.div>
      </motion.div>
    </div>
  );
}
