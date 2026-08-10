import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import type { LoyaltyOverview } from '../../api/loyalty';

// Тот же приём, что у абонемента в профиле: главный объект экрана — единственная
// тёмная карточка. Два таких на разных страницах не спорят, потому что клиент
// видит их порознь, а внутри страницы это сразу ответ «где я стою».
const SURFACE = 'bg-foreground dark:bg-muted';
const ON_SURFACE = 'text-background dark:text-foreground';

/**
 * Карта клуба: баллы, уровень и путь до следующего.
 *
 * Баллы поданы крупной цифрой, а рядом — их цена в деньгах: балл без курса
 * ничего не значит, и «1250 балів» без «≈ 12 €» — абстракция, ради которой
 * никто не возвращается.
 *
 * Полоса считается внутри текущей ступени (от порога уровня до порога
 * следующего), а не от нуля: иначе у клиента на «Золоте» она вечно стоит
 * почти полной и перестаёт что-либо показывать.
 */
export default function LoyaltyCard({ data }: { data: LoyaltyOverview }) {
  const { t } = useTranslation();

  const floor = data.level?.min_threshold ?? 0;
  const ceiling = data.next_level?.min_threshold ?? null;
  const percent =
    ceiling !== null && ceiling > floor
      ? Math.min(Math.max(((data.total_spent - floor) / (ceiling - floor)) * 100, 0), 100)
      : 100;

  return (
    <div className="px-5">
      <div className={`overflow-hidden rounded-[24px] p-6 shadow-lift dt:rounded-[28px] dt:p-8 ${SURFACE}`}>
        <div className="flex items-start justify-between gap-4">
          <div className={`text-[9.5px] font-extrabold uppercase tracking-[0.2em] opacity-55 dt:text-[10.5px] ${ON_SURFACE}`}>
            {data.program_name}
          </div>

          {data.level && (
            <span className="flex shrink-0 items-center gap-2 rounded-full bg-white/10 px-3 py-1.5">
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ background: data.level.color }}
              />
              <span className={`text-[11px] font-extrabold tracking-[-0.01em] ${ON_SURFACE}`}>
                {data.level.name}
              </span>
            </span>
          )}
        </div>

        <div className="mt-5 flex items-baseline gap-2.5">
          <span className={`text-[46px] font-extrabold leading-none tabular-nums tracking-[-0.05em] dt:text-[56px] ${ON_SURFACE}`}>
            {data.points_balance}
          </span>
          <span className={`text-[13px] font-bold uppercase tracking-[0.14em] opacity-50 ${ON_SURFACE}`}>
            {t('club.points')}
          </span>
        </div>

        <div className={`mt-2 text-[13px] font-medium opacity-60 ${ON_SURFACE}`}>
          {t('club.points_worth', { value: data.points_value_str })}
        </div>

        <div className="mt-6 h-2 overflow-hidden rounded-full bg-white/15">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${percent}%` }}
            transition={{ duration: 0.7, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
            className="h-full rounded-full bg-brand"
          />
        </div>

        <div className={`mt-3 text-[12px] font-bold tracking-[-0.01em] opacity-70 ${ON_SURFACE}`}>
          {data.next_level && data.to_next_level_str
            ? t('club.to_next', {
                amount: data.to_next_level_str,
                level: data.next_level.name,
              })
            : t('club.level_top')}
        </div>

        <div className={`mt-1.5 text-[11.5px] font-medium opacity-45 ${ON_SURFACE}`}>
          {t('club.spent', { amount: data.total_spent_str })}
        </div>
      </div>
    </div>
  );
}
