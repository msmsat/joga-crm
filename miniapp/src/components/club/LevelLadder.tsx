import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/utils';
import type { LoyaltyOverview } from '../../api/loyalty';

/**
 * Лестница уровней студии — и объяснение, зачем по ней подниматься.
 *
 * Раньше это был ряд одинаковых плиток: они отвечали «какие уровни бывают», но
 * не «как я на них попадаю» и «что мне с этого». Теперь блок читается сверху
 * вниз как один рассказ: три шага механики → сама лестница с отметкой «вы
 * здесь» → сколько осталось до следующей ступени.
 *
 * Вертикаль, а не горизонтальная лента: путь наверх виден целиком, ступени не
 * уезжают за край экрана и на телефоне ничего не надо листать вбок.
 *
 * Рельс слева заполняется до текущего положения — доля внутри своей ступени
 * считается так же, как полоса на карте клуба (от порога уровня до порога
 * следующего), поэтому две шкалы на одном экране не спорят.
 *
 * Все деньги приходят с сервера уже отформатированными в валюте студии
 * (`min_threshold_str`, `point_value_str`, `earn_rate_str`): второй раз
 * форматировать их на клиенте нельзя — однажды разойдётся разделитель разрядов.
 */
export default function LevelLadder({ data }: { data: LoyaltyOverview }) {
  const { t } = useTranslation();
  const levels = data.levels;

  // Все ступени с одинаковой ценой балла — студия выгоду не настраивала.
  // Обещать «дальше будет дороже» в этом случае нельзя.
  const hasBenefit = levels.some((level) => level.point_value !== levels[0].point_value);

  const currentIndex = levels.findIndex((level) => level.is_current);
  const floor = data.level?.min_threshold ?? 0;
  const ceiling = data.next_level?.min_threshold ?? null;
  const within =
    ceiling !== null && ceiling > floor
      ? Math.min(Math.max((data.total_spent - floor) / (ceiling - floor), 0), 1)
      : 1;

  /** Доля отрезка между ступенью i и i+1, которую клиент уже прошёл. */
  const segmentFill = (i: number) => {
    if (currentIndex < 0) return 0;
    if (i < currentIndex) return 1;
    if (i === currentIndex) return within;
    return 0;
  };

  const steps = [
    {
      key: 'earn',
      text: t('club.how_earn', { rate: data.earn_rate_str }),
      icon: (
        <>
          <circle cx="12" cy="12" r="8" />
          <path d="M12 8v8M9.5 10.5h3.2a1.8 1.8 0 0 1 0 3.6H9.5" />
        </>
      ),
    },
    {
      key: 'climb',
      text: t('club.how_level'),
      icon: (
        <>
          <path d="M3 20h4v-5h5v-5h5V5h4" />
        </>
      ),
    },
    {
      key: 'value',
      text: hasBenefit
        ? t('club.how_value', { unit: data.point_unit_str })
        : t('club.info.levels_what'),
      icon: hasBenefit ? (
        <>
          <polyline points="4 15 10 9 14 13 20 6" />
          <polyline points="15 6 20 6 20 11" />
        </>
      ) : (
        <>
          <circle cx="12" cy="12" r="8" />
          <path d="M12 16v-4M12 8h.01" />
        </>
      ),
    },
  ];

  return (
    <div className="px-5">
      <div className="overflow-hidden rounded-[22px] bg-card shadow-soft dt:rounded-[26px]">
        {/* Механика — тремя шагами и своими цифрами студии: «сколько потратить
            ради балла», «откуда берётся уровень», «что уровень меняет». */}
        <div className="flex flex-col gap-3.5 p-5 dt:p-6">
          {steps.map((step, i) => (
            <motion.div
              key={step.key}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.4, delay: 0.05 + i * 0.07, ease: [0.16, 1, 0.3, 1] }}
              className="flex items-start gap-3"
            >
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand/12">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="var(--v-brand)"
                  strokeWidth="2.1"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-3.5 w-3.5"
                >
                  {step.icon}
                </svg>
              </span>
              <span className="min-w-0 pt-[3px] text-[12.5px] font-medium leading-[1.45] text-muted-foreground">
                {step.text}
              </span>
            </motion.div>
          ))}
        </div>

        <div className="mx-5 h-px bg-muted dt:mx-6" />

        {/* Сама лестница: снизу вверх по деньгам, сверху вниз по экрану. */}
        <div className="p-5 dt:p-6">
          {levels.map((level, i) => {
            const isLast = i === levels.length - 1;
            // Следующая ступень — соседняя по порядку, а не «та же по имени»:
            // имена задаёт владелец, и два «Золота» подряд ничего не сломают.
            const isNext = currentIndex >= 0 && i === currentIndex + 1;

            return (
              <motion.div
                key={`${level.name}-${i}`}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.2 + i * 0.06, ease: [0.16, 1, 0.3, 1] }}
                className={cn('relative flex gap-3.5', !isLast && 'pb-5')}
              >
                {/* Рельс между точками: серый путь и персиковая пройденная
                    часть поверх него. Отдельным отрезком на каждую ступень —
                    так он не зависит от того, одинаковой ли высоты строки. */}
                {!isLast && (
                  <span className="absolute bottom-0 left-[5px] top-4 w-[2px] overflow-hidden rounded-full bg-muted">
                    <motion.span
                      initial={{ height: 0 }}
                      animate={{ height: `${segmentFill(i) * 100}%` }}
                      transition={{ duration: 0.8, delay: 0.35 + i * 0.1, ease: [0.16, 1, 0.3, 1] }}
                      className="block w-full rounded-full bg-brand"
                    />
                  </span>
                )}

                <span className="relative mt-[3px] flex h-3 w-3 shrink-0 items-center justify-center">
                  {/* Текущая ступень — мягкий ореол вокруг точки: глазу нужно
                      место, где он стоит, раньше всех остальных цифр. */}
                  {level.is_current && (
                    <motion.span
                      initial={{ opacity: 0, scale: 0.4 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ duration: 0.5, delay: 0.45, ease: [0.16, 1, 0.3, 1] }}
                      className="absolute h-6 w-6 rounded-full"
                      style={{ background: `${level.color}2E` }}
                    />
                  )}
                  <span
                    className={cn('relative h-3 w-3 rounded-full', !level.reached && 'bg-card')}
                    style={
                      level.reached
                        ? { background: level.color }
                        : { boxShadow: `inset 0 0 0 2px ${level.color}`, opacity: 0.5 }
                    }
                  />
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                    <span
                      className={cn(
                        'text-[14px] font-extrabold tracking-[-0.02em]',
                        level.reached ? 'text-card-foreground' : 'text-muted-foreground',
                      )}
                    >
                      {level.name}
                    </span>

                    {level.is_current && (
                      <span className="rounded-full bg-brand px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.08em] text-brand-foreground">
                        {isLast ? t('club.level_top') : t('club.level_here')}
                      </span>
                    )}

                    {/* Ради этой строки блок и существует: сколько осталось до
                        следующей ступени. Сумму считает сервер. */}
                    {isNext && data.to_next_level_str && (
                      <span className="rounded-full bg-brand/12 px-2.5 py-1 text-[10.5px] font-extrabold tabular-nums text-brand">
                        {t('club.level_need', { amount: data.to_next_level_str })}
                      </span>
                    )}
                  </div>

                  <div className="mt-1 flex flex-wrap items-center gap-x-2 text-[11.5px] font-bold tabular-nums text-muted-foreground">
                    <span>{t('club.level_from', { amount: level.min_threshold_str })}</span>
                    {hasBenefit && (
                      <>
                        <span aria-hidden="true" className="opacity-40">
                          ·
                        </span>
                        <span className={cn(level.reached ? 'text-brand' : undefined)}>
                          {t('club.level_point_value', { value: level.point_value_str })}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
