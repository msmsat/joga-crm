import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Press } from '../ui/Press';
import { useTelegram } from '../../hooks/useTelegram';
import { joinCoffee, leaveCoffee, type CoffeeState } from '../../api/lessons';

type Props = {
  lessonId: number;
  coffee: CoffeeState;
  /** Сервер вернул новое состояние — страница обновляет своё занятие. */
  onChange: (state: CoffeeState) => void;
  /** Без отчёркивания сверху: в листе занятия полоска стоит своей панелью, и
   *  линия там читалась бы разделителем внутри блока, а не его границей. */
  flush?: boolean;
};

/**
 * «Кофе после занятия» в карточке предстоящего занятия.
 *
 * Второй вход в механику для тех, кто закрыл панель после записи не глядя, и
 * единственное место, где можно передумать.
 *
 * Что видно, решает сервер, а не этот компонент: пока человек не согласился,
 * `participants` приходит пустым, и полоска честно показывает одну цифру.
 * Согласился — появляются имена, а с двух человек и места от студии.
 */
export default function CoffeeStrip({ lessonId, coffee, onChange, flush = false }: Props) {
  const { t } = useTranslation();
  const { vibrateLight, vibrateSuccess } = useTelegram();
  const [isSending, setIsSending] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  if (!coffee.enabled) return null;

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
    <div className={flush ? '' : 'mt-3 border-t border-foreground/6 pt-3'}>
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

              {/* Места приходят только с двух человек — до порога идти некуда. */}
              {coffee.spots.length > 0 && (
                <div className="mt-3">
                  <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                    {t('coffee.where')}
                  </div>
                  <div className="mt-1.5 flex flex-col gap-1">
                    {coffee.spots.map((spot, i) => {
                      const label = (
                        <>
                          <span className="font-extrabold text-card-foreground">{spot.name}</span>
                          {spot.address && (
                            <span className="text-muted-foreground"> · {spot.address}</span>
                          )}
                        </>
                      );
                      // Схему проверяет и сервер (CoffeeSpotInput.validate_url), но
                      // места, сохранённые до этой проверки, уже лежат в БД — а
                      // href с `javascript:` исполняется в webview клиента.
                      const safeUrl = /^https?:\/\//i.test(spot.url ?? '') ? spot.url : null;
                      return safeUrl ? (
                        <a
                          key={`${spot.name}-${i}`}
                          href={safeUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[12px] underline decoration-brand/40 underline-offset-2"
                        >
                          {label}
                        </a>
                      ) : (
                        <span key={`${spot.name}-${i}`} className="text-[12px]">
                          {label}
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
