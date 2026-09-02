import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Press } from '../ui/Press';
import { useTelegram } from '../../hooks/useTelegram';
import { joinCoffee, leaveCoffee, type CoffeeState } from '../../api/lessons';
import CoffeeSpots from '../coffee/CoffeeSpots';

type Props = {
  lessonId: number;
  coffee: CoffeeState;
  /** Сервер вернул новое состояние — страница обновляет своё занятие. */
  onChange: (state: CoffeeState) => void;
  /**
   * Где стоит полоска, и от этого зависит подробность.
   *
   * `card` — подвал карточки в списке «Мои занятия»: занятий там много, и
   * места сжимаются в одну строку. `sheet` — лист одного занятия: повторяться
   * нечему, показываем список целиком и без линии сверху (там полоска сама
   * себе панель, и линия читалась бы разделителем внутри блока).
   */
  variant?: 'card' | 'sheet';
};

/**
 * «Кофе после занятия» в карточке предстоящего занятия.
 *
 * Второй вход в механику для тех, кто закрыл панель после записи не глядя, и
 * единственное место, где можно передумать.
 *
 * Что видно, решает сервер, а не этот компонент: пока человек не согласился,
 * `participants` приходит пустым, и полоска честно показывает одну цифру.
 * Согласился — раскрытием открываются имена.
 *
 * Места стоят СНАРУЖИ раскрытия и не ждут согласия: это совет студии, а не
 * чьи-то данные, и прятать его за тапом значило прятать его совсем.
 *
 * Но в списке они сжаты до строки. Полоска — подвал КАЖДОЙ карточки, и полный
 * список из трёх кофеен повторялся бы на всех занятиях сразу: одинаковые три
 * строки вниз по всему экрану — это уже не совет, а обои, и они забивают
 * отсчёт и тренера. Целиком места живут там, где занятие одно: в приглашении
 * после записи и в листе занятия.
 */
export default function CoffeeStrip({ lessonId, coffee, onChange, variant = 'card' }: Props) {
  const { t } = useTranslation();
  const { vibrateLight, vibrateSuccess } = useTelegram();
  const [isSending, setIsSending] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  if (!coffee.enabled) return null;

  const isSheet = variant === 'sheet';

  const toggle = async () => {
    if (isSending) return;
    setIsSending(true);
    try {
      const next = coffee.joined ? await leaveCoffee(lessonId) : await joinCoffee(lessonId);
      onChange(next);
      if (next.joined) vibrateSuccess();
      else vibrateLight();
    } catch (err) {
      console.error('Помилка зміни статусу кави:', err);
    } finally {
      setIsSending(false);
    }
  };

  const cup = (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-3.5 w-3.5 shrink-0"
    >
      <path d="M4 9h12v6a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4z" />
      <path d="M16 10h2a3 3 0 0 1 0 6h-2" />
      <path d="M8 3v2M12 2v3" />
    </svg>
  );

  return (
    <div className={isSheet ? '' : 'mt-3 border-t border-foreground/6 pt-3'}>
      <div className="flex items-center gap-2">
        <Press
          onClick={() => {
            // Раскрывать нечего, пока человек не согласился: имён сервер не дал.
            if (!coffee.joined) return;
            vibrateLight();
            setIsExpanded((open) => !open);
          }}
          role="button"
          tabIndex={0}
          className={`flex min-w-0 flex-1 items-center gap-1.5 text-[11.5px] font-bold ${
            coffee.joined ? 'cursor-pointer text-brand' : 'text-muted-foreground'
          }`}
        >
          {cup}
          <span className="truncate">
            {coffee.count === 0 ? t('coffee.invite') : t('coffee.going', { n: coffee.count })}
          </span>
        </Press>

        <button
          type="button"
          onClick={toggle}
          disabled={isSending}
          className={`shrink-0 rounded-full px-3 py-1.5 text-[11px] font-extrabold transition-colors disabled:opacity-55 ${
            coffee.joined
              ? 'bg-muted text-muted-foreground'
              : 'bg-brand text-brand-foreground shadow-brand'
          }`}
        >
          {coffee.joined ? t('coffee.leave') : t('coffee.join')}
        </button>
      </div>

      <AnimatePresence initial={false}>
        {isExpanded && coffee.joined && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="pt-3">
              {coffee.participants.length === 0 ? (
                <p className="text-[11.5px] font-medium text-muted-foreground">
                  {t('coffee.you_first')}
                </p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {coffee.participants.map((person, i) => (
                    <span
                      key={`${person.name}-${i}`}
                      className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-[11px] font-bold text-foreground"
                    >
                      <span
                        aria-hidden="true"
                        className="h-1.5 w-1.5 rounded-full"
                        style={{ background: person.avatar_color || 'var(--v-brand)' }}
                      />
                      {person.name}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Совет студии — вне раскрытия и вне согласия: зовём в названное место. */}
      {coffee.spots.length > 0 &&
        (isSheet ? (
          <div className="mt-3">
            <CoffeeSpots spots={coffee.spots} title={t('coffee.where')} />
          </div>
        ) : (
          // Одна строка на карточку. Ссылок здесь нет намеренно: карточка сама
          // — тап по занятию, и второй тап-таргет внутри неё соперничал бы с
          // ним. Адреса и ссылки открываются в листе занятия.
          <p className="mt-2 truncate text-[11px] font-medium text-muted-foreground">
            {t('coffee.where')}:{' '}
            <span className="font-bold text-foreground">{coffee.spots[0].name}</span>
            {coffee.spots.length > 1 && ` +${coffee.spots.length - 1}`}
          </p>
        ))}
    </div>
  );
}
